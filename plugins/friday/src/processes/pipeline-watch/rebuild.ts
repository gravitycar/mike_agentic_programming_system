import { loadConfig } from '../../config.js';
import { GitLab, pid, type Actor } from '../../gitlab.js';
import { mrDetail, newestByName, pipelineJobs, type Job } from '../../mrs.js';
import type { Store } from '../../store.js';
import { PROCESS, reviewEnvUrl } from './precheck.js';

export const DELETE_JOB = 'delete-review-env-manual';
export const DEPLOY_MANUAL_JOB = 'deploy-review-env-manual';
export const DEPLOY_AUTO_JOB = 'deploy-review-env';
const TERMINAL = new Set(['success', 'failed', 'canceled', 'skipped']);

type Step = 'start' | 'deleting' | 'deploying' | 'auto-deploy' | 'health' | 'done';

export interface RebuildState {
  step: Step;
  pipeline: number;
  startedAt: string;
}

export interface RebuildResult {
  status: 'in_progress' | 'done' | 'failed' | 'refused' | 'dry-run';
  step?: Step;
  message: string;
}

export interface RebuildDeps {
  gl: GitLab;
  sleep: (ms: number) => Promise<void>;
  /** Returns true when the review env answers. */
  health: (url: string) => Promise<boolean>;
  budgetMs: number;
}

const defaultDeps = (): RebuildDeps => ({
  gl: new GitLab(),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  health: async (url) => {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(15_000), redirect: 'follow' });
      return r.status === 200;
    } catch {
      return false;
    }
  },
  budgetMs: 8 * 60_000,
});

const stepKey = (project: string, mr: number) => `rebuild:${project}:${mr}`;

/** Plays a manual job, or retries a finished one. */
function start(actor: Actor, project: string, mr: number, job: Job, subject: string) {
  if (job.status === 'manual') return actor.playJob(project, job.id, { mr, subject });
  return actor.retryJob(project, job.id, { mr, subject });
}

/**
 * Rebuilds an MR's review env: delete, then deploy (always together), then the
 * auto deploy, then a health check, then a retry of the failed Cypress jobs.
 * Each call advances as far as it can within the time budget and returns
 * in_progress; call it again until done or failed. At most one rebuild per MR
 * per day.
 */
export async function rebuildReviewEnv(store: Store, actor: Actor, project: string, mr: number, deps: Partial<RebuildDeps> = {}): Promise<RebuildResult> {
  const d = { ...defaultDeps(), ...deps };
  const key = stepKey(project, mr);
  const saved = store.step(key);
  let state: RebuildState | null = saved ? (JSON.parse(saved) as RebuildState) : null;
  if (state) {
    const stale = Date.now() - Date.parse(state.startedAt) > 2 * 3_600_000;
    const head = mrDetail(d.gl, project, mr).head_pipeline;
    if (stale || !head || head.id !== state.pipeline) {
      store.setStep(key, null);
      state = null;
      if (stale) return { status: 'failed', message: 'An earlier rebuild of this env stalled for over 2 hours. Escalate to Mike.' };
    }
  }

  if (!state) {
    const since = new Date(Date.now() - 24 * 3_600_000).toISOString();
    if (store.countActions({ process: PROCESS, action: 'rebuild_review_env', project, mr, sinceIso: since, mode: actor.mode }) >= 1) {
      return { status: 'refused', message: 'This MR already had a review-env rebuild in the last 24 hours. Escalate to Mike instead.' };
    }
    const detail = mrDetail(d.gl, project, mr);
    if (!detail.head_pipeline) return { status: 'failed', message: 'The MR has no head pipeline.' };
    const r = actor.act('rebuild_review_env', { project, mr, subject: `pipeline:${detail.head_pipeline.id}`, detail: 'delete + deploy review env, then retry Cypress' }, () => true);
    if (r.dryRun) {
      return { status: 'dry-run', message: `Would rebuild the review env for ${project}!${mr}: play ${DELETE_JOB}, then ${DEPLOY_MANUAL_JOB}, retry ${DEPLOY_AUTO_JOB}, check the env answers, then retry the failed Cypress jobs.` };
    }
    state = { step: 'start', pipeline: detail.head_pipeline.id, startedAt: new Date().toISOString() };
  }

  const deadline = Date.now() + d.budgetMs;
  const save = () => store.setStep(key, JSON.stringify(state));
  const jobs = () => newestByName(pipelineJobs(d.gl, project, state!.pipeline));
  const need = (name: string): Job => {
    const j = jobs().get(name);
    if (!j) throw new Error(`The pipeline has no ${name} job.`);
    return j;
  };
  const fail = (message: string): RebuildResult => {
    store.setStep(key, null);
    return { status: 'failed', step: state!.step, message };
  };
  /** Waits for a job to finish. Returns its status, or null when the budget runs out. */
  const waitFor = async (name: string): Promise<string | null> => {
    while (Date.now() < deadline) {
      const j = need(name);
      if (TERMINAL.has(j.status)) return j.status;
      await d.sleep(20_000);
    }
    return null;
  };

  try {
    if (state.step === 'start') {
      start(actor, project, mr, need(DELETE_JOB), `rebuild:${state.pipeline}:delete`);
      state.step = 'deleting';
      save();
    }
    if (state.step === 'deleting') {
      const s = await waitFor(DELETE_JOB);
      if (s === null) return { status: 'in_progress', step: state.step, message: 'Waiting for the delete job.' };
      if (s !== 'success') return fail(`${DELETE_JOB} ended ${s}. The env may be half-deleted; Mike must look.`);
      start(actor, project, mr, need(DEPLOY_MANUAL_JOB), `rebuild:${state.pipeline}:deploy`);
      state.step = 'deploying';
      save();
    }
    if (state.step === 'deploying') {
      const s = await waitFor(DEPLOY_MANUAL_JOB);
      if (s === null) return { status: 'in_progress', step: state.step, message: 'Waiting for the manual deploy.' };
      if (s !== 'success') return fail(`${DEPLOY_MANUAL_JOB} ended ${s}. The review env is down; Mike must look.`);
      const auto = jobs().get(DEPLOY_AUTO_JOB);
      if (auto && auto.status !== 'success') start(actor, project, mr, auto, `rebuild:${state.pipeline}:auto-deploy`);
      state.step = 'auto-deploy';
      save();
    }
    if (state.step === 'auto-deploy') {
      if (jobs().has(DEPLOY_AUTO_JOB)) {
        const s = await waitFor(DEPLOY_AUTO_JOB);
        if (s === null) return { status: 'in_progress', step: state.step, message: 'Waiting for the auto deploy.' };
        if (s !== 'success') return fail(`${DEPLOY_AUTO_JOB} ended ${s} after the rebuild.`);
      }
      state.step = 'health';
      save();
    }
    if (state.step === 'health') {
      const detail = mrDetail(d.gl, project, mr);
      const url = reviewEnvUrl(loadConfig(), project, detail.source_branch);
      if (url) {
        let up = false;
        while (!up && Date.now() < deadline) {
          up = await d.health(url);
          if (!up) await d.sleep(15_000);
        }
        if (!up) return { status: 'in_progress', step: state.step, message: `Waiting for ${url} to answer.` };
      }
      for (const j of jobs().values()) {
        if (j.status === 'failed' && !j.allow_failure && (/cypress/i.test(j.name) || j.name === 'reseed-review-env')) {
          actor.retryJob(project, j.id, { mr, subject: `rebuild:${state.pipeline}:retry:${j.name}` });
        }
      }
      state.step = 'done';
      store.setStep(key, null);
      return { status: 'done', step: 'done', message: 'Review env rebuilt; the failed Cypress jobs were retried.' };
    }
    return { status: 'done', step: state.step, message: 'Nothing left to do.' };
  } catch (e) {
    return fail(String(e));
  }
}

/** The raw log of a job, cut to its last lines. */
export function jobLogTail(gl: GitLab, project: string, jobId: number, lines = 300): string {
  const log = gl.raw(`projects/${pid(project)}/jobs/${jobId}/trace`);
  return log.split('\n').slice(-lines).join('\n');
}
