/**
 * Parses a Claude Code sub-agent transcript (JSONL) into total token usage and
 * elapsed time for that sub-agent's whole run.
 *
 * The transcript's JSON shape is undocumented and unversioned, so every place
 * that reaches into a transcript line's fields is isolated in this one file —
 * a future Claude Code release that shifts the shape should only require
 * changes here, not in the hook entry point or anywhere else.
 */

import { readFileSync } from 'fs';

export interface TranscriptUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
  elapsed_ms: number;
  started_at: string; // ISO 8601
  model: string | null;
}

interface RawUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

function extractUsage(line: any): RawUsage | null {
  return line?.message?.usage ?? line?.usage ?? null;
}

function extractId(line: any): string | null {
  return line?.message?.id ?? line?.uuid ?? null;
}

function extractTimestamp(line: any): string | null {
  return line?.timestamp ?? line?.message?.timestamp ?? null;
}

function extractModel(line: any): string | null {
  return line?.message?.model ?? null;
}

export function parseTranscript(transcriptPath: string): TranscriptUsage {
  const raw = readFileSync(transcriptPath, 'utf-8');
  const lines = raw.split('\n');

  // Last occurrence per message id wins — a streamed turn can repeat an id
  // with growing content, and only the final usage for that id is authoritative.
  const usageById = new Map<string, RawUsage>();
  const unkeyedUsage: RawUsage[] = [];

  let firstTimestamp: string | null = null;
  let lastTimestamp: string | null = null;
  let model: string | null = null;
  let parsedLineCount = 0;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    let line: any;
    try {
      line = JSON.parse(trimmed);
    } catch {
      continue; // skip unparseable lines rather than aborting the whole parse
    }
    parsedLineCount++;

    const timestamp = extractTimestamp(line);
    if (timestamp) {
      if (!firstTimestamp) firstTimestamp = timestamp;
      lastTimestamp = timestamp;
    }

    if (!model) {
      model = extractModel(line);
    }

    const usage = extractUsage(line);
    if (usage) {
      const id = extractId(line);
      if (id) {
        usageById.set(id, usage);
      } else {
        // No id to dedupe on — count as its own entry rather than dropping it.
        unkeyedUsage.push(usage);
      }
    }
  }

  if (parsedLineCount === 0) {
    throw new Error(`No parseable JSON lines in transcript: ${transcriptPath}`);
  }
  if (!firstTimestamp || !lastTimestamp) {
    throw new Error(`No timestamps found in transcript: ${transcriptPath}`);
  }

  interface Totals {
    input_tokens: number;
    output_tokens: number;
    cache_creation_tokens: number;
    cache_read_tokens: number;
  }

  const allUsage = [...usageById.values(), ...unkeyedUsage];
  const totals = allUsage.reduce<Totals>(
    (acc, u) => {
      acc.input_tokens += u.input_tokens ?? 0;
      acc.output_tokens += u.output_tokens ?? 0;
      acc.cache_creation_tokens += u.cache_creation_input_tokens ?? 0;
      acc.cache_read_tokens += u.cache_read_input_tokens ?? 0;
      return acc;
    },
    { input_tokens: 0, output_tokens: 0, cache_creation_tokens: 0, cache_read_tokens: 0 }
  );

  const elapsedMs = Math.max(0, Date.parse(lastTimestamp) - Date.parse(firstTimestamp));

  return {
    ...totals,
    elapsed_ms: elapsedMs,
    started_at: firstTimestamp,
    model,
  };
}
