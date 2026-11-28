import * as fs from 'fs';
import * as path from 'path';
import { fridayHome } from './paths.js';

const API = 'https://api.app.shortcut.com/api/v3';

export interface Story {
  id: number;
  name: string;
  description?: string;
  story_type: string;
  owner_ids: string[];
  group_id: string | null;
  workflow_state_id: number;
  iteration_id: number | null;
  epic_id: number | null;
  app_url: string;
  created_at: string;
  archived?: boolean;
  custom_fields?: { field_id: string; value: string; position?: number }[];
}

export interface ShortcutTransport {
  get(apiPath: string, query?: Record<string, string>): Promise<unknown>;
  put(apiPath: string, body: Record<string, unknown>): Promise<unknown>;
}

export function shortcutToken(): string {
  const file = path.join(fridayHome(), 'shortcut-token');
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8').trim();
  if (process.env.SHORTCUT_API_TOKEN) return process.env.SHORTCUT_API_TOKEN;
  throw new Error(`No Shortcut token: put it in ${file} (mode 600) or set SHORTCUT_API_TOKEN.`);
}

export class HttpShortcut implements ShortcutTransport {
  constructor(private token = shortcutToken()) {}
  private async call(method: string, apiPath: string, query?: Record<string, string>, body?: Record<string, unknown>) {
    const url = new URL(API + apiPath);
    for (const [k, v] of Object.entries(query ?? {})) url.searchParams.set(k, v);
    const r = await fetch(url, {
      method,
      headers: { 'Shortcut-Token': this.token, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30_000),
    });
    if (!r.ok) throw new Error(`Shortcut ${method} ${apiPath} failed: ${r.status} ${(await r.text()).slice(0, 200)}`);
    return r.json();
  }
  get(apiPath: string, query?: Record<string, string>) {
    return this.call('GET', apiPath, query);
  }
  put(apiPath: string, body: Record<string, unknown>) {
    return this.call('PUT', apiPath, undefined, body);
  }
}

export class Shortcut {
  constructor(readonly t: ShortcutTransport = new HttpShortcut()) {}

  /** Every story a search query matches, following pages up to `max`. */
  async search(query: string, max = 400): Promise<Story[]> {
    const out: Story[] = [];
    let next: string | undefined;
    do {
      const q: Record<string, string> = { query, page_size: '25', detail: 'slim' };
      if (next) q.next = next;
      const page = (await this.t.get('/search/stories', q)) as { data: Story[]; next: string | null };
      out.push(...page.data);
      next = page.next ? (new URL(page.next, API).searchParams.get('next') ?? undefined) : undefined;
    } while (next && out.length < max);
    return out;
  }

  story(id: number): Promise<Story> {
    return this.t.get(`/stories/${id}`) as Promise<Story>;
  }

  /** The current iterations' ids. */
  async currentIterations(): Promise<Set<number>> {
    const its = (await this.t.get('/iterations')) as { id: number; status: string }[];
    return new Set(its.filter((i) => i.status === 'started').map((i) => i.id));
  }

  /** Sets the owner and moves the story to In Progress. */
  claim(id: number, ownerId: string, inProgressStateId: number): Promise<unknown> {
    return this.t.put(`/stories/${id}`, { owner_ids: [ownerId], workflow_state_id: inProgressStateId });
  }
}
