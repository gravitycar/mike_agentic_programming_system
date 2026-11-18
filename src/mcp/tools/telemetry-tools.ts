/**
 * Telemetry reporting MCP tool.
 * Reads from the shared, cross-project telemetry store (~/.maps/telemetry.db),
 * NOT the per-project database every other tool reads. See docs/specs/10-telemetry.md.
 */

import Database from 'better-sqlite3';
import { ValidationError } from '../errors.js';

export interface TelemetryReportParams {
  scope?: 'current_project' | 'all_projects';
  group_by?: 'agent_type' | 'project' | 'maps_version' | 'date';
  maps_version?: string;
  since?: string;
  until?: string;
}

const GROUP_COLUMNS: Record<string, string> = {
  agent_type: 'agent_type',
  project: 'project_name',
  maps_version: 'maps_version',
  date: "date(started_at)",
};

export function formatMarkdownTable(headers: string[], rows: (string | number)[][]): string {
  if (rows.length === 0) {
    return 'No telemetry recorded for the given filters.';
  }

  const headerLine = `| ${headers.join(' | ')} |`;
  const separatorLine = `| ${headers.map(() => '---').join(' | ')} |`;
  const rowLines = rows.map(
    (row) =>
      `| ${row
        .map((v) => (typeof v === 'number' ? v.toLocaleString() : v))
        .join(' | ')} |`
  );

  return [headerLine, separatorLine, ...rowLines].join('\n');
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

export function telemetryReport(
  db: Database.Database,
  params: TelemetryReportParams,
  currentProjectPath: string | null
): string {
  const scope = params.scope ?? 'current_project';
  const groupBy = params.group_by ?? 'agent_type';

  const groupColumn = GROUP_COLUMNS[groupBy];
  if (!groupColumn) {
    throw new ValidationError(
      `Invalid group_by "${groupBy}". Must be one of: ${Object.keys(GROUP_COLUMNS).join(', ')}`
    );
  }

  if (scope === 'current_project' && !currentProjectPath) {
    throw new ValidationError(
      'scope "current_project" requires an initialized project. Call project_init first, or pass scope: "all_projects".'
    );
  }

  const conditions: string[] = [];
  const args: (string | number)[] = [];

  if (scope === 'current_project') {
    conditions.push('project_path = ?');
    args.push(currentProjectPath as string);
  }
  if (params.maps_version) {
    conditions.push('maps_version = ?');
    args.push(params.maps_version);
  }
  if (params.since) {
    conditions.push('started_at >= ?');
    args.push(params.since);
  }
  if (params.until) {
    conditions.push('started_at <= ?');
    args.push(params.until);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const sql = `
    SELECT
      ${groupColumn} AS group_key,
      COUNT(*) AS run_count,
      SUM(input_tokens) AS input_tokens,
      SUM(output_tokens) AS output_tokens,
      SUM(cache_creation_tokens) AS cache_creation_tokens,
      SUM(cache_read_tokens) AS cache_read_tokens,
      SUM(input_tokens + output_tokens + cache_creation_tokens + cache_read_tokens) AS total_tokens,
      SUM(elapsed_ms) AS total_elapsed_ms,
      AVG(elapsed_ms) AS avg_elapsed_ms
    FROM agent_run
    ${whereClause}
    GROUP BY ${groupColumn}
    ORDER BY total_tokens DESC
  `;

  const rows = db.prepare(sql).all(...args) as Array<{
    group_key: string;
    run_count: number;
    input_tokens: number;
    output_tokens: number;
    cache_creation_tokens: number;
    cache_read_tokens: number;
    total_tokens: number;
    total_elapsed_ms: number;
    avg_elapsed_ms: number;
  }>;

  if (rows.length === 0) {
    return 'No telemetry recorded for the given filters.';
  }

  const headers = [
    groupBy,
    'runs',
    'input tokens',
    'output tokens',
    'cache write',
    'cache read',
    'total tokens',
    'total time',
    'avg time',
  ];

  const tableRows = rows.map((r) => [
    r.group_key,
    r.run_count,
    r.input_tokens,
    r.output_tokens,
    r.cache_creation_tokens,
    r.cache_read_tokens,
    r.total_tokens,
    formatElapsed(r.total_elapsed_ms),
    formatElapsed(r.avg_elapsed_ms),
  ]);

  return formatMarkdownTable(headers, tableRows);
}
