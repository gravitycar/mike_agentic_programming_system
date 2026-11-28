import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import { DEFAULT_CONFIG, inWorkingHours, refSlug } from '../src/config.js';
import { Actor, ActionNotAllowed, assertNotMerge, GitLab, MergeRefused } from '../src/gitlab.js';
import { parseEscalations, raise, settle, swiftbarMenu } from '../src/inbox.js';
import { parseProcessFile, listProcesses, splitCommand } from '../src/spec.js';
import { claudeArgs, agentPreamble } from '../src/runner.js';
import { Store } from '../src/store.js';
import { FakeGitLab, PLUGIN, tempHome } from './helpers.js';

process.env.FRIDAY_PROCESSES_DIR = path.join(PLUGIN, 'processes');

test('every shipped process file parses, and new ones start in dry-run', () => {
  const procs = listProcesses();
  const names = procs.map((p) => p.name);
  assert.deepEqual(names, ['hello', 'pipeline-watch', 'quick-wins-scout', 'quick-wins-worker', 'review-responder']);
  for (const p of procs) {
    assert.notEqual(p.permissionMode, 'bypassPermissions');
    if (p.name !== 'hello') assert.equal(p.defaultMode, 'dry-run', `${p.name} must start in dry-run`);
    if (p.name === 'pipeline-watch' || p.name === 'review-responder') {
      assert.ok(p.outwardActions.includes('add_label') && p.outwardActions.includes('remove_label'),
        `${p.name} needs add_label and remove_label so escalations can label and unlabel its MRs`);
    }
    assert.ok(!p.outwardActions.some((a) => /merge/.test(a)), 'no process may declare a merge action');
  }
});

test('process files: refused permission modes, unknown keys, and list values', () => {
  assert.throws(() => parseProcessFile('x', '---\nprecheck: a\npermission_mode: bypassPermissions\n---\nhi'), /refused/);
  assert.throws(() => parseProcessFile('x', '---\nbogus: 1\n---\nhi'), /unknown key/);
  const p = parseProcessFile('x', '---\nallowed_tools: [Read, "Bash(git commit:*)"]\ntimeout: 90s\n---\nhi');
  assert.deepEqual(p.allowedTools, ['Read', 'Bash(git commit:*)']);
  assert.equal(p.timeoutMs, 90_000);
  assert.deepEqual(splitCommand('friday precheck "a b"', '/bin/friday'), ['/bin/friday', 'precheck', 'a b']);
});

test('the API guard refuses merges and auto-merge, and allows ordinary writes', () => {
  assert.throws(() => assertNotMerge('PUT', 'projects/a%2Fb/merge_requests/5/merge'), MergeRefused);
  assert.throws(() => assertNotMerge('PUT', 'projects/a%2Fb/merge_requests/5', { merge_when_pipeline_succeeds: true }), MergeRefused);
  assert.throws(() => assertNotMerge('PUT', 'projects/a%2Fb/merge_requests/5', { auto_merge: true }), MergeRefused);
  assertNotMerge('PUT', 'projects/a%2Fb/merge_requests/5', { add_labels: 'needs-mike' });
  assertNotMerge('POST', 'projects/a%2Fb/jobs/9/retry');
  assertNotMerge('GET', 'projects/a%2Fb/merge_requests/5/merge_ref');
});

test('an Actor records dry-run actions, performs live ones, and refuses undeclared ones', () => {
  tempHome();
  const store = new Store();
  const fake = new FakeGitLab([]);
  const dry = new Actor('p', 'dry-run', new Set(['retry_job']), store, new GitLab(fake));
  assert.equal(dry.retryJob('a/b', 1).dryRun, true);
  assert.equal(fake.writes().length, 0, 'dry-run must not touch GitLab');
  const live = new Actor('p', 'live', new Set(['retry_job']), store, new GitLab(fake));
  live.retryJob('a/b', 2);
  assert.equal(fake.writes().length, 1);
  assert.throws(() => live.addLabel('a/b', 5, 'x'), ActionNotAllowed);
  assert.equal(store.countActions({ process: 'p', action: 'retry_job' }), 2);
  store.close();
});

test('escalation blocks parse, including none and general items', () => {
  const text = 'Did things.\n\nESCALATIONS:\n- metarouter/ion!42 | pipeline:9 | test-unit fails: real regression\n- general | x | something odd\n';
  const e = parseEscalations(text);
  assert.equal(e.length, 2);
  assert.deepEqual(e[0], { project: 'metarouter/ion', mr: 42, subject: 'pipeline:9', summary: 'test-unit fails: real regression' });
  assert.equal(e[1].project, null);
  assert.deepEqual(parseEscalations('ok\nESCALATIONS:\n- none\n'), []);
  assert.deepEqual(parseEscalations('no block'), []);
});

test('raising labels the MR in live mode; settling the last one removes the label', () => {
  tempHome();
  const store = new Store();
  const fake = new FakeGitLab([]);
  const actor = new Actor('p', 'live', new Set(['add_label', 'remove_label']), store, new GitLab(fake));
  const base = { process: 'p', project: 'metarouter/ion', mr: 7, sessionId: 's1', cwd: '/tmp/w', mode: 'live' as const };
  const a = raise(store, actor, { ...base, subject: 'pipeline:1', summary: 'one' }, DEFAULT_CONFIG);
  const b = raise(store, actor, { ...base, subject: 'pipeline:2', summary: 'two' }, DEFAULT_CONFIG);
  assert.equal(raise(store, actor, { ...base, subject: 'pipeline:1', summary: 'dup' }, DEFAULT_CONFIG), a, 'same subject is not raised twice');
  settle(store, actor, a, 'done', DEFAULT_CONFIG);
  assert.ok(!fake.writes().some((w) => w.body?.remove_labels), 'label stays while another escalation is open');
  settle(store, actor, b, 'done', DEFAULT_CONFIG);
  assert.ok(fake.writes().some((w) => w.body?.remove_labels === 'needs-mike'));
  assert.equal(store.openEscalations().length, 0);
  store.close();
});

test('dry-run escalations reach the inbox but never GitLab', () => {
  tempHome();
  const store = new Store();
  const fake = new FakeGitLab([]);
  const actor = new Actor('p', 'dry-run', new Set(['add_label']), store, new GitLab(fake));
  raise(store, actor, { process: 'p', project: 'a/b', mr: 1, subject: 's', summary: 'x', sessionId: null, cwd: null, mode: 'dry-run' }, DEFAULT_CONFIG);
  assert.equal(fake.writes().length, 0);
  assert.match(swiftbarMenu(store.openEscalations(), '/bin/friday'), /\[dry run\] b!1/);
  store.close();
});

test('the SwiftBar menu counts live items and wires resume, open, and dismiss', () => {
  const menu = swiftbarMenu([
    { id: 3, process: 'review-responder', project: 'metarouter/ion', mr: 12, mr_url: 'https://g/x', subject: 'd', summary: 'a | b', session_id: 's', cwd: '/w', mode: 'live', raised_at: new Date().toISOString(), settled_at: null, settled_reason: null },
  ], '/bin/friday');
  const lines = menu.split('\n');
  assert.match(lines[0], /^1 \| sfimage=bell\.badge\.fill/);
  assert.match(menu, /ion!12 · a ¦ b .*\| bash=\/bin\/friday param1=resume param2=3/);
  assert.match(menu, /--Open MR \| href=https:\/\/g\/x/);
  assert.match(menu, /--Dismiss \| bash=\/bin\/friday param1=settle param2=3/);
  assert.match(swiftbarMenu([], '/b'), /^ \| sfimage=bell\n/);
});

test('working hours and ref slugs', () => {
  const cfg = DEFAULT_CONFIG;
  assert.equal(inWorkingHours(cfg, new Date(2026, 10, 25, 7, 0)), true, 'Wednesday 07:00');
  assert.equal(inWorkingHours(cfg, new Date(2026, 10, 25, 18, 0)), false, '18:00 is the end');
  assert.equal(inWorkingHours(cfg, new Date(2026, 10, 28, 10, 0)), false, 'Saturday');
  assert.equal(refSlug('mike/feat/sc-123/Audit_Log'), 'mike-feat-sc-123-audit-log');
});

test('claude arguments carry the budget, tools, and JSON output, never a bypass mode', () => {
  const p = parseProcessFile('x', '---\nprecheck: a\nmodel: opus\nmax_budget_usd: 3\nallowed_tools: [Read, "Bash(friday:*)"]\n---\nhi');
  const args = claudeArgs(p, 'ion-mr-5');
  assert.deepEqual(args.slice(args.indexOf('--allowed-tools'), args.indexOf('--allowed-tools') + 3), ['--allowed-tools', 'Read', 'Bash(friday:*)']);
  assert.ok(args.includes('--max-budget-usd') && args.includes('3'));
  assert.equal(args[args.indexOf('--output-format') + 1], 'json');
  assert.ok(!args.includes('bypassPermissions'));
  const pre = agentPreamble(p, 'dry-run', { mr: 5 });
  assert.match(pre, /Never merge a merge request/);
  assert.match(pre, /DRY-RUN/);
  assert.match(pre, /ESCALATIONS:/);
});

test('the store keeps state under FRIDAY_HOME', () => {
  const home = tempHome();
  const s = new Store();
  s.close();
  assert.ok(fs.existsSync(path.join(home, 'state.db')));
});

test('dry-run records never use up live limits', () => {
  tempHome();
  const store = new Store();
  store.recordAction({ process: 'p', action: 'retry_job', subject: 's', mode: 'dry-run', ok: true });
  store.recordAction({ process: 'p', action: 'retry_job', subject: 's', mode: 'dry-run', ok: true });
  assert.equal(store.countActions({ process: 'p', action: 'retry_job', subjectLike: 's', mode: 'live' }), 0);
  assert.equal(store.countActions({ process: 'p', action: 'retry_job', subjectLike: 's', mode: 'dry-run' }), 2);
  store.close();
});

test('the environment can lower a mode to dry-run but never raise it to live', async () => {
  tempHome();
  const { effectiveMode } = await import('../src/context.js');
  const store = new Store();
  store.setMode('pipeline-watch', 'live');
  const prev = process.env.FRIDAY_MODE;
  process.env.FRIDAY_MODE = 'dry-run';
  assert.equal(effectiveMode('pipeline-watch', store), 'dry-run');
  store.setMode('pipeline-watch', 'dry-run');
  process.env.FRIDAY_MODE = 'live';
  assert.equal(effectiveMode('pipeline-watch', store), 'dry-run', 'FRIDAY_MODE=live must not promote a dry-run process');
  process.env.FRIDAY_MODE = prev;
  store.close();
});

test('agents may run only act, gl, escalate, and settle --cwd', async () => {
  const { spawnSync } = await import('child_process');
  const cli = path.join(PLUGIN, 'dist', 'src', 'cli.js');
  const env = { ...process.env, FRIDAY_AGENT: '1', FRIDAY_HOME: tempHome() };
  for (const args of [['mode', 'review-responder', 'live'], ['schedule', 'add', 'pipeline-watch'], ['settle', '1'], ['setup']]) {
    const r = spawnSync('node', [cli, ...args], { env, encoding: 'utf8' });
    assert.notEqual(r.status, 0, `agent must not run: friday ${args.join(' ')}`);
    assert.match(r.stderr, /may not run|own working folder/);
  }
});

test('the API guard checks request keys, not reply text', () => {
  assertNotMerge('POST', 'projects/a%2Fb/merge_requests/5/discussions/d/notes', { body: 'We do not use auto_merge here.' });
  assert.throws(() => assertNotMerge('PUT', 'projects/a%2Fb/merge_requests/5?merge_when_pipeline_succeeds=true'), MergeRefused);
});

test('processes that run more than friday are sandboxed, with GitLab always denied', async () => {
  const { claudeArgs: args, DENIED_DOMAINS } = await import('../src/runner.js');
  for (const p of listProcesses()) {
    const onlyFriday = p.allowedTools.every((t) => !t.startsWith('Bash') || t === 'Bash(friday:*)');
    if (onlyFriday) continue;
    if (p.runsOn === 'bartleby') continue; // contained by the quickwin user, which holds no credentials
    assert.ok(p.sandboxDomains, `${p.name} runs other commands, so it must declare sandbox_domains`);
    const a = args(p, 'x');
    const settings = JSON.parse(a[a.indexOf('--settings') + 1]);
    assert.equal(settings.sandbox.enabled, true);
    assert.equal(settings.sandbox.allowUnsandboxedCommands, false, 'no unsandboxed retries');
    assert.deepEqual(settings.sandbox.network.deniedDomains, DENIED_DOMAINS);
    assert.ok(!p.sandboxDomains!.some((d) => /gitlab|github/.test(d)), `${p.name} must not allow GitLab or GitHub`);
  }
});
