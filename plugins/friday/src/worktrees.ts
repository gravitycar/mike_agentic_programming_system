import * as fs from 'fs';
import * as path from 'path';
import { run, runOk } from './exec.js';
import { worktreesDir } from './paths.js';

const slug = (s: string) => s.replace(/[^A-Za-z0-9._-]+/g, '-');

/**
 * Creates, or refreshes, a detached worktree at origin/<branch>. Detached, so
 * it never competes with a checkout of the same branch in Mike's own clone.
 * An existing worktree is reset to origin/<branch> and keeps its ignored files
 * (node_modules, build output), so dependencies are installed once per MR.
 */
export function createWorktree(clone: string, project: string, branch: string, key: string): string {
  runOk('git', ['-C', clone, 'fetch', '--quiet', 'origin', `+refs/heads/${branch}:refs/remotes/origin/${branch}`], { timeoutMs: 300_000 });
  const wt = worktreePath(project, key);
  if (fs.existsSync(wt)) {
    const ok = run('git', ['-C', wt, 'checkout', '--detach', '--force', `origin/${branch}`]).code === 0;
    if (ok) {
      run('git', ['-C', wt, 'clean', '-fd']);
      return wt;
    }
    removeWorktree(clone, wt);
  }
  fs.mkdirSync(path.dirname(wt), { recursive: true });
  runOk('git', ['-C', clone, 'worktree', 'add', '--detach', '--quiet', wt, `origin/${branch}`], { timeoutMs: 300_000 });
  return wt;
}

export const worktreePath = (project: string, key: string) => path.join(worktreesDir(), slug(project), slug(key));

/** Removes Friday-owned worktrees under a project whose key is not kept. */
export function pruneWorktrees(clone: string, project: string, prefix: string, keep: Set<string>): string[] {
  const dir = path.join(worktreesDir(), slug(project));
  if (!fs.existsSync(dir)) return [];
  const removed: string[] = [];
  for (const name of fs.readdirSync(dir)) {
    if (name.startsWith(slug(prefix)) && !keep.has(name)) {
      removeWorktree(clone, path.join(dir, name));
      removed.push(name);
    }
  }
  return removed;
}

export function removeWorktree(clone: string, wt: string): void {
  run('git', ['-C', clone, 'worktree', 'remove', '--force', wt]);
  if (fs.existsSync(wt)) fs.rmSync(wt, { recursive: true, force: true });
  run('git', ['-C', clone, 'worktree', 'prune']);
}

interface WorktreeEntry {
  path: string;
  branch?: string;
}

export function listWorktrees(clone: string): WorktreeEntry[] {
  const out = run('git', ['-C', clone, 'worktree', 'list', '--porcelain']).stdout;
  const entries: WorktreeEntry[] = [];
  let cur: WorktreeEntry | null = null;
  for (const line of out.split('\n')) {
    if (line.startsWith('worktree ')) {
      if (cur) entries.push(cur);
      cur = { path: line.slice(9) };
    } else if (line.startsWith('branch ') && cur) {
      cur.branch = line.slice(7).replace(/^refs\/heads\//, '');
    }
  }
  if (cur) entries.push(cur);
  return entries;
}

/** Working folders of running `claude` processes, best effort. */
export function claudeSessionDirs(): string[] {
  const r = run('lsof', ['-a', '-c', 'claude', '-d', 'cwd', '-Fn']);
  return r.stdout
    .split('\n')
    .filter((l) => l.startsWith('n/'))
    .map((l) => l.slice(1));
}

/**
 * Why a branch is busy, or null. Busy means a checkout of it has unsaved
 * changes, or a Claude session is running in a checkout of it.
 */
export function branchBusy(clone: string, branch: string, sessionDirs = claudeSessionDirs()): string | null {
  for (const wt of listWorktrees(clone)) {
    if (wt.branch !== branch) continue;
    const status = run('git', ['-C', wt.path, 'status', '--porcelain']).stdout.trim();
    if (status) return `unsaved changes in ${wt.path}`;
    if (sessionDirs.some((d) => d === wt.path || d.startsWith(wt.path + path.sep))) {
      return `a Claude session is running in ${wt.path}`;
    }
  }
  return null;
}

export class PushRefused extends Error {}

const PROTECTED = new Set(['master', 'main', 'develop']);

/**
 * Pushes the worktree's HEAD to the MR's branch. Never forces, and never pushes
 * to a default branch. A rejected push (origin moved) returns ok: false.
 */
export function pushBranch(wt: string, branch: string, defaultBranch: string): { ok: boolean; message: string } {
  if (branch === defaultBranch || PROTECTED.has(branch)) {
    throw new PushRefused(`Friday never pushes to ${branch}.`);
  }
  const r = run('git', ['-C', wt, 'push', '--porcelain', 'origin', `HEAD:refs/heads/${branch}`], { timeoutMs: 300_000 });
  if (r.code === 0) return { ok: true, message: r.stdout.trim() };
  return { ok: false, message: (r.stderr || r.stdout).trim() };
}
