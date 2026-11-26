import { run } from './exec.js';
import type { Store } from './store.js';
import type { Mode } from './spec.js';

/** Request keys that would make GitLab merge, or merge later on its own. */
const MERGE_KEYS = ['merge_when_pipeline_succeeds', 'auto_merge', 'auto_merge_strategy', 'should_remove_source_branch'];
const MERGE_PATH = /\/merge_requests\/[^/]+\/merge(\/|\?|$)/;
const REFUSED_PATHS = [MERGE_PATH, /\/merge_requests\/[^/]+\/(cancel_merge_when_pipeline_succeeds|merge_ref)(\/|\?|$)/];

export class MergeRefused extends Error {}

/**
 * The merge guard's API layer. Friday has no merge function, and this refuses
 * any request that could merge an MR or set it to merge automatically.
 */
export function assertNotMerge(method: string, apiPath: string, body?: Record<string, unknown>): void {
  if (method.toUpperCase() !== 'GET' && REFUSED_PATHS.some((re) => re.test(apiPath))) {
    throw new MergeRefused(`Friday never merges: refused ${method} ${apiPath}`);
  }
  const keys = new Set<string>();
  const walk = (v: unknown) => {
    if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { keys.add(k); walk(x); }
  };
  walk(body);
  const query = apiPath.split('?')[1] ?? '';
  for (const k of MERGE_KEYS) {
    if (keys.has(k) || new RegExp(`(^|&)${k}=`).test(query)) throw new MergeRefused(`Friday never sets auto-merge: refused "${k}" in ${method} ${apiPath}`);
  }
}

export const pid = (project: string) => encodeURIComponent(project);

export interface GitLabTransport {
  request(method: string, apiPath: string, body?: Record<string, unknown>, paginate?: boolean): unknown;
  raw(apiPath: string): string;
}

/** Talks to GitLab through `glab api`, which carries Mike's sign-in. */
export class GlabTransport implements GitLabTransport {
  request(method: string, apiPath: string, body?: Record<string, unknown>, paginate = false): unknown {
    const args = ['api', '-X', method.toUpperCase(), apiPath];
    if (paginate) args.push('--paginate');
    let input: string | undefined;
    if (body) {
      args.push('-H', 'Content-Type: application/json', '--input', '-');
      input = JSON.stringify(body);
    }
    const r = run('glab', args, { input, timeoutMs: 120_000 });
    if (r.code !== 0) throw new Error(`glab api ${method} ${apiPath} failed: ${r.stderr.trim() || r.stdout.trim()}`);
    const out = r.stdout.trim();
    if (!out) return null;
    // --paginate concatenates JSON arrays: "][" between pages.
    if (paginate && out.startsWith('[')) return JSON.parse('[' + out.slice(1, -1).replace(/\]\s*\[/g, ',') + ']');
    return JSON.parse(out);
  }
  raw(apiPath: string): string {
    const r = run('glab', ['api', apiPath], { timeoutMs: 120_000 });
    if (r.code !== 0) throw new Error(`glab api GET ${apiPath} failed: ${r.stderr.trim()}`);
    return r.stdout;
  }
}

export class GitLab {
  constructor(private t: GitLabTransport = new GlabTransport()) {}

  get<T = unknown>(apiPath: string, paginate = false): T {
    return this.t.request('GET', apiPath, undefined, paginate) as T;
  }
  raw(apiPath: string): string {
    return this.t.raw(apiPath);
  }
  write<T = unknown>(method: 'POST' | 'PUT' | 'DELETE', apiPath: string, body?: Record<string, unknown>): T {
    assertNotMerge(method, apiPath, body);
    return this.t.request(method, apiPath, body) as T;
  }
}

export interface ActMeta {
  project?: string;
  mr?: number;
  subject?: string;
  detail?: string;
}

export class ActionNotAllowed extends Error {}

/**
 * Performs one process's outward actions. An action the process does not
 * declare is refused. In dry-run mode the action is recorded, not taken.
 */
export class Actor {
  constructor(
    readonly process: string,
    readonly mode: Mode,
    private outward: Set<string>,
    private store: Store,
    readonly gl: GitLab = new GitLab()
  ) {}

  act<T>(action: string, meta: ActMeta, perform: () => T): { dryRun: boolean; result?: T } {
    if (!this.outward.has(action)) {
      this.store.recordAction({ process: this.process, action, ...meta, mode: this.mode, ok: false, detail: 'refused: not an outward action of this process' });
      throw new ActionNotAllowed(`${this.process} may not ${action}. Its outward actions: ${[...this.outward].join(', ') || 'none'}`);
    }
    if (this.mode === 'dry-run') {
      this.store.recordAction({ process: this.process, action, ...meta, mode: 'dry-run', ok: true, detail: meta.detail });
      return { dryRun: true };
    }
    try {
      const result = perform();
      this.store.recordAction({ process: this.process, action, ...meta, mode: 'live', ok: true, detail: meta.detail });
      return { dryRun: false, result };
    } catch (e) {
      this.store.recordAction({ process: this.process, action, ...meta, mode: 'live', ok: false, detail: String(e) });
      throw e;
    }
  }

  retryJob(project: string, jobId: number, meta: ActMeta = {}) {
    return this.act('retry_job', { project, subject: `job:${jobId}`, ...meta }, () =>
      this.gl.write('POST', `projects/${pid(project)}/jobs/${jobId}/retry`)
    );
  }
  playJob(project: string, jobId: number, meta: ActMeta = {}) {
    return this.act('play_job', { project, subject: `job:${jobId}`, ...meta }, () =>
      this.gl.write('POST', `projects/${pid(project)}/jobs/${jobId}/play`)
    );
  }
  addLabel(project: string, mr: number, label: string) {
    return this.act('add_label', { project, mr, subject: `label:${label}` }, () =>
      this.gl.write('PUT', `projects/${pid(project)}/merge_requests/${mr}`, { add_labels: label })
    );
  }
  removeLabel(project: string, mr: number, label: string) {
    return this.act('remove_label', { project, mr, subject: `label:${label}` }, () =>
      this.gl.write('PUT', `projects/${pid(project)}/merge_requests/${mr}`, { remove_labels: label })
    );
  }
  postReply(project: string, mr: number, discussion: string, body: string) {
    return this.act('post_reply', { project, mr, subject: `discussion:${discussion}`, detail: body }, () =>
      this.gl.write('POST', `projects/${pid(project)}/merge_requests/${mr}/discussions/${discussion}/notes`, { body })
    );
  }
  postNote(project: string, mr: number, body: string) {
    return this.act('post_note', { project, mr, subject: 'note', detail: body }, () =>
      this.gl.write('POST', `projects/${pid(project)}/merge_requests/${mr}/notes`, { body })
    );
  }
  addReaction(project: string, mr: number, noteId: number, name: string) {
    return this.act('add_reaction', { project, mr, subject: `note:${noteId}:${name}` }, () =>
      this.gl.write('POST', `projects/${pid(project)}/merge_requests/${mr}/notes/${noteId}/award_emoji`, { name })
    );
  }
}
