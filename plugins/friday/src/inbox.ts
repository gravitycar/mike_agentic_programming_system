import { loadConfig, type FridayConfig } from './config.js';
import { run } from './exec.js';
import type { Actor } from './gitlab.js';
import { notify } from './notify.js';
import { FRIDAY_BIN } from './paths.js';
import type { Escalation, Store } from './store.js';
import type { Mode } from './spec.js';

export interface ParsedEscalation {
  project: string | null;
  mr: number | null;
  subject: string | null;
  summary: string;
}

/**
 * Reads an agent's ESCALATIONS block. Each item is one line:
 *   - <group/project>!<mr> | <subject> | <one-line summary>
 *   - general | <subject> | <one-line summary>
 * "- none" or an absent block means no escalations.
 */
export function parseEscalations(text: string): ParsedEscalation[] {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => /^\s*ESCALATIONS:\s*$/.test(l));
  if (start < 0) return [];
  const out: ParsedEscalation[] = [];
  for (const line of lines.slice(start + 1)) {
    const m = /^\s*-\s+(.*)$/.exec(line);
    if (!m) {
      if (line.trim() === '') continue;
      break;
    }
    const body = m[1].trim();
    if (/^none\.?$/i.test(body)) continue;
    const parts = body.split('|').map((s) => s.trim());
    const target = parts[0];
    const summary = parts.length >= 3 ? parts.slice(2).join(' | ') : parts[parts.length - 1];
    const subject = parts.length >= 3 ? parts[1] || null : null;
    const mrm = /^(.+)!(\d+)$/.exec(target);
    out.push({
      project: mrm ? mrm[1] : null,
      mr: mrm ? Number(mrm[2]) : null,
      subject,
      summary: summary || body,
    });
  }
  return out;
}

export function mrUrl(project: string, mr: number): string {
  return `https://gitlab.com/${project}/-/merge_requests/${mr}`;
}

/**
 * Records an escalation. In live mode it also labels the MR and posts a
 * notification. In dry-run mode it only appears in the inbox, marked as such.
 */
export function raise(
  store: Store,
  actor: Actor | null,
  e: ParsedEscalation & { process: string; sessionId: string | null; cwd: string | null; mode: Mode },
  cfg: FridayConfig = loadConfig()
): number {
  const dup = store.openFor({ process: e.process, project: e.project ?? undefined, mr: e.mr ?? undefined, subject: e.subject ?? undefined });
  if (e.subject && dup.length) return dup[0].id;
  const id = store.raise({
    process: e.process,
    project: e.project,
    mr: e.mr,
    mr_url: e.project && e.mr ? mrUrl(e.project, e.mr) : null,
    subject: e.subject,
    summary: e.summary,
    session_id: e.sessionId,
    cwd: e.cwd,
    mode: e.mode,
  });
  if (e.mode === 'live') {
    if (actor && e.project && e.mr) {
      try {
        if (!actor.addLabel(e.project, e.mr, cfg.labels.needsMike).dryRun) store.markLabeled(id);
      } catch {
        /* a missing label permission must not lose the escalation */
      }
    }
    notify('Friday needs you', `${e.project && e.mr ? `${e.project.split('/').pop()}!${e.mr}: ` : ''}${e.summary}`);
  }
  return id;
}

/**
 * Settles an escalation. When it was the MR's last open live escalation, the
 * needs-mike label comes off too.
 */
export function settle(store: Store, actor: Actor | null, id: number, reason: string, cfg: FridayConfig = loadConfig()): void {
  const e = store.escalation(id);
  if (!e || e.settled_at) return;
  store.settle(id, reason);
  if (e.mode === 'live' && actor && e.project && e.mr) {
    const others = store.openFor({ project: e.project, mr: e.mr }).filter((o) => o.mode === 'live');
    if (others.length === 0) {
      try {
        actor.removeLabel(e.project, e.mr, cfg.labels.needsMike);
      } catch {
        /* the label may already be gone */
      }
    }
  }
}

function age(iso: string, now = Date.now()): string {
  const mins = Math.max(0, Math.round((now - Date.parse(iso)) / 60000));
  if (mins < 60) return `${mins}m`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h`;
  return `${Math.round(mins / 1440)}d`;
}

const clean = (s: string) => s.replace(/\|/g, '¦').replace(/\s+/g, ' ').trim();

/** The SwiftBar menu for the open escalations. */
export function swiftbarMenu(escs: Escalation[], bin = FRIDAY_BIN, now = Date.now()): string {
  const live = escs.filter((e) => e.mode === 'live').length;
  const lines: string[] = [];
  lines.push(live > 0 ? `${live} | sfimage=bell.badge.fill` : escs.length > 0 ? ` | sfimage=bell.badge` : ` | sfimage=bell`);
  lines.push('---');
  if (escs.length === 0) lines.push('Friday: nothing needs you');
  for (const e of escs) {
    const where = e.project && e.mr ? `${e.project.split('/').pop()}!${e.mr}` : 'general';
    const tag = e.mode === 'dry-run' ? '[dry run] ' : '';
    const label = clean(`${tag}${where} · ${e.summary}`).slice(0, 110);
    lines.push(`${label} (${age(e.raised_at, now)}) | bash=${bin} param1=resume param2=${e.id} terminal=false`);
    lines.push(`--${clean(e.process)}: ${clean(e.summary)} | disabled=true`);
    if (e.mr_url) lines.push(`--Open MR | href=${e.mr_url}`);
    lines.push(`--Dismiss | bash=${bin} param1=settle param2=${e.id} param3=--reason param4=dismissed terminal=false refresh=true`);
  }
  lines.push('---');
  lines.push(`Status | bash=${bin} param1=status terminal=true`);
  lines.push('Refresh | refresh=true');
  return lines.join('\n') + '\n';
}

const shq = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

/** Opens Terminal in the escalation's folder and resumes its agent session. */
export function resume(e: Escalation): void {
  if (!e.session_id || !e.cwd) {
    if (e.mr_url) run('open', [e.mr_url]);
    return;
  }
  const cmd = `cd ${shq(e.cwd)} && claude --resume ${shq(e.session_id)}`;
  const esc = cmd.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  run('osascript', ['-e', `tell application "Terminal" to do script "${esc}"`, '-e', 'tell application "Terminal" to activate']);
}

/** Settles a process's open escalations on MRs of `project` that are no longer open. */
export function settleClosed(store: Store, actor: Actor | null, process: string, project: string, openIids: Set<number>, cfg: FridayConfig = loadConfig()): void {
  for (const e of store.openFor({ process, project })) {
    if (e.mr !== null && !openIids.has(e.mr)) settle(store, actor, e.id, 'the MR was merged or closed', cfg);
  }
}

/** True when Mike took the needs-mike label off an escalation that had it. */
export function labelRemovedByMike(e: Escalation, mrLabels: string[], cfg: FridayConfig): boolean {
  return e.mode === 'live' && e.labeled === 1 && !mrLabels.includes(cfg.labels.needsMike);
}
