import { loadConfig, projectConfig, refSlug, type FridayConfig } from '../../config.js';
import { actorFor } from '../../context.js';
import { GitLab, type Actor } from '../../gitlab.js';
import { labelRemovedByMike, settle, settleClosed } from '../../inbox.js';
import { mrDetail, newestByName, openMRs, pipelineJobs, type Job, type MR } from '../../mrs.js';
import type { Store } from '../../store.js';

export const PROCESS = 'pipeline-watch';

/** GitLab failure reasons that mean the infrastructure failed, not the code. */
export const INFRA_REASONS = new Set([
  'runner_system_failure',
  'stuck_or_timeout_failure',
  'scheduler_failure',
  'api_failure',
  'runner_unsupported',
  'data_integrity_failure',
  'unmet_prerequisites',
]);

export const MAX_RETRIES_PER_JOB = 2;

export function reviewEnvUrl(cfg: FridayConfig, project: string, branch: string): string | null {
  const tpl = projectConfig(cfg, project).reviewEnvUrl;
  return tpl ? tpl.replace('{slug}', refSlug(branch).slice(0, 50)) : null;
}

/** Settles this MR's pipeline escalations once the pipeline they were about has moved on. */
function settleStale(store: Store, actor: Actor, cfg: FridayConfig, project: string, mr: MR): void {
  for (const e of store.openFor({ process: PROCESS, project, mr: mr.iid })) {
    const pipe = /^pipeline:(\d+)/.exec(e.subject ?? '');
    const hp = mr.head_pipeline;
    if (pipe && hp && (Number(pipe[1]) !== hp.id || hp.status === 'success')) {
      settle(store, actor, e.id, hp.status === 'success' ? 'pipeline passed' : 'a newer pipeline replaced it', cfg);
    } else if (labelRemovedByMike(e, mr.labels, cfg)) {
      settle(store, actor, e.id, 'Mike removed the label', cfg);
    }
  }
}

export interface PipelineItem {
  label: string;
  project: string;
  mr: number;
  branch: string;
  web_url: string;
  pipeline: { id: number; sha: string; web_url: string };
  failed_jobs: { id: number; name: string; stage: string; failure_reason?: string; web_url: string; retries_used: number }[];
  review_env_url: string | null;
  handled_keys: string[];
}

export function pipelineWatchPrecheck(store: Store, gl = new GitLab(), cfg = loadConfig(), log: (s: string) => void = (s) => void process.stderr.write(s + "\n")): PipelineItem[] {
  const actor = actorFor(PROCESS, store, gl);
  const items: PipelineItem[] = [];
  for (const { project } of cfg.projects) {
    const open = openMRs(gl, project, cfg.gitlabUser);
    settleClosed(store, actor, PROCESS, project, new Set(open.map((m) => m.iid)), cfg);
    for (const listed of open) {
      const mr = mrDetail(gl, project, listed.iid);
      settleStale(store, actor, cfg, project, mr);
      const hp = mr.head_pipeline;
      if (!hp || hp.status !== 'failed') continue;

      const newest = newestByName(pipelineJobs(gl, project, hp.id));
      const failed = [...newest.values()].filter((j) => j.status === 'failed' && !j.allow_failure);
      if (failed.length === 0) continue;

      const rest: Job[] = [];
      for (const j of failed) {
        const subject = `pipeline:${hp.id}:job:${j.name}`;
        const used = store.countActions({ process: PROCESS, action: 'retry_job', subjectLike: subject, mode: actor.mode });
        if (j.failure_reason && INFRA_REASONS.has(j.failure_reason) && used < MAX_RETRIES_PER_JOB) {
          try {
            actor.retryJob(project, j.id, { mr: mr.iid, subject, detail: `deterministic retry: ${j.failure_reason}` });
            log(`${project}!${mr.iid}: retried ${j.name} (${j.failure_reason}), retry ${used + 1}/${MAX_RETRIES_PER_JOB}`);
          } catch (e) {
            log(`${project}!${mr.iid}: could not retry ${j.name}: ${String(e).slice(0, 200)}`);
            rest.push(j);
          }
        } else {
          rest.push(j);
        }
      }
      if (rest.length === 0) continue;

      const key = `pipeline:${hp.id}:jobs:${rest.map((j) => j.id).sort((a, b) => a - b).join(',')}`;
      if (store.isHandled(PROCESS, key)) continue;
      items.push({
        label: `${project.split('/').pop()}-mr-${mr.iid}`,
        project,
        mr: mr.iid,
        branch: mr.source_branch,
        web_url: mr.web_url,
        pipeline: { id: hp.id, sha: hp.sha, web_url: hp.web_url },
        failed_jobs: rest.map((j) => ({
          id: j.id,
          name: j.name,
          stage: j.stage,
          failure_reason: j.failure_reason,
          web_url: j.web_url,
          retries_used: store.countActions({ process: PROCESS, action: 'retry_job', subjectLike: `pipeline:${hp.id}:job:${j.name}`, mode: actor.mode }),
        })),
        review_env_url: reviewEnvUrl(cfg, project, mr.source_branch),
        handled_keys: [key],
      });
    }
  }
  return items;
}
