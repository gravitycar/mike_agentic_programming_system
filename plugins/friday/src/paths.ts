import * as os from 'os';
import * as path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));

/** plugins/friday, found from dist/src/<file>.js. */
export const PLUGIN_DIR = path.resolve(here, '..', '..');

/** The repo root, two levels above the plugin. */
export const REPO_DIR = path.resolve(PLUGIN_DIR, '..', '..');

/** The launcher every scheduled job, SwiftBar item and agent calls. */
export const FRIDAY_BIN = path.join(PLUGIN_DIR, 'bin', 'friday');

/** Friday's state folder. FRIDAY_HOME overrides it, for tests. */
export function fridayHome(): string {
  return process.env.FRIDAY_HOME ?? path.join(os.homedir(), '.friday');
}

export const statePath = () => path.join(fridayHome(), 'state.db');
export const configPath = () => path.join(fridayHome(), 'config.json');
export const logsDir = () => path.join(fridayHome(), 'logs');
export const locksDir = () => path.join(fridayHome(), 'locks');
export const worktreesDir = () => path.join(fridayHome(), 'worktrees');
export const workDir = () => path.join(fridayHome(), 'work');
export const dryRunDir = () => path.join(fridayHome(), 'dry-run');

export function expandHome(p: string): string {
  return p.startsWith('~/') ? path.join(os.homedir(), p.slice(2)) : p;
}
