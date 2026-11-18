#!/usr/bin/env node
/**
 * Claude Code SubagentStop hook — records token usage and elapsed time for a
 * delegated /maps sub-agent task into the shared, cross-project telemetry
 * store at ~/.maps/telemetry.db.
 *
 * This must never block or fail the sub-agent lifecycle event it hooks. Every
 * code path, including every failure, ends in process.exit(0); failures are
 * logged to stderr only. No telemetry row is better than a blocked session.
 *
 * Invoked via bin/maps-subagent-telemetry.sh, referenced by its MAPS-install-
 * absolute path from the target project's .claude/settings.json — see
 * docs/specs/10-telemetry.md.
 */

import { readFileSync, existsSync } from 'fs';
import { execFileSync } from 'child_process';
import { basename, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import { parseTranscript } from './parse-transcript.js';
import { TelemetryDatabase } from '../db/telemetry-database.js';

function readStdin(): string {
  try {
    return readFileSync(0, 'utf-8');
  } catch {
    return '';
  }
}

function resolveTaskContext(projectPath: string): { taskId: number | null; epicName: string | null } {
  const markerPath = join(projectPath, '.maps', '.active_task');
  if (!existsSync(markerPath)) {
    return { taskId: null, epicName: null };
  }

  let taskId: number | null = null;
  try {
    const raw = readFileSync(markerPath, 'utf-8').trim();
    taskId = raw ? parseInt(raw, 10) : null;
    if (taskId !== null && Number.isNaN(taskId)) taskId = null;
  } catch {
    return { taskId: null, epicName: null };
  }
  if (taskId === null) return { taskId: null, epicName: null };

  const mapsDbPath = join(projectPath, '.maps', 'maps.db');
  if (!existsSync(mapsDbPath)) {
    return { taskId, epicName: null };
  }

  let projectDb: Database.Database | null = null;
  try {
    projectDb = new Database(mapsDbPath, { readonly: true, fileMustExist: true });
    let current = projectDb
      .prepare('SELECT id, parent_id, type, name FROM tasks WHERE id = ?')
      .get(taskId) as { id: number; parent_id: number | null; type: string; name: string } | undefined;

    let hops = 0;
    while (current && current.parent_id !== null && current.type !== 'epic' && hops < 20) {
      current = projectDb
        .prepare('SELECT id, parent_id, type, name FROM tasks WHERE id = ?')
        .get(current.parent_id) as typeof current;
      hops++;
    }

    return { taskId, epicName: current?.name ?? null };
  } catch {
    return { taskId, epicName: null };
  } finally {
    projectDb?.close();
  }
}

function getMapsVersion(): string {
  try {
    // This script runs compiled, from dist/hooks/subagent-telemetry.js — walk
    // up two directories to the MAPS install root.
    const here = dirname(fileURLToPath(import.meta.url));
    const mapsDir = join(here, '..', '..');
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: mapsDir,
      encoding: 'utf-8',
    }).trim();
  } catch {
    return 'unknown';
  }
}

async function main(): Promise<void> {
  try {
    const payload = JSON.parse(readStdin());
    const agentType: string = payload?.agent_type ?? 'unknown';
    const transcriptPath: string | undefined = payload?.agent_transcript_path;

    const projectPath = process.env.CLAUDE_PROJECT_DIR;
    if (!projectPath) {
      console.error('subagent-telemetry: CLAUDE_PROJECT_DIR unset, skipping');
      return;
    }
    if (!transcriptPath) {
      console.error('subagent-telemetry: no agent_transcript_path in payload, skipping');
      return;
    }

    const usage = parseTranscript(transcriptPath);
    const { taskId, epicName } = resolveTaskContext(projectPath);
    const mapsVersion = getMapsVersion();
    const now = new Date().toISOString();

    const telemetry = new TelemetryDatabase();
    try {
      telemetry
        .getDb()
        .prepare(
          `INSERT INTO agent_run (
            project_path, project_name, epic_name, task_id, agent_type, model,
            input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens,
            elapsed_ms, maps_version, started_at, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          projectPath,
          basename(projectPath),
          epicName,
          taskId,
          agentType,
          usage.model,
          usage.input_tokens,
          usage.output_tokens,
          usage.cache_creation_tokens,
          usage.cache_read_tokens,
          usage.elapsed_ms,
          mapsVersion,
          usage.started_at,
          now
        );
    } finally {
      telemetry.close();
    }
  } catch (error) {
    console.error('subagent-telemetry hook failed:', error);
  }
}

main().finally(() => process.exit(0));
