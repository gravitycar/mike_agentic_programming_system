import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'path';
import { DEFAULT_CONFIG, type FridayConfig } from '../src/config.js';
import { GitLab } from '../src/gitlab.js';
import { branchName, eligibleStories, offer, parseWorkerResult, reconcile, ruleOut } from '../src/qw.js';
import { Shortcut, type ShortcutTransport, type Story } from '../src/shortcut.js';
import { Store } from '../src/store.js';
import { FakeGitLab, PLUGIN, tempHome } from './helpers.js';

process.env.FRIDAY_PROCESSES_DIR = path.join(PLUGIN, 'processes');
const ME = 'me-id';
const TEAM = DEFAULT_CONFIG.quickWins.teamId;
const CFG: FridayConfig = { ...DEFAULT_CONFIG, quickWins: { ...DEFAULT_CONFIG.quickWins, memberId: ME, mentionName: 'me' } };

const story = (id: number, o: Partial<Story> = {}): Story => ({
  id, name: `story ${id}`, story_type: 'chore', owner_ids: [], group_id: TEAM, workflow_state_id: 500000028,
  iteration_id: null, epic_id: null, app_url: `u/${id}`, created_at: `2026-0${(id % 9) + 1}-01`, ...o,
});

class FakeShortcut implements ShortcutTransport {
  constructor(private byQuery: (q: string) => Story[], private iterations: { id: number; status: string }[] = []) {}
  async get(p: string, q?: Record<string, string>) {
    if (p === '/search/stories') return { data: this.byQuery(q!.query), next: null };
    if (p === '/iterations') return this.iterations;
    return story(Number(p.split('/').pop()));
  }
  async put() {
    return {};
  }
}

test('branch names fit 40 characters and use types ion and roost allow', () => {
  const b = branchName('mike', 'chore', 47704, 'Aikido: bump go-jose to v4.1.6 in roost go.mod and more words');
  assert.ok(b.length <= 40, b);
  assert.match(b, /^mike\/fix\/sc-47704\/aikido-bump/);
  assert.match(branchName('mike', 'feature', 1, 'x'), /^mike\/feat\//);
});

test('the worker result block is read, and anything else counts as stuck', () => {
  const r = parseWorkerResult('done\nQUICK_WIN_RESULT: ready\nQUICK_WIN_BRANCH: mike/fix/sc-1/x\nQUICK_WIN_REASON: bumped go-jose\n');
  assert.deepEqual(r, { result: 'ready', branch: 'mike/fix/sc-1/x', reason: 'bumped go-jose' });
  assert.equal(parseWorkerResult('no block at all').result, 'stuck');
});

test('eligible: unowned Platform stories and Mike\'s own, current iteration first, known stories excluded', async () => {
  const sc = new Shortcut(new FakeShortcut((q) => (q.includes('team:') ? [
    story(1),
    story(2, { owner_ids: ['someone'] }),          // owned by someone else
    story(3, { group_id: 'other-team' }),           // another team
    story(4, { iteration_id: 77 }),                 // current iteration
    story(5),                                       // already known (dismissed)
  ] : [story(6, { owner_ids: [ME], group_id: 'other-team' })]), [{ id: 77, status: 'started' }]));
  const ids = (await eligibleStories(sc, CFG, new Set([5]))).map((s) => s.id);
  assert.equal(ids[0], 4, 'the current iteration comes first');
  assert.deepEqual(new Set(ids), new Set([4, 1, 6]));
});

test('one quick win at a time: a second offer is refused while one is offered', () => {
  tempHome();
  process.env.FRIDAY_NO_NOTIFY = '1';
  const store = new Store();
  const id = offer(store, { story: 10, name: 'x', repo: 'ion', reason: 'a version bump' }, CFG);
  assert.ok(id > 0);
  const item = store.escalation(id)!;
  assert.equal(item.kind, 'qw-candidate');
  assert.equal(item.ref, '10');
  assert.equal(item.mode, 'dry-run', 'the scout starts in dry-run');
  assert.throws(() => offer(store, { story: 11, name: 'y', repo: 'ion', reason: 'z' }, CFG), /already offered/);
  ruleOut(store, { story: 12, reason: 'duplicate of sc-9' });
  assert.deepEqual([...store.knownStoryIds()].sort(), [10, 12]);
  store.close();
});

test('reconcile: a dismissed candidate frees the scout; an MR opened by hand ends the quick win', () => {
  tempHome();
  const store = new Store();
  const gl = new GitLab(new FakeGitLab([]));
  const id = offer(store, { story: 20, name: 'x', repo: 'ion', reason: 'r' }, CFG);
  assert.equal(reconcile(store, gl, CFG)?.story_id, 20, 'an offered candidate blocks the scout');
  store.settle(id, 'dismissed');
  assert.equal(reconcile(store, gl, CFG), undefined);
  assert.equal(store.quickWin(20)?.state, 'dismissed');

  store.setQuickWin(21, { state: 'awaiting-mr', repo: 'ion', branch: 'mike/fix/sc-21/x' });
  const withMr = new GitLab(new FakeGitLab([['GET merge_requests\\?state=opened&source_branch=', () => [{ web_url: 'https://g/mr/1' }]]]));
  assert.equal(reconcile(store, withMr, CFG), undefined);
  assert.equal(store.quickWin(21)?.state, 'mr-opened');
  assert.equal(store.quickWin(21)?.mr_url, 'https://g/mr/1');
  store.close();
});

test('reconcile: a building quick win whose worker is gone becomes stuck, with an inbox item', () => {
  tempHome();
  const store = new Store();
  store.setQuickWin(30, { state: 'building', repo: 'ion', branch: 'mike/fix/sc-30/x', mode: 'dry-run' });
  const left = reconcile(store, new GitLab(new FakeGitLab([])), CFG);
  assert.equal(left?.state, 'stuck');
  const items = store.openEscalations().filter((e) => e.ref === '30');
  assert.equal(items.length, 1);
  assert.equal(items[0].kind, 'qw-stuck');
  assert.equal(items[0].host, CFG.quickWins.host, 'Resume must reach Bartleby');
  store.close();
});
