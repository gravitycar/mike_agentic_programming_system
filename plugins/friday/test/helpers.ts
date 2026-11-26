import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { fileURLToPath } from 'url';
import type { GitLabTransport } from '../src/gitlab.js';

/** A fresh FRIDAY_HOME, with notifications off and the real processes folder. */
export function tempHome(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'friday-test-'));
  process.env.FRIDAY_HOME = dir;
  process.env.FRIDAY_NO_NOTIFY = '1';
  return dir;
}

export const PLUGIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

type Handler = (method: string, apiPath: string, body?: Record<string, unknown>) => unknown;

/** A fake GitLab: routes are matched by "METHOD path-regex"; every call is logged. */
export class FakeGitLab implements GitLabTransport {
  calls: { method: string; path: string; body?: Record<string, unknown> }[] = [];
  constructor(private routes: [string, Handler][]) {}
  request(method: string, apiPath: string, body?: Record<string, unknown>): unknown {
    this.calls.push({ method, path: apiPath, body });
    for (const [key, h] of this.routes) {
      const [m, re] = key.split(' ', 2);
      if (m === method && new RegExp(re).test(apiPath)) return h(method, apiPath, body);
    }
    if (method === 'GET') return [];
    return {};
  }
  raw(apiPath: string): string {
    return String(this.request('GET', apiPath) ?? '');
  }
  writes() {
    return this.calls.filter((c) => c.method !== 'GET');
  }
}
