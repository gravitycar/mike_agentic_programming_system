import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';
import { checkCommand } from '../hooks/merge-guard.mjs';

const hook = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'hooks', 'merge-guard.mjs');

test('denies merging and auto-merge in every session', () => {
  for (const c of [
    'glab mr merge 123',
    'glab mr merge 123 --squash',
    'glab api -X PUT projects/1/merge_requests/5/merge',
    'curl -X PUT https://gitlab.com/api/v4/projects/1/merge_requests/5/merge',
    'glab api -X PUT projects/1/merge_requests/5 -f merge_when_pipeline_succeeds=true',
    'glab mr update 5 --auto-merge',
    'git push origin master',
    'git push origin HEAD:main',
    'git -C /tmp/x push origin HEAD:refs/heads/master',
  ]) {
    assert.ok(checkCommand(c), `should deny: ${c}`);
  }
});

test('allows ordinary commands for Mike', () => {
  for (const c of [
    'git push origin mike/feat/sc-1/thing',
    'git push --force-with-lease origin mike/feat/sc-1/thing',
    'glab mr view 5',
    'glab api projects/1/merge_requests/5/discussions',
    'git merge-base origin/master HEAD',
    'npm test',
  ]) {
    assert.equal(checkCommand(c), null, `should allow: ${c}`);
  }
});

test('inside a Friday agent, also denies force pushes, raw pushes, and glab', () => {
  const agent = { agent: true };
  assert.ok(checkCommand('git push --force origin feat/x', agent));
  assert.ok(checkCommand('git push origin +feat/x', agent));
  assert.ok(checkCommand('git push origin feat/x', agent), 'agents push only with friday act push');
  assert.ok(checkCommand('glab api projects/1/merge_requests', agent));
  assert.ok(checkCommand('curl https://gitlab.com/api/v4/projects', agent));
  assert.equal(checkCommand('friday act push', agent), null);
  assert.equal(checkCommand('git commit -m "fix: x"', agent), null);
});

test('as a hook, it answers with a deny decision', () => {
  const r = spawnSync('node', [hook], { input: JSON.stringify({ tool_input: { command: 'glab mr merge 9' } }), encoding: 'utf8' });
  const out = JSON.parse(r.stdout);
  assert.equal(out.hookSpecificOutput.permissionDecision, 'deny');
  const ok = spawnSync('node', [hook], { input: JSON.stringify({ tool_input: { command: 'ls' } }), encoding: 'utf8' });
  assert.equal(ok.stdout, '', 'an allowed command gets no output, so the normal permission flow continues');
});

test('catches the push and merge forms an earlier review found missing', () => {
  for (const c of [
    'glab mr accept 12',
    'git -c x=y push origin main',
    'git push origin "main"',
    'git push origin +main',
    'git push --all',
    'git push --mirror',
  ]) {
    assert.ok(checkCommand(c), `should deny: ${c}`);
  }
  assert.ok(checkCommand('git push', { currentBranch: () => 'master' }), 'a bare push while on master');
  assert.equal(checkCommand('git push', { currentBranch: () => 'mike/feat/x' }), null);
});

test('inside a Friday agent, blocks amend, rebase, hard reset, and git -c overrides', () => {
  const agent = { agent: true };
  for (const c of [
    'git commit --amend --no-edit',
    'git -C /w commit -m x --amend',
    'git rebase -i HEAD~2',
    'git reset --hard HEAD~1',
    'git -c alias.x="!sh -c id" x',
    'git -c core.sshCommand=foo fetch',
  ]) {
    assert.ok(checkCommand(c, agent), `should deny for an agent: ${c}`);
  }
  assert.equal(checkCommand('git commit -m "fix(x): y"', agent), null);
  assert.equal(checkCommand('git -C /w diff --stat', agent), null);
});

test('the shell wrapper finds a node and blocks inside an agent when the guard cannot run', () => {
  const wrapper = path.join(path.dirname(hook), 'merge-guard.sh');
  const deny = spawnSync(wrapper, [], { input: JSON.stringify({ tool_input: { command: 'glab mr merge 1' } }), encoding: 'utf8' });
  assert.match(deny.stdout, /"permissionDecision":"deny"/);
  const broken = spawnSync('/bin/sh', [wrapper], {
    input: '{}',
    encoding: 'utf8',
    env: { PATH: '/nonexistent', HOME: '/nonexistent', FRIDAY_AGENT: '1' },
  });
  // With no usable node, an agent's command is blocked (exit 2) rather than let through.
  if (spawnSync('/opt/homebrew/bin/node', ['-v']).status !== 0 && spawnSync('/usr/local/bin/node', ['-v']).status !== 0) assert.equal(broken.status, 2);
});
