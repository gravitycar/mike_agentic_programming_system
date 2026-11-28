import * as fs from 'fs';
import * as path from 'path';
import { PLUGIN_DIR } from './paths.js';

export type Mode = 'dry-run' | 'live';

export interface ProcessSpec {
  name: string;
  description: string;
  /** `10m`, `1h`, `daily 08:30`, or `manual`. */
  schedule: string;
  precheck?: string;
  fanOut?: string;
  maxParallel: number;
  /** `worktree`, `work`, or a folder under ~/. */
  cwd: string;
  model: string;
  maxBudgetUsd: number;
  timeoutMs: number;
  permissionMode: string;
  allowedTools: string[];
  disallowedTools: string[];
  outwardActions: string[];
  /**
   * When set, every Bash command runs in Claude Code's sandbox, with network
   * access only to these hosts. GitLab and GitHub are always denied; only the
   * `friday` command runs outside the sandbox.
   */
  sandboxDomains?: string[];
  /** Where the agent runs: unset for this Mac, or `bartleby` (the quickwin user, which holds no credentials). */
  runsOn?: string;
  /** The mode a process starts in, before Mike changes it. */
  defaultMode: Mode;
  command?: string;
  prompt: string;
}

const KEYS = new Set([
  'description', 'schedule', 'precheck', 'fan_out', 'max_parallel', 'cwd', 'model',
  'max_budget_usd', 'timeout', 'permission_mode', 'allowed_tools', 'disallowed_tools',
  'outward_actions', 'mode', 'command', 'sandbox_domains', 'runs_on',
]);

/** Modes that skip permission checks are refused for every process. */
const REFUSED_MODES = new Set(['bypassPermissions']);

export const processesDir = () => process.env.FRIDAY_PROCESSES_DIR ?? path.join(PLUGIN_DIR, 'processes');

export function parseDuration(s: string): number {
  const m = /^(\d+)(s|m|h)$/.exec(s.trim());
  if (!m) throw new Error(`Bad duration "${s}". Use 90s, 15m or 1h.`);
  return Number(m[1]) * { s: 1000, m: 60_000, h: 3_600_000 }[m[2] as 's' | 'm' | 'h'];
}

function parseValue(v: string): string | string[] {
  v = v.trim();
  if (v.startsWith('[')) {
    if (!v.endsWith(']')) throw new Error(`Unclosed list: ${v}`);
    const inner = v.slice(1, -1).trim();
    if (!inner) return [];
    const out: string[] = [];
    const re = /\s*("([^"]*)"|[^,]+)\s*(,|$)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(inner)) && m[0] !== '') out.push((m[2] ?? m[1]).trim());
    return out;
  }
  if (v.startsWith('"') && v.endsWith('"')) return v.slice(1, -1);
  return v;
}

export function parseProcessFile(name: string, text: string): ProcessSpec {
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text);
  if (!m) throw new Error(`${name}: process.md must start with --- frontmatter ---`);
  const fm: Record<string, string | string[]> = {};
  m[1].split('\n').forEach((line, i) => {
    if (!line.trim() || line.trim().startsWith('#')) return;
    const kv = /^([a-z_]+):\s*(.*)$/.exec(line);
    if (!kv) throw new Error(`${name}: frontmatter line ${i + 1} is not "key: value": ${line}`);
    if (!KEYS.has(kv[1])) throw new Error(`${name}: unknown key "${kv[1]}"`);
    fm[kv[1]] = parseValue(kv[2]);
  });
  const str = (k: string, d = '') => (typeof fm[k] === 'string' ? (fm[k] as string) : d);
  const list = (k: string) => (Array.isArray(fm[k]) ? (fm[k] as string[]) : []);
  const prompt = m[2].trim();
  const command = str('command') || undefined;
  if (command && prompt) throw new Error(`${name}: a command process takes no prompt`);
  if (!command && !prompt) throw new Error(`${name}: needs a prompt or a command`);
  const permissionMode = str('permission_mode', 'dontAsk');
  if (REFUSED_MODES.has(permissionMode)) throw new Error(`${name}: permission_mode ${permissionMode} is refused`);
  const mode = str('mode', 'dry-run');
  if (mode !== 'dry-run' && mode !== 'live') throw new Error(`${name}: mode must be dry-run or live`);
  return {
    name,
    description: str('description'),
    schedule: str('schedule', 'manual'),
    precheck: str('precheck') || undefined,
    fanOut: str('fan_out') || undefined,
    maxParallel: Number(str('max_parallel', '3')),
    cwd: str('cwd', 'work'),
    model: str('model', 'sonnet'),
    maxBudgetUsd: Number(str('max_budget_usd', '1')),
    timeoutMs: parseDuration(str('timeout', '15m')),
    permissionMode,
    allowedTools: list('allowed_tools'),
    disallowedTools: list('disallowed_tools'),
    outwardActions: list('outward_actions'),
    sandboxDomains: 'sandbox_domains' in fm ? list('sandbox_domains') : undefined,
    runsOn: str('runs_on') || undefined,
    defaultMode: mode,
    command,
    prompt,
  };
}

export function loadProcess(name: string): ProcessSpec {
  const file = path.join(processesDir(), name, 'process.md');
  if (!fs.existsSync(file)) throw new Error(`No process named "${name}" (looked for ${file})`);
  return parseProcessFile(name, fs.readFileSync(file, 'utf8'));
}

export function listProcesses(): ProcessSpec[] {
  const dir = processesDir();
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((d) => fs.existsSync(path.join(dir, d, 'process.md')))
    .sort()
    .map(loadProcess);
}

/** Splits a command line into argv, honouring double quotes. `friday` maps to the launcher. */
export function splitCommand(line: string, fridayBin: string): string[] {
  const out: string[] = [];
  const re = /"([^"]*)"|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) out.push(m[1] ?? m[2]);
  if (out[0] === 'friday') out[0] = fridayBin;
  return out;
}
