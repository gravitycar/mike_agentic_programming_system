import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { inWorkingHours, loadConfig, projectConfig } from './config.js';
import { actorFor } from './context.js';
import { run, runGroup } from './exec.js';
import { parseEscalations, raise } from './inbox.js';
import { configPath, expandHome, FRIDAY_BIN, fridayHome, locksDir, PLUGIN_DIR, workDir } from './paths.js';
import { loadProcess, splitCommand, type Mode, type ProcessSpec } from './spec.js';
import { Store } from './store.js';
import { createWorktree, removeWorktree } from './worktrees.js';

export interface RunOptions {
  /** One dry run in a scratch state folder, recording nothing real. */
  trial?: boolean;
  /** Run even outside working hours. */
  force?: boolean;
  /** Run only the fan-out item with this label. */
  only?: string;
  log?: (s: string) => void;
}

export interface ItemResult {
  label: string;
  outcome: 'ok' | 'failed' | 'timeout';
  sessionId?: string;
  cwd?: string;
  cost?: number;
  escalations: number;
  summary: string;
}

export interface RunResult {
  outcome: 'skipped' | 'outside-hours' | 'locked' | 'ok' | 'failed';
  items: ItemResult[];
  message?: string;
}

/** The rules every agent gets, whatever its process. */
export function agentPreamble(spec: ProcessSpec, mode: Mode, item: unknown): string {
  return [
    `You are a Friday background agent running the "${spec.name}" process, unattended, for Mike Andersen.`,
    '',
    '## Rules that always apply',
    '- Never merge a merge request, never set one to merge automatically, and never push to a default branch. Mike merges every MR by hand.',
    '- Take outward actions (anything GitLab or a colleague sees) only through the `friday act` command. It enforces this process\'s allowed actions and its mode.',
    '- Read from GitLab with `friday gl get <api path>`. Do not call `glab` or `curl` yourself.',
    '- Nobody can answer you during this run. Settle what you can; escalate the rest (below).',
    '- Run one simple command per Bash call: no `&&` or `;` chains, no `$(...)`, no pipes into other programs. This run is unattended, so any command it cannot match to an allowed tool is denied. Prefer the Read, Grep, and Glob tools for reading files. One denied command does not mean every command is denied: try a simpler form before giving up.',
    mode === 'dry-run'
      ? '- This process is in DRY-RUN mode: `friday act` records each action as "would do" and takes none. Still decide and run every action you would take, so Mike can review the decisions.'
      : '- This process is LIVE: `friday act` performs real actions.',
    '',
    '## Escalating to Mike',
    'End your final message with an ESCALATIONS block. One line per item that needs Mike, or "- none":',
    '```',
    'ESCALATIONS:',
    '- <group/project>!<mr number> | <short subject key> | <one-line summary of what Mike must decide or do>',
    '```',
    'The subject key names the thing (a discussion id, a pipeline id). Mike sees the summary in his menu bar and can resume this session to answer you.',
    'If Mike later resumes this session and you finish what he asked, run `friday settle --cwd "$PWD"` as your last step.',
    '',
    '## This run',
    `Mode: ${mode}`,
    'Item:',
    '```json',
    JSON.stringify(item, null, 2),
    '```',
  ].join('\n');
}

function acquireLock(name: string): (() => void) | null {
  fs.mkdirSync(locksDir(), { recursive: true });
  const file = path.join(locksDir(), `${name}.lock`);
  if (fs.existsSync(file)) {
    const pid = Number(fs.readFileSync(file, 'utf8'));
    try {
      if (pid) {
        process.kill(pid, 0);
        return null;
      }
    } catch {
      /* stale lock: its process is gone */
    }
    fs.rmSync(file, { force: true });
  }
  try {
    fs.writeFileSync(file, String(process.pid), { flag: 'wx' });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'EEXIST') return null;
    throw e;
  }
  return () => fs.rmSync(file, { force: true });
}

function agentEnv(spec: ProcessSpec, mode: Mode, item: unknown, cwd: string): NodeJS.ProcessEnv {
  const binDir = path.dirname(FRIDAY_BIN);
  return {
    ...process.env,
    PATH: `${binDir}:${process.env.PATH ?? ''}`,
    FRIDAY_AGENT: '1',
    FRIDAY_PROCESS: spec.name,
    FRIDAY_MODE: mode,
    FRIDAY_HOME: fridayHome(),
    FRIDAY_ITEM: JSON.stringify(item),
    FRIDAY_WORKTREE: cwd,
  };
}

/** Hosts no sandboxed command may reach, whatever a process allows. */
export const DENIED_DOMAINS = ['gitlab.com', '*.gitlab.com', 'github.com', '*.github.com'];

/**
 * Claude Code sandbox settings: every Bash command, and every program it starts,
 * is sandboxed. Only a top-level `friday` command runs outside, and inside an
 * agent `friday` allows only its checked actions. Tested: a sandboxed program
 * that starts `friday` stays sandboxed and cannot reach GitLab.
 */
export function sandboxSettings(allowed: string[]) {
  return {
    sandbox: {
      enabled: true,
      failIfUnavailable: true,
      allowUnsandboxedCommands: false,
      excludedCommands: ['friday', 'friday *'],
      network: { allowedDomains: allowed, deniedDomains: DENIED_DOMAINS },
    },
  };
}

export function claudeArgs(spec: ProcessSpec, label: string): string[] {
  const args = ['-p', '--plugin-dir', PLUGIN_DIR, '--model', spec.model, '--max-budget-usd', String(spec.maxBudgetUsd), '--permission-mode', spec.permissionMode];
  if (spec.sandboxDomains) args.push('--settings', JSON.stringify(sandboxSettings(spec.sandboxDomains)));
  if (spec.allowedTools.length) args.push('--allowed-tools', ...spec.allowedTools);
  if (spec.disallowedTools.length) args.push('--disallowed-tools', ...spec.disallowedTools);
  args.push('-n', `friday-${spec.name}-${label}`.toLowerCase().replace(/[^a-z0-9-]+/g, '-'), '--output-format', 'json');
  return args;
}

async function runAgentItem(spec: ProcessSpec, mode: Mode, item: Record<string, unknown>, store: Store, trial: boolean, log: (s: string) => void): Promise<ItemResult> {
  const label = String(item.label ?? 'run');
  const runId = store.startRun(spec.name, label, mode);
  const startedIso = new Date().toISOString();
  let cwd: string;
  let clone: string | undefined;
  try {
    if (spec.cwd === 'worktree') {
      const project = String(item.project);
      const pc = projectConfig(loadConfig(), project);
      clone = pc.clone;
      cwd = createWorktree(pc.clone, project, String(item.branch), `${spec.name}-mr-${item.mr}`);
    } else {
      cwd = spec.cwd === 'work' ? path.join(workDir(), spec.name, label) : expandHome(spec.cwd);
      fs.mkdirSync(cwd, { recursive: true });
    }
  } catch (e) {
    const summary = `could not prepare a working folder: ${String(e).slice(0, 300)}`;
    store.endRun(runId, { outcome: 'failed', summary });
    raise(store, null, { process: spec.name, project: (item.project as string) ?? null, mr: (item.mr as number) ?? null, subject: `setup:${label}`, summary, sessionId: null, cwd: null, mode });
    return { label, outcome: 'failed', escalations: 1, summary };
  }

  const body = spec.prompt.replaceAll('{plugin_dir}', PLUGIN_DIR);
  const prompt = `${body}\n\n${agentPreamble(spec, mode, item)}`;
  log(`[${spec.name}] ${label}: starting agent in ${cwd}`);
  const r = await runGroup('claude', claudeArgs(spec, label), { cwd, input: prompt, env: agentEnv(spec, mode, item, cwd), timeoutMs: spec.timeoutMs });

  let parsed: { type?: string; result?: string; session_id?: string; total_cost_usd?: number; is_error?: boolean; subtype?: string } = {};
  try {
    parsed = JSON.parse(r.stdout.trim().split('\n').pop() ?? '{}');
  } catch {
    /* not JSON: treated as a failure below */
  }
  const resultText = parsed.result ?? '';
  const readable = parsed.type === 'result' || typeof parsed.session_id === 'string';
  const outcome: ItemResult['outcome'] = r.timedOut ? 'timeout' : r.code === 0 && readable && !parsed.is_error ? 'ok' : 'failed';
  const actor = actorFor(spec.name, store, undefined, mode);

  const escs = parseEscalations(resultText);
  if (outcome !== 'ok') {
    escs.push({
      project: (item.project as string) ?? null,
      mr: (item.mr as number) ?? null,
      subject: `agent-${outcome}:${label}`,
      summary: `${spec.name} agent ${outcome === 'timeout' ? 'timed out' : 'failed'}${parsed.subtype ? ` (${parsed.subtype})` : ''}: ${(r.stderr || resultText).trim().slice(0, 200)}`,
    });
  }
  for (const e of escs) {
    raise(store, actor, { ...e, process: spec.name, sessionId: parsed.session_id ?? null, cwd, mode });
  }

  if (!trial) {
    const keys = (item.handled_keys as string[] | undefined) ?? [];
    const pushFailed = typeof item.mr === 'number' && store.countActions({ process: spec.name, action: 'push_branch', mr: item.mr, ok: false, sinceIso: startedIso }) > 0;
    if (outcome === 'ok' && !pushFailed) {
      for (const k of keys) store.markHandled(spec.name, k);
    } else if (outcome !== 'ok') {
      // A failed or timed-out item is tried once more, then left to its escalation,
      // so it does not rerun at full budget on every schedule.
      for (const k of keys) {
        const n = Number(store.step(`attempts:${spec.name}:${k}`) ?? 0) + 1;
        store.setStep(`attempts:${spec.name}:${k}`, String(n));
        if (n >= 2) store.markHandled(spec.name, k);
      }
    }
  }

  // A trial leaves nothing behind in Mike's clones.
  if (trial && clone) removeWorktree(clone, cwd);
  // A work folder may hold downloaded artifacts, which can contain secrets. Empty it,
  // but keep the folder: Claude finds a session to resume by its folder.
  if (spec.cwd === 'work') {
    for (const f of fs.readdirSync(cwd)) fs.rmSync(path.join(cwd, f), { recursive: true, force: true });
  }

  const summary = resultText.split('\nESCALATIONS:')[0].trim().slice(0, 2000);
  store.endRun(runId, { outcome, cost: parsed.total_cost_usd, sessionId: parsed.session_id, cwd, summary });
  log(`[${spec.name}] ${label}: ${outcome}, ${escs.length} escalation(s), $${(parsed.total_cost_usd ?? 0).toFixed(2)}`);
  return { label, outcome, sessionId: parsed.session_id, cwd, cost: parsed.total_cost_usd, escalations: escs.length, summary };
}

async function inBatches<T, R>(items: T[], size: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  return out;
}

export async function runProcess(name: string, opts: RunOptions = {}): Promise<RunResult> {
  const log = opts.log ?? ((s: string) => console.log(s));
  if (opts.trial) {
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'friday-trial-'));
    if (fs.existsSync(configPath())) fs.copyFileSync(configPath(), path.join(scratch, 'config.json'));
    process.env.FRIDAY_HOME = scratch;
    log(`Trial run: scratch state in ${scratch}`);
  }
  const spec = loadProcess(name);
  const cfg = loadConfig();
  if (!opts.trial && !opts.force && spec.schedule !== 'manual' && !inWorkingHours(cfg)) {
    return { outcome: 'outside-hours', items: [] };
  }
  const release = acquireLock(name);
  if (!release) return { outcome: 'locked', items: [], message: 'a run is still going' };
  const store = new Store();
  try {
    const mode: Mode = opts.trial ? 'dry-run' : store.mode(name, spec.defaultMode);
    const env = { ...process.env, FRIDAY_PROCESS: name, FRIDAY_MODE: mode, FRIDAY_HOME: fridayHome() };

    let checkOut = '';
    if (spec.precheck) {
      const [cmd, ...args] = splitCommand(spec.precheck, FRIDAY_BIN);
      const pr = run(cmd, args, { env, timeoutMs: 10 * 60_000 });
      store.setStep(`lastcheck:${name}`, new Date().toISOString());
      if (pr.code === 0 || pr.code === 3) {
        for (const e of store.openFor({ process: name, subject: 'precheck-failed' })) store.settle(e.id, 'the precheck ran cleanly again');
      }
      if (pr.code === 3) return { outcome: 'skipped', items: [] };
      if (pr.code !== 0) {
        const summary = `precheck failed: ${(pr.stderr || pr.stdout).trim().slice(0, 300)}`;
        raise(store, null, { process: name, project: null, mr: null, subject: 'precheck-failed', summary, sessionId: null, cwd: null, mode });
        return { outcome: 'failed', items: [], message: summary };
      }
      checkOut = pr.stdout;
    }

    if (spec.command) {
      const runId = store.startRun(name, null, mode);
      const [cmd, ...args] = splitCommand(spec.command, FRIDAY_BIN);
      const cr = run(cmd, args, { env, input: checkOut, timeoutMs: spec.timeoutMs });
      const outcome = cr.code === 0 ? 'ok' : cr.code === 3 ? 'skipped' : 'failed';
      store.endRun(runId, { outcome, summary: (cr.stdout + cr.stderr).trim().slice(0, 2000) });
      return { outcome: outcome === 'failed' ? 'failed' : 'ok', items: [] };
    }

    let payload: unknown = {};
    if (checkOut.trim()) payload = JSON.parse(checkOut);
    const items = spec.fanOut
      ? (((payload as Record<string, unknown>)[spec.fanOut] as Record<string, unknown>[] | undefined) ?? [])
      : [payload as Record<string, unknown>];
    const chosen = opts.only ? items.filter((i) => i.label === opts.only) : items;
    if (chosen.length === 0) return { outcome: 'skipped', items: [], message: opts.only ? `no item labelled ${opts.only}` : undefined };
    const results = await inBatches(chosen, spec.maxParallel, (it) => runAgentItem(spec, mode, it, store, !!opts.trial, log));
    return { outcome: results.every((r) => r.outcome === 'ok') ? 'ok' : 'failed', items: results };
  } finally {
    store.close();
    release();
  }
}
