import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { DEFAULT_CONFIG, type FridayConfig } from '../src/config.js';
import { Actor, GitLab } from '../src/gitlab.js';
import { pipelineWatchPrecheck } from '../src/processes/pipeline-watch/precheck.js';
import { rebuildReviewEnv } from '../src/processes/pipeline-watch/rebuild.js';
import { threadState, ESCALATION_MARK } from '../src/processes/review-responder/precheck.js';
import { runProcess } from '../src/runner.js';
import { Store } from '../src/store.js';
import { FakeGitLab, PLUGIN, tempHome } from './helpers.js';

process.env.FRIDAY_PROCESSES_DIR = path.join(PLUGIN, 'processes');
const CFG: FridayConfig = { ...DEFAULT_CONFIG, projects: [{ project: 'metarouter/ion', clone: '/tmp/none', reviewEnvUrl: 'https://{slug}-ui.example' }] };

function pipelineGitLab(jobs: object[], status = 'failed') {
  return new FakeGitLab([
    ['GET merge_requests\\?author_username', () => [{ iid: 5 }]],
    ['GET merge_requests/5$', () => ({ iid: 5, source_branch: 'mike/feat/sc-1/x', web_url: 'u', labels: [], head_pipeline: { id: 100, status, sha: 'abc', web_url: 'p' } })],
    ['GET pipelines/100/jobs', () => jobs],
  ]);
}

test('pipeline watch: retries runner faults itself, hands code failures to an agent', () => {
  tempHome();
  const store = new Store();
  store.setMode('pipeline-watch', 'live');
  const fake = pipelineGitLab([
    { id: 1, name: 'build', stage: 'b', status: 'failed', allow_failure: false, failure_reason: 'runner_system_failure', web_url: '' },
    { id: 2, name: 'test-unit', stage: 't', status: 'failed', allow_failure: false, failure_reason: 'script_failure', web_url: '' },
    { id: 3, name: 'lint-optional', stage: 't', status: 'failed', allow_failure: true, failure_reason: 'script_failure', web_url: '' },
  ]);
  const items = pipelineWatchPrecheck(store, new GitLab(fake), CFG, () => {});
  assert.ok(fake.writes().some((w) => w.path.endsWith('jobs/1/retry')), 'runner fault retried without a model');
  assert.equal(items.length, 1);
  assert.deepEqual(items[0].failed_jobs.map((j) => j.name), ['test-unit'], 'allow_failure jobs are ignored');
  assert.equal(items[0].review_env_url, 'https://mike-feat-sc-1-x-ui.example');
  store.markHandled('pipeline-watch', items[0].handled_keys[0]);
  assert.equal(pipelineWatchPrecheck(store, new GitLab(fake), CFG, () => {}).length, 0, 'a handled failure is not sent twice');
  store.close();
});

test('pipeline watch: stops retrying a runner fault after two retries', () => {
  tempHome();
  const store = new Store();
  store.setMode('pipeline-watch', 'live');
  const jobs = [{ id: 1, name: 'build', stage: 'b', status: 'failed', allow_failure: false, failure_reason: 'stuck_or_timeout_failure', web_url: '' }];
  const fake = pipelineGitLab(jobs);
  pipelineWatchPrecheck(store, new GitLab(fake), CFG, () => {});
  pipelineWatchPrecheck(store, new GitLab(fake), CFG, () => {});
  const third = pipelineWatchPrecheck(store, new GitLab(fake), CFG, () => {});
  assert.equal(fake.writes().filter((w) => w.path.endsWith('/retry')).length, 2);
  assert.equal(third.length, 1, 'after two retries the job goes to an agent, which escalates it');
  assert.equal(third[0].failed_jobs[0].retries_used, 2);
  store.close();
});

test('pipeline watch: a passing pipeline settles its open escalation', () => {
  tempHome();
  const store = new Store();
  store.raise({ process: 'pipeline-watch', project: 'metarouter/ion', mr: 5, mr_url: null, subject: 'pipeline:100', summary: 'x', session_id: null, cwd: null, mode: 'dry-run' });
  pipelineWatchPrecheck(store, new GitLab(pipelineGitLab([], 'success')), CFG, () => {});
  assert.equal(store.openEscalations().length, 0);
  store.close();
});

test('review env rebuild: delete, deploy, auto deploy, health, then Cypress retries; once a day', async () => {
  tempHome();
  const store = new Store();
  const state: Record<string, string> = { 'delete-review-env-manual': 'manual', 'deploy-review-env-manual': 'manual', 'deploy-review-env': 'failed', 'test-cypress: [a]': 'failed' };
  const ids: Record<string, number> = { 'delete-review-env-manual': 1, 'deploy-review-env-manual': 2, 'deploy-review-env': 3, 'test-cypress: [a]': 4 };
  const byId = (id: number) => Object.keys(ids).find((k) => ids[k] === id)!;
  const fake = new FakeGitLab([
    ['GET merge_requests/5$', () => ({ iid: 5, source_branch: 'b', head_pipeline: { id: 100, status: 'failed' } })],
    ['GET pipelines/100/jobs', () => Object.keys(ids).map((n) => ({ id: ids[n], name: n, status: state[n], allow_failure: false }))],
    ['POST jobs/\\d+/(play|retry)', (_m, p) => {
      const name = byId(Number(/jobs\/(\d+)\//.exec(p)![1]));
      state[name] = 'success';
      return {};
    }],
  ]);
  const gl = new GitLab(fake);
  const actor = new Actor('pipeline-watch', 'live', new Set(['rebuild_review_env', 'play_job', 'retry_job']), store, gl);
  const deps = { gl, sleep: async () => {}, health: async () => true, budgetMs: 60_000 };
  const r = await rebuildReviewEnv(store, actor, 'metarouter/ion', 5, deps);
  assert.equal(r.status, 'done', r.message);
  const order = fake.writes().map((w) => byId(Number(/jobs\/(\d+)\//.exec(w.path)![1])));
  assert.deepEqual(order, ['delete-review-env-manual', 'deploy-review-env-manual', 'deploy-review-env', 'test-cypress: [a]']);
  const again = await rebuildReviewEnv(store, actor, 'metarouter/ion', 5, deps);
  assert.equal(again.status, 'refused', 'one rebuild per MR per day');
  store.close();
});

test('review env rebuild in dry-run records the decision and touches nothing', async () => {
  tempHome();
  const store = new Store();
  const fake = new FakeGitLab([['GET merge_requests/5$', () => ({ iid: 5, head_pipeline: { id: 100 } })]]);
  const actor = new Actor('pipeline-watch', 'dry-run', new Set(['rebuild_review_env', 'play_job', 'retry_job']), store, new GitLab(fake));
  const r = await rebuildReviewEnv(store, actor, 'metarouter/ion', 5, { gl: new GitLab(fake) });
  assert.equal(r.status, 'dry-run');
  assert.equal(fake.writes().length, 0);
  store.close();
});

test('review responder: which threads wait on Friday', () => {
  const me = DEFAULT_CONFIG.gitlabUser;
  const bot = (id: number, body: string) => ({ id, body: `${DEFAULT_CONFIG.replyHeader}\n\n${body}`, author: { username: me }, created_at: '', system: false, resolvable: true, resolved: false });
  const note = (id: number, who: string, body = 'x') => ({ id, body, author: { username: who }, created_at: '', system: false, resolvable: true, resolved: false });
  const d = (notes: object[]) => ({ id: 'D1', individual_note: false, notes } as never);
  const none = () => [];

  assert.deepEqual(threadState(d([note(1, 'sam')]), DEFAULT_CONFIG, none), { reason: 'reviewer', key: 'thread:D1:1' });
  assert.equal(threadState(d([note(1, 'sam'), bot(2, 'Fixed!')]), DEFAULT_CONFIG, none), null, 'answered threads wait on the reviewer');
  assert.equal(threadState(d([note(1, 'sam'), bot(2, `I've ${ESCALATION_MARK}.`)]), DEFAULT_CONFIG, none), null, 'escalations wait on Mike');
  assert.equal(threadState(d([note(1, 'sam'), bot(2, `I've ${ESCALATION_MARK}.`), note(3, me, 'go ahead')]), DEFAULT_CONFIG, none)?.reason, 'mike-answered');
  assert.equal(threadState(d([note(1, 'sam'), bot(2, `I've ${ESCALATION_MARK}.`)]), DEFAULT_CONFIG, () => [{ name: 'thumbsup', user: { username: me } }])?.reason, 'mike-approved');
  assert.equal(threadState(d([note(1, 'sam'), bot(2, `I've ${ESCALATION_MARK}.`)]), DEFAULT_CONFIG, () => [{ name: 'eyes', user: { username: me } }]), null, '👀 holds the thread');
  assert.equal(threadState(d([note(1, me, 'my own note')]), DEFAULT_CONFIG, none), null, "Mike's own notes are not review comments");
  assert.equal(threadState(d([{ ...note(1, 'sam'), resolved: true }]), DEFAULT_CONFIG, none), null, 'resolved threads are skipped');
});

test('runner: one agent per item, escalations raised with the session, handled keys marked', async () => {
  const home = tempHome();
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'friday-fakeclaude-'));
  const result = 'Looked.\n\nESCALATIONS:\n- metarouter/ion!5 | pipeline:100 | test-unit fails\n';
  fs.writeFileSync(path.join(bin, 'out.json'), JSON.stringify({ type: 'result', result, session_id: 'sess-1', total_cost_usd: 0.12, is_error: false }));
  fs.writeFileSync(path.join(bin, 'claude'), `#!/bin/sh\ncat > /dev/null\ncat ${path.join(bin, 'out.json')}\n`, { mode: 0o755 });
  fs.writeFileSync(path.join(bin, 'pre'), `#!/bin/sh\necho '{"items":[{"label":"ion-mr-5","project":"metarouter/ion","mr":5,"handled_keys":["k1"]}]}'\n`, { mode: 0o755 });
  const procs = fs.mkdtempSync(path.join(os.tmpdir(), 'friday-procs-'));
  fs.mkdirSync(path.join(procs, 't'));
  fs.writeFileSync(path.join(procs, 't', 'process.md'), `---\nschedule: manual\nprecheck: ${path.join(bin, 'pre')}\nfan_out: items\noutward_actions: [add_label, remove_label]\n---\nDo it.\n`);
  const prevProcs = process.env.FRIDAY_PROCESSES_DIR;
  const prevPath = process.env.PATH;
  process.env.FRIDAY_PROCESSES_DIR = procs;
  process.env.PATH = `${bin}:${prevPath}`;
  try {
    const r = await runProcess('t', { log: () => {} });
    assert.equal(r.outcome, 'ok');
    assert.equal(r.items[0].escalations, 1);
    const store = new Store(path.join(home, 'state.db'));
    const [e] = store.openEscalations();
    assert.equal(e.session_id, 'sess-1');
    assert.equal(e.mode, 'dry-run', 'a process with no mode starts in dry-run');
    assert.equal(e.subject, 'pipeline:100');
    assert.ok(store.isHandled('t', 'k1'));
    assert.equal(store.recentRuns('t')[0].cost_usd, 0.12);
    store.close();
  } finally {
    process.env.FRIDAY_PROCESSES_DIR = prevProcs;
    process.env.PATH = prevPath;
  }
});
