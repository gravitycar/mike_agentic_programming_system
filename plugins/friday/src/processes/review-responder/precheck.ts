import { loadConfig, projectConfig, type FridayConfig } from '../../config.js';
import { actorFor } from '../../context.js';
import { GitLab, type Actor } from '../../gitlab.js';
import { labelRemovedByMike, settle, settleClosed } from '../../inbox.js';
import { discussions, noteAwards, openMRs, type Discussion, type MR, type Note } from '../../mrs.js';
import type { Store } from '../../store.js';
import { branchBusy, claudeSessionDirs, pruneWorktrees, worktreePath } from '../../worktrees.js';

export const PROCESS = 'review-responder';
/** Words every escalation reply contains, so a later run can recognise one. */
export const ESCALATION_MARK = 'flagged this for a decision';

export interface ThreadItem {
  discussion_id: string;
  resolvable: boolean;
  file?: string;
  line?: number;
  notes: { id: number; author: string; body: string; created_at: string }[];
  /** Why the thread came back: a reviewer note, or Mike's answer to an escalation. */
  reason: 'reviewer' | 'mike-answered' | 'mike-approved';
}

export interface ReviewItem {
  label: string;
  project: string;
  mr: number;
  branch: string;
  target_branch: string;
  web_url: string;
  title: string;
  description: string;
  threads: ThreadItem[];
  handled_keys: string[];
}

export function isBotNote(n: Note, cfg: FridayConfig): boolean {
  return n.author.username === cfg.gitlabUser && n.body.trimStart().startsWith(cfg.replyHeader);
}

const isEscalationNote = (n: Note, cfg: FridayConfig) => isBotNote(n, cfg) && n.body.includes(ESCALATION_MARK);

/**
 * Decides whether a thread waits on Friday. Returns the reason and the key
 * that marks this state handled, or null.
 */
export function threadState(
  d: Discussion,
  cfg: FridayConfig,
  awardsOf: (noteId: number) => { name: string; user: { username: string } }[]
): { reason: ThreadItem['reason']; key: string } | null {
  const notes = d.notes.filter((n) => !n.system);
  if (notes.length === 0) return null;
  const first = notes[0];
  if (first.resolvable && notes.every((n) => n.resolved)) return null;
  const last = notes[notes.length - 1];
  const me = cfg.gitlabUser;

  if (last.author.username !== me) return { reason: 'reviewer', key: `thread:${d.id}:${last.id}` };

  if (!isBotNote(last, cfg)) {
    const prev = notes[notes.length - 2];
    if (prev && isEscalationNote(prev, cfg)) return { reason: 'mike-answered', key: `thread:${d.id}:${last.id}` };
    return null;
  }

  if (isEscalationNote(last, cfg)) {
    const awards = awardsOf(last.id).filter((a) => a.user.username === me).map((a) => a.name);
    if (awards.includes('eyes')) return null;
    if (awards.includes('thumbsup')) return { reason: 'mike-approved', key: `thread:${d.id}:${last.id}:thumbsup` };
  }
  return null;
}

function settleStale(store: Store, actor: Actor, cfg: FridayConfig, project: string, mr: MR, waiting: Set<string>, resolved: Set<string>) {
  for (const e of store.openFor({ process: PROCESS, project, mr: mr.iid })) {
    const did = /^discussion:(.+)$/.exec(e.subject ?? '')?.[1];
    if (did && (waiting.has(did) || resolved.has(did))) {
      settle(store, actor, e.id, resolved.has(did) ? 'the thread was resolved' : 'Mike answered', cfg);
    } else if (labelRemovedByMike(e, mr.labels, cfg)) {
      settle(store, actor, e.id, 'Mike removed the label', cfg);
    }
  }
}

export function reviewResponderPrecheck(store: Store, gl = new GitLab(), cfg = loadConfig(), log: (s: string) => void = (s) => void process.stderr.write(s + "\n")): ReviewItem[] {
  const actor = actorFor(PROCESS, store, gl);
  const items: ReviewItem[] = [];
  const sessionDirs = claudeSessionDirs();
  for (const { project } of cfg.projects) {
    const clone = projectConfig(cfg, project).clone;
    const open = openMRs(gl, project, cfg.gitlabUser);
    const removed = pruneWorktrees(clone, project, `${PROCESS}-mr-`, new Set(open.map((m) => `${PROCESS}-mr-${m.iid}`)));
    if (removed.length) log(`${project}: removed worktrees of closed MRs: ${removed.join(', ')}`);
    settleClosed(store, actor, PROCESS, project, new Set(open.map((m) => m.iid)), cfg);
    for (const mr of open) {
      if (mr.draft || mr.labels.includes(cfg.labels.gaveUp)) continue;
      const threads: ThreadItem[] = [];
      const keys: string[] = [];
      const waitingIds = new Set<string>();
      const resolvedIds = new Set<string>();
      for (const d of discussions(gl, project, mr.iid)) {
        const notes = d.notes.filter((n) => !n.system);
        if (notes.length && notes[0].resolvable && notes.every((n) => n.resolved)) resolvedIds.add(d.id);
        const st = threadState(d, cfg, (id) => noteAwards(gl, project, mr.iid, id));
        if (!st) continue;
        if (st.reason !== 'reviewer') waitingIds.add(d.id);
        if (store.isHandled(PROCESS, st.key)) continue;
        const pos = notes[0].position;
        threads.push({
          discussion_id: d.id,
          resolvable: notes[0].resolvable,
          file: pos?.new_path ?? pos?.old_path,
          line: pos?.new_line ?? pos?.old_line,
          notes: notes.map((n) => ({ id: n.id, author: n.author.username, body: n.body, created_at: n.created_at })),
          reason: st.reason,
        });
        keys.push(st.key);
      }
      settleStale(store, actor, cfg, project, mr, waitingIds, resolvedIds);
      if (threads.length === 0) continue;
      const own = worktreePath(project, `${PROCESS}-mr-${mr.iid}`);
      const busy = sessionDirs.some((d) => d === own || d.startsWith(own + '/'))
        ? `a Claude session is running in Friday's worktree ${own} (a resumed escalation)`
        : branchBusy(clone, mr.source_branch, sessionDirs);
      if (busy) {
        log(`${project}!${mr.iid}: skipped, branch busy (${busy})`);
        continue;
      }
      items.push({
        label: `${project.split('/').pop()}-mr-${mr.iid}`,
        project,
        mr: mr.iid,
        branch: mr.source_branch,
        target_branch: mr.target_branch,
        web_url: mr.web_url,
        title: mr.title,
        description: (mr.description ?? '').slice(0, 4000),
        threads,
        handled_keys: keys,
      });
    }
  }
  return items;
}
