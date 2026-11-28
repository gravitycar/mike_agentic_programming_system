import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { loadConfig, projectConfig, type FridayConfig } from './config.js';
import { actorFor, effectiveMode } from './context.js';
import { run, type ExecResult } from './exec.js';
import { GitLab, pid } from './gitlab.js';
import { parseEscalations, raise, settle } from './inbox.js';
import { notify } from './notify.js';
import { FRIDAY_BIN, locksDir, logsDir } from './paths.js';
import { loadProcess, type Mode } from './spec.js';
import { Shortcut, type Story } from './shortcut.js';
import type { Escalation, QuickWin, Store } from './store.js';
import { createWorktree } from './worktrees.js';

export const SCOUT = 'quick-wins-scout';
export const WORKER = 'quick-wins-worker';
const PROTECTED = new Set(['master', 'main', 'develop']);

export const shq = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

// --- Bartleby ---------------------------------------------------------------

/** Runs a shell script on Bartleby, as Mike or as the worker user. */
export function remote(cfg: FridayConfig, script: string, opts: { asWorker?: boolean; input?: string; timeoutMs?: number } = {}): ExecResult {
  const q = cfg.quickWins;
  const inner = opts.asWorker ? `sudo -n -u ${q.workerUser} -H bash -l -c ${shq(`cd ~ && ${script}`)}` : `bash -l -c ${shq(script)}`;
  return run('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', q.host, inner], { input: opts.input, timeoutMs: opts.timeoutMs ?? 120_000 });
}

export function bartlebyOnline(cfg: FridayConfig): boolean {
  return remote(cfg, 'true', { timeoutMs: 20_000 }).code === 0;
}

// --- Eligibility and order ---------------------------------------------------

const PRIORITY_RANK: Record<string, number> = { highest: 0, urgent: 0, high: 1, medium: 2, low: 3, lowest: 4 };

function priorityRank(s: Story, priorityValues: Map<string, string>): number {
  for (const f of s.custom_fields ?? []) {
    const name = priorityValues.get(f.field_id) ? f.value : undefined;
    if (name) return PRIORITY_RANK[name.toLowerCase()] ?? 5;
  }
  return 5;
}

/** Eligible stories, best first: current iteration, then priority, then oldest. */
export async function eligibleStories(sc: Shortcut, cfg: FridayConfig, exclude: Set<number>): Promise<Story[]> {
  const q = cfg.quickWins;
  if (!q.memberId || !q.mentionName) throw new Error('Set quickWins.memberId and quickWins.mentionName in ~/.friday/config.json.');
  const base = `state:"${q.readyStateName}" !is:archived`;
  const [team, mine, iterations] = await Promise.all([
    sc.search(`${base} team:"${q.teamName}"`),
    sc.search(`${base} owner:${q.mentionName}`),
    sc.currentIterations().catch(() => new Set<number>()),
  ]);
  const byId = new Map<number, Story>();
  for (const s of team) if (s.owner_ids.length === 0 && s.group_id === q.teamId) byId.set(s.id, s);
  for (const s of mine) if (s.owner_ids.includes(q.memberId)) byId.set(s.id, s);
  const stories = [...byId.values()].filter((s) => !s.archived && !exclude.has(s.id));
  const priorityFields = new Map<string, string>();
  for (const s of stories) for (const f of s.custom_fields ?? []) if (/^(highest|urgent|high|medium|low|lowest)$/i.test(f.value)) priorityFields.set(f.field_id, 'priority');
  return stories.sort((a, b) => {
    const ia = a.iteration_id !== null && iterations.has(a.iteration_id) ? 0 : 1;
    const ib = b.iteration_id !== null && iterations.has(b.iteration_id) ? 0 : 1;
    if (ia !== ib) return ia - ib;
    const pa = priorityRank(a, priorityFields);
    const pb = priorityRank(b, priorityFields);
    if (pa !== pb) return pa - pb;
    return a.created_at.localeCompare(b.created_at);
  });
}

// --- Reconcile -----------------------------------------------------------------

function openItems(store: Store, storyId: number): Escalation[] {
  return store.openEscalations().filter((e) => e.ref === String(storyId));
}

/**
 * Brings the quick win in process up to date, as Andy's lane does before it
 * picks: an MR opened by hand counts, a settled inbox item means Mike
 * dismissed it, and a worker that died is stuck.
 */
export function reconcile(store: Store, gl: GitLab, cfg: FridayConfig, log: (s: string) => void = () => {}): QuickWin | undefined {
  const qw = store.activeQuickWin();
  if (!qw) return undefined;
  const repo = qw.repo ? cfg.quickWins.repos[qw.repo] : undefined;
  if (repo && qw.branch && qw.state !== 'offered') {
    const mrs = gl.get<{ web_url: string }[]>(`projects/${pid(repo.project)}/merge_requests?state=opened&source_branch=${encodeURIComponent(qw.branch)}`) ?? [];
    if (mrs.length) {
      store.setQuickWin(qw.story_id, { state: 'mr-opened', mr_url: mrs[0].web_url, reason: 'MR opened' });
      for (const e of openItems(store, qw.story_id)) store.settle(e.id, 'MR opened');
      log(`sc-${qw.story_id}: MR is open, quick win done`);
      return undefined;
    }
  }
  if (qw.state === 'building') {
    if (!workerRunning()) {
      store.setQuickWin(qw.story_id, { state: 'stuck', reason: 'the worker ended without reporting a result' });
      raise(store, null, { process: WORKER, project: repo?.project ?? null, mr: null, subject: `story:${qw.story_id}:stuck`, summary: `sc-${qw.story_id}: the worker ended without a result. Resume to see why, or Dismiss.`, sessionId: qw.session_id, cwd: qw.cwd, mode: (qw.mode as Mode) ?? 'dry-run', kind: 'qw-stuck', ref: String(qw.story_id), host: cfg.quickWins.host, link: storyUrl(qw.story_id) }, cfg);
      log(`sc-${qw.story_id}: worker gone, marked stuck`);
    }
    return store.activeQuickWin();
  }
  if (openItems(store, qw.story_id).length === 0) {
    store.setQuickWin(qw.story_id, { state: 'dismissed', reason: `Mike dismissed it while ${qw.state}` });
    log(`sc-${qw.story_id}: dismissed`);
    return undefined;
  }
  return qw;
}

const storyUrl = (id: number) => `https://app.shortcut.com/metarouter/story/${id}`;

// --- Scout -----------------------------------------------------------------------

export interface ScoutItem {
  label: string;
  candidates: { id: number; name: string; story_type: string; app_url: string; epic_id: number | null; description: string }[];
  clones: Record<string, string>;
}

/** The scout's precheck: nothing while a quick win is in process; otherwise up to 3 candidates. */
export async function scoutPrecheck(store: Store, cfg = loadConfig(), sc = new Shortcut(), gl = new GitLab(), log: (s: string) => void = (s) => void process.stderr.write(s + '\n')): Promise<ScoutItem[]> {
  if (reconcile(store, gl, cfg, log)) return [];
  const stories = (await eligibleStories(sc, cfg, store.knownStoryIds())).slice(0, 3);
  if (stories.length === 0) return [];
  const candidates = [];
  for (const s of stories) {
    const full = await sc.story(s.id);
    candidates.push({ id: s.id, name: s.name, story_type: s.story_type, app_url: s.app_url, epic_id: s.epic_id, description: (full.description ?? '').slice(0, 3000) });
  }
  const clones: Record<string, string> = {};
  for (const [name, r] of Object.entries(cfg.quickWins.repos)) {
    try {
      clones[name] = createWorktree(projectConfig(cfg, r.project).clone, r.project, r.defaultBranch, `${SCOUT}-${r.defaultBranch}`);
    } catch (e) {
      log(`could not refresh the ${name} checkout for probing: ${String(e).slice(0, 200)}`);
    }
  }
  return [{ label: 'scout', candidates, clones }];
}

/** The scout agent offers one candidate. */
export function offer(store: Store, a: { story: number; name: string; repo: string; reason: string; duplicates?: string }, cfg = loadConfig()): number {
  if (store.activeQuickWin()) throw new Error('A quick win is already offered or in process; offer nothing.');
  if (!cfg.quickWins.repos[a.repo]) throw new Error(`Unknown repo ${a.repo}. Use one of: ${Object.keys(cfg.quickWins.repos).join(', ')}`);
  const mode = effectiveMode(SCOUT, store);
  store.setQuickWin(a.story, { state: 'offered', name: a.name, repo: a.repo, reason: a.reason, mode });
  const dups = a.duplicates ? ` Possible duplicates: ${a.duplicates}.` : '';
  return raise(store, null, {
    process: SCOUT, project: cfg.quickWins.repos[a.repo].project, mr: null, subject: `story:${a.story}`,
    summary: `sc-${a.story}: ${a.name} (${a.repo}) — ${a.reason}${dups}`, sessionId: null, cwd: null, mode,
    kind: 'qw-candidate', ref: String(a.story), host: null, link: storyUrl(a.story),
  }, cfg);
}

/** The scout agent rules a story out, with the reason. It is not offered again. */
export function ruleOut(store: Store, a: { story: number; name?: string; reason: string }): void {
  store.setQuickWin(a.story, { state: 'ruled-out', name: a.name ?? null, reason: a.reason });
}

// --- Mike's clicks ---------------------------------------------------------------

function itemOf(store: Store, id: number, kind: string): Escalation {
  const e = store.escalation(id);
  if (!e || e.kind !== kind || !e.ref) throw new Error(`Inbox item ${id} is not a ${kind} item.`);
  if (e.settled_at) throw new Error(`Inbox item ${id} is already settled.`);
  return e;
}

/** Start: claim the story (in live mode) and run the worker in the background. */
export function start(store: Store, id: number, cfg = loadConfig()): string {
  const e = itemOf(store, id, 'qw-candidate');
  const storyId = Number(e.ref);
  if (!bartlebyOnline(cfg)) {
    notify('Friday', `Bartleby is offline, so sc-${storyId} cannot start. Try again when it is reachable.`);
    throw new Error('Bartleby is not reachable; the candidate stays offered.');
  }
  store.setQuickWin(storyId, { state: 'building', reason: 'started by Mike' });
  store.settle(id, 'started');
  fs.mkdirSync(logsDir(), { recursive: true });
  const out = fs.openSync(path.join(logsDir(), `${WORKER}.log`), 'a');
  const child = spawn(FRIDAY_BIN, ['qw', 'run-worker', String(storyId)], { detached: true, stdio: ['ignore', out, out] });
  child.unref();
  return `Started the worker for sc-${storyId} on Bartleby.`;
}

const workerLock = () => path.join(locksDir(), `${WORKER}.lock`);

export function workerRunning(): boolean {
  if (!fs.existsSync(workerLock())) return false;
  const p = Number(fs.readFileSync(workerLock(), 'utf8'));
  try {
    process.kill(p, 0);
    return true;
  } catch {
    return false;
  }
}

/** Open MR: Friday opens the MR from the worker's title and description. */
export async function openMr(store: Store, id: number, cfg = loadConfig(), gl = new GitLab()): Promise<string> {
  const e = itemOf(store, id, 'qw-ready');
  const qw = store.quickWin(Number(e.ref));
  if (!qw?.branch || !qw.repo || !qw.cwd) throw new Error('This quick win has no branch recorded.');
  const repo = cfg.quickWins.repos[qw.repo];
  const read = remote(cfg, `cat ${shq(path.posix.join(qw.cwd, '.maps/quick-win/mr.md'))}`, { asWorker: true });
  const text = read.code === 0 ? read.stdout : '';
  const [titleLine, ...rest] = text.split('\n');
  const title = titleLine?.trim() || `sc-${qw.story_id}: ${qw.name ?? 'quick win'}`;
  const description = rest.join('\n').trim() || `[sc-${qw.story_id}](${storyUrl(qw.story_id)})`;
  const me = gl.get<{ id: number }>('user');
  const actor = actorFor(WORKER, store, gl);
  const r = actor.act('open_mr', { project: repo.project, subject: `branch:${qw.branch}`, detail: title }, () =>
    gl.write<{ web_url: string }>('POST', `projects/${pid(repo.project)}/merge_requests`, {
      source_branch: qw.branch, target_branch: repo.defaultBranch, title, description, assignee_id: me.id,
    })
  );
  const url = r.result?.web_url ?? null;
  store.setQuickWin(qw.story_id, { state: 'mr-opened', mr_url: url, reason: r.dryRun ? 'dry run: MR not opened' : 'MR opened' });
  store.settle(id, r.dryRun ? 'dry run: would open the MR' : 'MR opened');
  if (url) run('open', [url]);
  return r.dryRun ? `DRY RUN: would open "${title}" from ${qw.branch}.` : `Opened ${url}`;
}

// --- The worker ------------------------------------------------------------------

export interface WorkerResult {
  result: 'ready' | 'stuck';
  branch?: string;
  reason: string;
}

export function parseWorkerResult(text: string): WorkerResult {
  const get = (k: string) => new RegExp(`^${k}:\\s*(.+)$`, 'm').exec(text)?.[1].trim();
  const result = get('QUICK_WIN_RESULT') === 'ready' ? 'ready' : 'stuck';
  return { result, branch: get('QUICK_WIN_BRANCH'), reason: get('QUICK_WIN_REASON') ?? 'the worker gave no reason' };
}

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** The story branch: <user>/<type>/sc-<n>/<slug>, at most 40 characters. */
export function branchName(user: string, storyType: string, storyId: number, name: string): string {
  // ion and roost allow feat, fix, refactor, perf, docs, style, test; a chore is a fix.
  const type = storyType === 'feature' ? 'feat' : 'fix';
  const head = `${user}/${type}/sc-${storyId}/`;
  return (head + slugify(name)).slice(0, 40).replace(/-+$/, '');
}

function lockWorker(): () => void {
  fs.mkdirSync(locksDir(), { recursive: true });
  if (workerRunning()) throw new Error('A quick-win worker is already running.');
  fs.writeFileSync(workerLock(), String(process.pid));
  return () => fs.rmSync(workerLock(), { force: true });
}

export async function runWorker(store: Store, storyId: number, cfg = loadConfig(), sc = new Shortcut(), log: (s: string) => void = console.log): Promise<WorkerResult> {
  const release = lockWorker();
  const q = cfg.quickWins;
  const spec = loadProcess(WORKER);
  const mode = effectiveMode(WORKER, store);
  const qw = store.quickWin(storyId);
  const fail = (reason: string, extra: Partial<QuickWin> = {}): WorkerResult => {
    store.setQuickWin(storyId, { state: 'stuck', reason, ...extra });
    raise(store, null, { process: WORKER, project: qw?.repo ? q.repos[qw.repo].project : null, mr: null, subject: `story:${storyId}:stuck`, summary: `sc-${storyId}: not a quick win after all — ${reason}. Resume to answer, or Dismiss.`, sessionId: extra.session_id ?? null, cwd: extra.cwd ?? null, mode, kind: 'qw-stuck', ref: String(storyId), host: q.host, link: storyUrl(storyId) }, cfg);
    return { result: 'stuck', reason };
  };
  try {
    if (!qw?.repo || !q.repos[qw.repo]) return fail('no repo recorded for this story');
    const repo = q.repos[qw.repo];
    const story = await sc.story(storyId);
    const user = run('git', ['config', 'user.name']).stdout.trim().split(/\s+/)[0]?.toLowerCase() || 'friday';
    const branch = branchName(user, story.story_type, storyId, story.name);
    const work = path.posix.join(q.workDir, qw.repo);
    store.setQuickWin(storyId, { state: 'building', branch, cwd: work, mode });

    // 1. Claim the story, on Mike's Start click.
    if (mode === 'live') {
      await sc.claim(storyId, q.memberId, q.inProgressStateId);
      store.recordAction({ process: WORKER, action: 'claim_story', subject: `story:${storyId}`, mode, ok: true });
    } else {
      store.recordAction({ process: WORKER, action: 'claim_story', subject: `story:${storyId}`, mode, ok: true, detail: 'dry run: would set Mike as owner and move to In Progress' });
    }

    // 2. Update the mirror (as Mike) and prepare the branch (as the worker).
    log(`sc-${storyId}: preparing ${branch} in ${work}`);
    const mirror = path.posix.join(q.mirrorDir, `${qw.repo}.git`);
    const m = remote(cfg, `git -C ${shq(mirror)} fetch --quiet --prune origin`, { timeoutMs: 300_000 });
    if (m.code !== 0) return fail(`could not update the ${qw.repo} mirror: ${m.stderr.trim().slice(0, 200)}`);
    const prep = remote(cfg, `cd ${shq(work)} && git fetch --quiet origin && git checkout --quiet -B ${shq(branch)} origin/${repo.defaultBranch} && git clean -fdq -e .maps -e .claude && rm -f .maps/quick-win/mr.md`, { asWorker: true, timeoutMs: 300_000 });
    if (prep.code !== 0) return fail(`could not prepare the branch: ${prep.stderr.trim().slice(0, 200)}`);

    // 3. Run /maps unattended, as the worker, on Bartleby.
    const prompt = `/maps UNATTENDED: Build Shortcut story sc-${storyId}: ${story.name}\n\nStory link: ${story.app_url}\n\n${story.description ?? ''}\n\n${spec.prompt}`;
    const args = ['-p', '--model', spec.model, '--max-budget-usd', String(spec.maxBudgetUsd), '--permission-mode', spec.permissionMode];
    if (spec.allowedTools.length) args.push('--allowed-tools', ...spec.allowedTools);
    args.push('-n', `friday-qw-sc-${storyId}`, '--output-format', 'json');
    log(`sc-${storyId}: running /maps on Bartleby`);
    const runId = store.startRun(WORKER, `sc-${storyId}`, mode);
    const r = remote(cfg, `cd ${shq(work)} && ${shq(path.posix.join(q.binDir, 'quickwin-claude.sh'))} ${args.map(shq).join(' ')}`, { asWorker: true, input: prompt, timeoutMs: spec.timeoutMs });
    let parsed: { result?: string; session_id?: string; total_cost_usd?: number; is_error?: boolean } = {};
    try {
      parsed = JSON.parse(r.stdout.trim().split('\n').pop() ?? '{}');
    } catch {
      /* handled below */
    }
    const text = parsed.result ?? '';
    store.endRun(runId, { outcome: parsed.session_id && !parsed.is_error ? 'ok' : 'failed', cost: parsed.total_cost_usd, sessionId: parsed.session_id, cwd: work, summary: text.slice(0, 2000) });
    const session = { session_id: parsed.session_id ?? null, cwd: work };
    if (!parsed.session_id) return fail(`the worker did not run: ${(r.stderr || r.stdout).trim().slice(0, 200)}`, session);

    const res = parseWorkerResult(text);
    for (const esc of parseEscalations(text)) {
      raise(store, null, { ...esc, process: WORKER, sessionId: parsed.session_id, cwd: work, mode, kind: 'qw-stuck', ref: String(storyId), host: q.host, link: storyUrl(storyId) }, cfg);
    }
    if (res.result !== 'ready') return fail(res.reason, session);

    // 4. Push the branch (as Mike, from the mirror), never forcing.
    if (PROTECTED.has(branch) || branch === repo.defaultBranch) return fail(`refused to push ${branch}`, session);
    const ahead = remote(cfg, `cd ${shq(work)} && git rev-list --count origin/${repo.defaultBranch}..${shq(branch)}`, { asWorker: true });
    if (Number(ahead.stdout.trim() || 0) < 1) return fail('the worker reported ready but made no commits', session);
    const actor = actorFor(WORKER, store);
    const pushed = actor.act('push_branch', { project: repo.project, subject: `branch:${branch}`, detail: `${ahead.stdout.trim()} commit(s)` }, () => {
      const p = remote(cfg, `git -C ${shq(mirror)} fetch --quiet ${shq(work)} ${shq(`refs/heads/${branch}:refs/heads/${branch}`)} && git -C ${shq(mirror)} push --quiet git@gitlab.com:${repo.project}.git ${shq(`refs/heads/${branch}:refs/heads/${branch}`)}`, { timeoutMs: 300_000 });
      if (p.code !== 0) throw new Error(`push failed: ${p.stderr.trim().slice(0, 200)}`);
      return true;
    });

    store.setQuickWin(storyId, { state: 'awaiting-mr', branch, ...session, reason: res.reason });
    raise(store, null, {
      process: WORKER, project: repo.project, mr: null, subject: `story:${storyId}:ready`,
      summary: `sc-${storyId} is ready${pushed.dryRun ? ' (dry run: not pushed)' : ''}: ${res.reason}. Open MR?`,
      sessionId: parsed.session_id, cwd: work, mode, kind: 'qw-ready', ref: String(storyId), host: q.host,
      link: pushed.dryRun ? storyUrl(storyId) : `https://gitlab.com/${repo.project}/-/tree/${encodeURIComponent(branch)}`,
    }, cfg);
    log(`sc-${storyId}: ready, ${pushed.dryRun ? 'push recorded (dry run)' : 'pushed'}`);
    return { result: 'ready', branch, reason: res.reason };
  } catch (err) {
    return fail(String(err instanceof Error ? err.message : err).slice(0, 300));
  } finally {
    release();
  }
}
