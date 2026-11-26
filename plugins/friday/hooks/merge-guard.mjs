#!/usr/bin/env node
// Friday's merge guard, run as a PreToolUse hook on Bash. Plain JavaScript with
// no dependencies, so it works wherever the plugin is installed, unbuilt.
//
// Always denies: merging an MR, setting auto-merge, and pushing to a default
// branch. Inside a Friday agent (FRIDAY_AGENT=1) it also denies force pushes,
// amends and history rewrites, direct glab/curl use, and git push outside
// `friday act push`.
//
// This guard reads command text. It cannot see what a program does once it
// runs, so it is one layer of several, not a sandbox.

import { spawnSync } from 'node:child_process';

const DEFAULT_BRANCHES = ['master', 'main', 'develop'];

/** git, followed by any global options, followed by `sub`. */
const gitSub = (sub) => new RegExp(`\\bgit\\b((?:\\s+(?:-[cC]\\s+\\S+|--\\S+))*)\\s+${sub}\\b(.*)$`);

/**
 * @param {string} command
 * @param {{ agent?: boolean, currentBranch?: () => string | null }} opts
 * @returns {string|null} the reason to deny, or null to allow
 */
export function checkCommand(command, { agent = false, currentBranch = () => null } = {}) {
  const c = ` ${command.replace(/\s+/g, ' ')} `;
  const unquoted = c.replace(/["']/g, '');

  if (/\bglab\s+mr\s+(merge|accept)\b/.test(c)) return 'Friday never merges an MR: `glab mr merge` is blocked. Mike merges by hand.';
  if (/\bmerge_requests\/[^\s/]+\/merge\b(?!_)/.test(c)) return 'Friday never merges an MR: the GitLab merge endpoint is blocked.';
  if (/merge_when_pipeline_succeeds|auto_merge|--auto-merge\b|--when-pipeline-succeeds\b/.test(c)) {
    return 'Friday never sets an MR to merge automatically.';
  }

  const push = gitSub('push').exec(unquoted);
  if (push) {
    const rest = push[2];
    if (/\s--(all|mirror)\b/.test(rest)) return 'Pushing every branch is blocked: it can push to a default branch.';
    for (const b of DEFAULT_BRANCHES) {
      const re = new RegExp(`(\\s|:|\\+|refs/heads/)${b}(\\s|$|;|&|\\|)`);
      if (re.test(rest)) return `Pushing to ${b} is blocked. Mike merges to the default branch by hand.`;
    }
    const positional = rest.split(/[;&|]/)[0].trim().split(' ').filter((t) => t && !t.startsWith('-'));
    if (positional.length <= 1) {
      const branch = currentBranch();
      if (branch && DEFAULT_BRANCHES.includes(branch)) return `You are on ${branch}; pushing it is blocked. Mike merges to the default branch by hand.`;
    }
    if (agent) {
      if (/\s(--force|-f|--force-with-lease\S*|--force-if-includes|\+\S+)(\s|$)/.test(rest)) return 'Friday agents never force-push.';
      return 'Friday agents push only with `friday act push`.';
    }
  }

  if (agent) {
    if (gitSub('commit').test(unquoted) && /\s--amend\b/.test(gitSub('commit').exec(unquoted)[2])) {
      return 'Friday agents never amend: make a new commit.';
    }
    if (gitSub('(rebase|filter-branch|filter-repo|replace)').test(unquoted) || /\bgit\b.*\sreset\s+--hard\b/.test(unquoted)) {
      return 'Friday agents never rewrite history: make a new commit.';
    }
    if (/\bgit\b(\s+\S+)*\s+-c\s+(alias|core\.sshCommand|core\.hooksPath|credential)/i.test(unquoted)) {
      return 'Friday agents may not override git aliases, hooks, ssh or credentials.';
    }
    if (/(^|[\s;&|(`$])glab(\s|$)/.test(c)) {
      return 'Friday agents read GitLab with `friday gl get` and act with `friday act`, not glab.';
    }
    if (/\bcurl\b.*gitlab/i.test(c)) return 'Friday agents reach GitLab only through `friday gl` and `friday act`.';
  }
  return null;
}

function branchIn(cwd) {
  if (!cwd) return null;
  const r = spawnSync('git', ['-C', cwd, 'rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
}

async function main() {
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;
  let input = {};
  try {
    input = JSON.parse(raw || '{}');
  } catch {
    return;
  }
  const command = input?.tool_input?.command;
  if (typeof command !== 'string') return;
  const reason = checkCommand(command, {
    agent: process.env.FRIDAY_AGENT === '1',
    currentBranch: () => branchIn(input?.cwd),
  });
  if (!reason) return;
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason },
    })
  );
}

if (import.meta.url === `file://${process.argv[1]}`) main();
