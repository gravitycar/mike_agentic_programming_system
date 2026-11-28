#!/usr/bin/env node
import * as fs from 'fs';
import * as path from 'path';
import { loadConfig, writeDefaultConfig } from './config.js';
import { actorFor, agentActor } from './context.js';
import { run } from './exec.js';
import { GitLab, pid } from './gitlab.js';
import { raise, resume, settle, swiftbarMenu } from './inbox.js';
import { spawnSync } from 'child_process';
import * as launchd from './launchd.js';
import * as os from 'os';
import { dryRunDir, FRIDAY_BIN, fridayHome, PLUGIN_DIR, REPO_DIR } from './paths.js';
import { pipelineWatchPrecheck } from './processes/pipeline-watch/precheck.js';
import { jobLogTail, rebuildReviewEnv } from './processes/pipeline-watch/rebuild.js';
import { reviewResponderPrecheck } from './processes/review-responder/precheck.js';
import { runProcess } from './runner.js';
import { offer, openMr, ruleOut, runWorker, SCOUT, scoutPrecheck, start } from './qw.js';
import { Shortcut } from './shortcut.js';
import { listProcesses, loadProcess, type Mode } from './spec.js';
import { Store } from './store.js';
import { pushBranch } from './worktrees.js';

type Flags = Record<string, string | true>;

function parse(argv: string[]): { pos: string[]; flags: Flags } {
  const pos: string[] = [];
  const flags: Flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        flags[k] = next;
        i++;
      } else flags[k] = true;
    } else pos.push(a);
  }
  return { pos, flags };
}

const str = (f: Flags, k: string): string | undefined => (typeof f[k] === 'string' ? (f[k] as string) : undefined);
const need = (f: Flags, k: string): string => {
  const v = str(f, k);
  if (v === undefined) throw new Error(`--${k} is required`);
  return v;
};
const out = (v: unknown) => console.log(typeof v === 'string' ? v : JSON.stringify(v, null, 2));
const callerCwd = () => process.env.FRIDAY_CALLER_CWD ?? process.cwd();
const item = (): Record<string, unknown> => JSON.parse(process.env.FRIDAY_ITEM ?? '{}');

const USAGE = `friday <command>

  run <process> [--trial] [--force] [--only <label>]   Run a process once (--trial: dry run in scratch state)
  list                                  List processes, their modes and schedules
  status [process]                      Modes, recent runs, actions, and cost
  mode <process> dry-run|live           Switch a process's mode
  schedule add|remove|pause|resume <process>   Manage a process's launchd schedule
  pause --all | resume --all            Stop or restart every schedule
  inbox [--swiftbar]                    Open escalations
  escalate --summary <s> [--project p --mr n --subject k --process name]
  settle <id> [--reason r] | settle --cwd <dir>
  resume <id>                           Open Terminal and resume the escalation's session
  setup [--swiftbar] [--plugin]         Write config, point SwiftBar at the inbox, install the plugin
  precheck <process>                    (internal) Run a built-in precheck
  act <action> ...                      (agents) Take an outward action through Friday
  gl get <api path> | gl log --job <id> [--project p] [--tail n] | gl artifacts --job <id> --out <zip>
`;

async function main(argv: string[]): Promise<number> {
  const [cmd, ...rest] = argv;
  const { pos, flags } = parse(rest);

  // An agent may act, read GitLab, escalate, and settle its own session. It may
  // not change modes, schedules, or setup, or settle anything else.
  if (process.env.FRIDAY_AGENT === '1') {
    const scoutCmd = process.env.FRIDAY_PROCESS === SCOUT && ((cmd === 'qw' && (pos[0] === 'offer' || pos[0] === 'rule-out')) || cmd === 'sc');
    const allowed = cmd === 'act' || cmd === 'gl' || cmd === 'escalate' || cmd === 'help' || scoutCmd || (cmd === 'settle' && str(flags, 'cwd') !== undefined);
    if (!allowed) throw new Error(`Friday agents may not run \`friday ${cmd}\`. Use act, gl, escalate, or settle --cwd.`);
  }

  switch (cmd) {
    case undefined:
    case 'help':
    case '--help':
      out(USAGE);
      return 0;

    case 'run': {
      const r = await runProcess(pos[0], { trial: !!flags.trial, force: !!flags.force, only: str(flags, 'only') });
      if (r.outcome !== 'skipped' && r.outcome !== 'outside-hours') out(r);
      return r.outcome === 'failed' ? 1 : 0;
    }

    case 'list': {
      const store = new Store();
      for (const p of listProcesses()) {
        const mode = store.mode(p.name, p.defaultMode);
        const sched = store.scheduleState(p.name) ?? 'not scheduled';
        out(`${p.name.padEnd(18)} ${mode.padEnd(8)} ${p.schedule.padEnd(10)} ${sched.padEnd(14)} ${p.description}`);
      }
      store.close();
      return 0;
    }

    case 'status': {
      const store = new Store();
      const day = new Date(Date.now() - 864e5).toISOString();
      const week = new Date(Date.now() - 7 * 864e5).toISOString();
      const procs = pos[0] ? [loadProcess(pos[0])] : listProcesses();
      for (const p of procs) {
        const mode = store.mode(p.name, p.defaultMode);
        out(`\n## ${p.name} — ${mode}, ${store.scheduleState(p.name) ?? 'not scheduled'} (${p.schedule})`);
        out(`Last check: ${store.step(`lastcheck:${p.name}`) ?? 'never'}`);
        out(`Cost: $${store.costSince(p.name, day).toFixed(2)} last day, $${store.costSince(p.name, week).toFixed(2)} last week`);
        const acts = store.actionsSince(p.name, week);
        if (acts.length) out('Actions (last week): ' + acts.map((a) => `${a.action}${a.mode === 'dry-run' ? ' (would)' : ''} ×${a.n}`).join(', '));
        for (const r of store.recentRuns(p.name)) {
          out(`  run ${r.id} ${r.started_at.slice(0, 16)} ${r.item ?? ''} ${r.outcome ?? 'running'} $${(r.cost_usd ?? 0).toFixed(2)}${r.summary ? ' — ' + r.summary.split('\n')[0].slice(0, 120) : ''}`);
        }
        if (mode === 'dry-run') {
          for (const a of store.recentActions(p.name, 10).filter((a) => a.mode === 'dry-run')) {
            const text = (a.detail ?? '').replace(loadConfig().replyHeader, '').trim().split('\n')[0].slice(0, 140);
            out(`  would ${a.action} ${a.project ?? ''}${a.mr ? '!' + a.mr : ''} ${a.subject ?? ''}${text ? ' — ' + text : ''}`);
          }
        }
      }
      const open = store.openEscalations();
      out(`\nOpen escalations: ${open.length}`);
      store.close();
      return 0;
    }

    case 'mode': {
      const [name, mode] = pos;
      if (mode !== 'dry-run' && mode !== 'live') throw new Error('mode must be dry-run or live');
      loadProcess(name);
      const store = new Store();
      store.setMode(name, mode as Mode);
      store.close();
      out(`${name} is now ${mode}.`);
      return 0;
    }

    case 'schedule': {
      const [verb, name] = pos;
      const store = new Store();
      try {
        const spec = loadProcess(name);
        if (verb === 'add' || verb === 'resume') {
          out(`Scheduled: ${launchd.install(name, spec.schedule)}`);
          store.setScheduleState(name, 'active');
        } else if (verb === 'pause') {
          launchd.unload(name);
          store.setScheduleState(name, 'paused');
          out(`${name} paused.`);
        } else if (verb === 'remove') {
          launchd.uninstall(name);
          store.setScheduleState(name, null);
          out(`${name} unscheduled.`);
        } else throw new Error('schedule add|remove|pause|resume <process>');
      } finally {
        store.close();
      }
      return 0;
    }

    case 'pause':
    case 'resume': {
      if (cmd === 'resume' && !flags.all) {
        const store = new Store();
        const e = store.escalation(Number(pos[0]));
        store.close();
        if (!e) throw new Error(`No escalation ${pos[0]}`);
        resume(e);
        return 0;
      }
      if (!flags.all) throw new Error('Use --all');
      const store = new Store();
      for (const p of listProcesses()) {
        const st = store.scheduleState(p.name);
        if (cmd === 'pause' && st === 'active') {
          launchd.unload(p.name);
          store.setScheduleState(p.name, 'paused');
          out(`${p.name} paused.`);
        } else if (cmd !== 'pause' && st === 'paused') {
          launchd.install(p.name, p.schedule);
          store.setScheduleState(p.name, 'active');
          out(`${p.name} resumed.`);
        }
      }
      store.close();
      return 0;
    }

    case 'inbox': {
      const store = new Store();
      const open = store.openEscalations();
      store.close();
      if (flags.swiftbar) {
        process.stdout.write(swiftbarMenu(open));
        return 0;
      }
      if (open.length === 0) out('Nothing needs you.');
      for (const e of open) {
        out(`#${e.id} ${e.mode === 'dry-run' ? '[dry run] ' : ''}${e.process} ${e.project && e.mr ? `${e.project}!${e.mr}` : 'general'} — ${e.summary}`);
      }
      return 0;
    }

    case 'escalate': {
      const store = new Store();
      const proc = str(flags, 'process') ?? process.env.FRIDAY_PROCESS ?? 'manual';
      const project = str(flags, 'project') ?? null;
      const mr = str(flags, 'mr') ? Number(str(flags, 'mr')) : null;
      let actor = null;
      try {
        actor = proc === 'manual' ? null : actorFor(proc, store);
      } catch {
        actor = null;
      }
      const id = raise(store, actor, {
        process: proc,
        project,
        mr,
        subject: str(flags, 'subject') ?? null,
        summary: need(flags, 'summary'),
        sessionId: str(flags, 'session') ?? null,
        cwd: str(flags, 'cwd') ?? null,
        mode: actor?.mode ?? 'live',
      });
      store.close();
      out(`Escalation #${id} raised.`);
      return 0;
    }

    case 'settle': {
      const store = new Store();
      const reason = str(flags, 'reason') ?? 'settled';
      if (process.env.FRIDAY_AGENT === '1' && path.resolve(str(flags, 'cwd') ?? '') !== path.resolve(process.env.FRIDAY_WORKTREE ?? '/nonexistent')) {
        throw new Error('An agent may settle only the escalations of its own working folder.');
      }
      const ids = str(flags, 'cwd')
        ? store.openFor({ cwd: path.resolve(str(flags, 'cwd')!) }).map((e) => e.id)
        : [Number(pos[0])];
      for (const id of ids) {
        const e = store.escalation(id);
        if (!e) continue;
        let actor = null;
        try {
          actor = actorFor(e.process, store, undefined, e.mode);
        } catch {
          actor = null;
        }
        settle(store, actor, id, reason);
      }
      store.close();
      out(`Settled ${ids.length} escalation(s).`);
      return 0;
    }

    case 'setup': {
      out(`Config: ${writeDefaultConfig()}`);
      const store = new Store();
      store.close();
      out(`State: ${fridayHome()}`);
      const binLink = path.join(os.homedir(), '.local', 'bin', 'friday');
      fs.mkdirSync(path.dirname(binLink), { recursive: true });
      fs.rmSync(binLink, { force: true });
      fs.symlinkSync(FRIDAY_BIN, binLink);
      out(`Command: ${binLink}`);
      if (flags.swiftbar) {
        const dir = path.join(fridayHome(), 'swiftbar');
        fs.mkdirSync(dir, { recursive: true });
        const link = path.join(dir, 'friday.1m.sh');
        fs.rmSync(link, { force: true });
        fs.symlinkSync(path.join(PLUGIN_DIR, 'inbox', 'friday.1m.sh'), link);
        run('defaults', ['write', 'com.ameba.SwiftBar', 'PluginDirectory', dir]);
        out(`SwiftBar plugin folder: ${dir}`);
      }
      if (flags.plugin) {
        const m = run('claude', ['plugin', 'marketplace', 'add', REPO_DIR]);
        out(m.stdout.trim() || m.stderr.trim());
        const i = run('claude', ['plugin', 'install', 'friday@mike-maps']);
        out(i.stdout.trim() || i.stderr.trim());
      }
      return 0;
    }

    case 'precheck': {
      const store = new Store();
      try {
        let items: unknown[];
        if (pos[0] === 'hello') items = [{ label: 'hello' }];
        else if (pos[0] === 'pipeline-watch') items = pipelineWatchPrecheck(store);
        else if (pos[0] === 'review-responder') items = reviewResponderPrecheck(store);
        else if (pos[0] === SCOUT) items = await scoutPrecheck(store);
        else throw new Error(`No built-in precheck for ${pos[0]}`);
        if (items.length === 0) return 3;
        out({ items });
        return 0;
      } finally {
        store.close();
      }
    }

    case 'gl': {
      const gl = new GitLab();
      const project = str(flags, 'project') ?? (item().project as string | undefined);
      if (pos[0] === 'get') {
        out(gl.get(pos[1], !!flags.paginate));
      } else if (pos[0] === 'log') {
        if (!project) throw new Error('--project is required');
        out(jobLogTail(gl, project, Number(need(flags, 'job')), Number(str(flags, 'tail') ?? 300)));
      } else if (pos[0] === 'artifacts') {
        if (!project) throw new Error('--project is required');
        const dest = path.resolve(callerCwd(), need(flags, 'out'));
        const r = spawnSync('glab', ['api', `projects/${pid(project)}/jobs/${need(flags, 'job')}/artifacts`], { maxBuffer: 512 * 1024 * 1024 });
        if (r.status !== 0) throw new Error(String(r.stderr));
        fs.writeFileSync(dest, r.stdout);
        out(`Saved ${dest}`);
      } else throw new Error('gl get|log|artifacts');
      return 0;
    }

    case 'sc': {
      const sc = new Shortcut();
      if (pos[0] === 'search') {
        const found = await sc.search(pos.slice(1).join(' '), Number(str(flags, 'max') ?? 50));
        out(found.map((s) => ({ id: s.id, name: s.name, state: s.workflow_state_id, owners: s.owner_ids.length, type: s.story_type, created: s.created_at.slice(0, 10), url: s.app_url })));
      } else if (pos[0] === 'story') {
        const s = await sc.story(Number(pos[1]));
        out({ id: s.id, name: s.name, state: s.workflow_state_id, owners: s.owner_ids.length, type: s.story_type, epic: s.epic_id, url: s.app_url, description: (s.description ?? '').slice(0, 4000) });
      } else throw new Error('sc search <query> | sc story <id>');
      return 0;
    }

    case 'qw': {
      const store = new Store();
      try {
        if (pos[0] === 'offer') {
          const id = offer(store, { story: Number(need(flags, 'story')), name: need(flags, 'name'), repo: need(flags, 'repo'), reason: need(flags, 'reason'), duplicates: str(flags, 'duplicates') });
          out(`Offered as inbox item #${id}.`);
        } else if (pos[0] === 'rule-out') {
          ruleOut(store, { story: Number(need(flags, 'story')), name: str(flags, 'name'), reason: need(flags, 'reason') });
          out('Ruled out.');
        } else if (pos[0] === 'start') {
          out(start(store, Number(pos[1])));
        } else if (pos[0] === 'open-mr') {
          out(await openMr(store, Number(pos[1])));
        } else if (pos[0] === 'run-worker') {
          out(await runWorker(store, Number(pos[1])));
        } else if (pos[0] === 'status') {
          const rows = store.db.prepare('SELECT story_id, state, repo, branch, reason, updated_at FROM quickwins ORDER BY updated_at DESC LIMIT 20').all();
          out(rows);
        } else throw new Error('qw offer|rule-out|start <item>|open-mr <item>|run-worker <story>|status');
      } finally {
        store.close();
      }
      return 0;
    }

    case 'act':
      return act(pos, flags);

    default:
      out(USAGE);
      return 2;
  }
}

async function act(pos: string[], flags: Flags): Promise<number> {
  const store = new Store();
  try {
    const actor = agentActor(store);
    const it = item();
    const project = str(flags, 'project') ?? (it.project as string | undefined);
    const mr = str(flags, 'mr') ? Number(str(flags, 'mr')) : (it.mr as number | undefined);
    const report = (r: { dryRun: boolean }, what: string) => out(r.dryRun ? `DRY RUN: would ${what}` : `Done: ${what}`);
    const needPM = () => {
      if (!project || !mr) throw new Error('--project and --mr are required');
      return { project, mr };
    };
    const cfg = loadConfig();

    switch (pos[0]) {
      case 'retry-job': {
        const p = project ?? need(flags, 'project');
        const jobId = Number(need(flags, 'job'));
        const pipe = it.pipeline as { id: number } | undefined;
        const fj = (it.failed_jobs as { id: number; name: string }[] | undefined)?.find((j) => j.id === jobId);
        const subject = pipe && fj ? `pipeline:${pipe.id}:job:${fj.name}` : `job:${jobId}`;
        if (pipe && fj && store.countActions({ process: actor.process, action: 'retry_job', subjectLike: subject, mode: actor.mode }) >= 2) {
          throw new Error(`${fj.name} was already retried twice in this pipeline. Escalate instead.`);
        }
        report(actor.retryJob(p, jobId, { mr, subject, detail: str(flags, 'why') }), `retry job ${jobId}`);
        return 0;
      }
      case 'play-job': {
        const p = project ?? need(flags, 'project');
        report(actor.playJob(p, Number(need(flags, 'job')), { mr, detail: str(flags, 'why') }), `play job ${flags.job}`);
        return 0;
      }
      case 'label': {
        const { project: p, mr: m } = needPM();
        const label = need(flags, 'name');
        if (flags.remove) report(actor.removeLabel(p, m, label), `remove label ${label}`);
        else report(actor.addLabel(p, m, label), `add label ${label}`);
        return 0;
      }
      case 'reply': {
        const { project: p, mr: m } = needPM();
        const text = fs.readFileSync(path.resolve(callerCwd(), need(flags, 'file')), 'utf8').trim();
        const body = `${cfg.replyHeader}\n\n${text}`;
        report(actor.postReply(p, m, need(flags, 'discussion'), body), `reply on discussion ${flags.discussion}: ${text.split('\n')[0].slice(0, 80)}`);
        return 0;
      }
      case 'react': {
        const { project: p, mr: m } = needPM();
        const name = str(flags, 'name') ?? 'robot';
        report(actor.addReaction(p, m, Number(need(flags, 'note')), name), `react :${name}: on note ${flags.note}`);
        return 0;
      }
      case 'push': {
        const { project: p, mr: m } = needPM();
        const wt = process.env.FRIDAY_WORKTREE ?? callerCwd();
        const branch = (it.branch as string | undefined) ?? need(flags, 'branch');
        const target = (it.target_branch as string | undefined) ?? 'master';
        const dirty = run('git', ['-C', wt, 'status', '--porcelain']).stdout.trim();
        if (dirty) throw new Error(`Commit your changes before pushing. Uncommitted:\n${dirty}`);
        const patch = run('git', ['-C', wt, 'format-patch', `origin/${branch}..HEAD`, '--stdout']).stdout;
        if (!patch.trim()) {
          out('Nothing to push: no new commits.');
          return 0;
        }
        let detail = `${patch.split('\nSubject: ').length - 1} commit(s)`;
        if (actor.mode === 'dry-run') {
          fs.mkdirSync(dryRunDir(), { recursive: true });
          const f = path.join(dryRunDir(), `${actor.process}-${p.split('/').pop()}-${m}-${Date.now()}.patch`);
          fs.writeFileSync(f, patch);
          detail += `, patch saved to ${f}`;
        }
        const r = actor.act('push_branch', { project: p, mr: m, subject: `branch:${branch}`, detail }, () => {
          const res = pushBranch(wt, branch, target);
          if (!res.ok) throw new Error(`Push rejected (origin moved?): ${res.message}`);
          return res;
        });
        report(r, `push ${detail} to ${branch}`);
        return 0;
      }
      case 'rebuild-review-env': {
        const { project: p, mr: m } = needPM();
        const r = await rebuildReviewEnv(store, actor, p, m);
        out(r);
        return r.status === 'failed' || r.status === 'refused' ? 1 : 0;
      }
      default:
        throw new Error('act retry-job|play-job|label|reply|react|push|rebuild-review-env');
    }
  } finally {
    store.close();
  }
}

// Set exitCode rather than calling process.exit(): output to a pipe is written
// asynchronously, and exiting at once would cut it off at 64 KB.
main(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code;
  })
  .catch((e) => {
    console.error(String(e instanceof Error ? e.message : e));
    process.exitCode = 1;
  });
