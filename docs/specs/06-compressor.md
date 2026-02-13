# MAPS Specification: The Compressor

## Status: Draft

## Overview
The Compressor performs **semantic densification** of markdown documents — fewer tokens, same meaning. It converts human-friendly markdown (with formatting, emojis, prose, and visual polish) into dense, LLM-optimized text that preserves all semantic content.

The purpose is to combat **context rot** on large projects. As context windows fill up, important information gets compressed or dropped by the LLM. By pre-compacting documents before they enter the context window, the Compressor allows Claude to work with more information without losing meaning.

## Context
MAPS documents (specs, implementation plans, research summaries, etc.) are written in human-readable markdown — they contain formatting, emojis, explanatory prose, and visual structure that humans need. But when these documents are fed to Claude as working context, every token counts. The Compressor bridges this gap: humans read the originals, Claude reads the densified versions.

## Requirements
- Accept markdown text as input
- Return a semantically densified version that uses fewer tokens
- Preserve all semantic content — no information loss
- Code blocks (fenced with ``` or indented) are left untouched — code is already token-dense and its formatting is semantically meaningful
- The output does not need to be human-friendly
- Deterministic — same input always produces same output
- Original files on disk are never modified
- Single compression level — all four passes are always applied (passes are lossless, so there's no reason to hold back)

## Validation
- Measure effectiveness as a token reduction percentage (original vs. compressed token count)
- Target range: **30-50% reduction** for typical human-friendly markdown
- Use a tokenizer (e.g., `tiktoken` or the Anthropic tokenizer) to count tokens in tests
- Validate with a test suite of before/after pairs, plus human review of representative compressed documents to confirm semantic content is preserved

## Resolved Decisions

### Compression strategy: rule-based, lossless semantic densification
The Compressor uses a deterministic, rule-based approach to convert human-friendly markdown into LLM-optimized text. This is lossless — all semantic content is preserved. The Compressor does not summarize or condense content using an LLM.

The transformation is applied in multiple passes:

#### Pass 1: Meaning pass — remove content that adds no meaning
- Remove decorative emojis and ASCII art
- Remove reader guidance phrases ("In this section...", "The following example shows...", "As mentioned above...", "It is important to note that...")
- Remove redundant headings that restate the content below them
- Remove horizontal rules, excessive empty lines

#### Pass 2: Structure pass — flatten formatting
- Collapse bullet lists into inline comma-separated lists (e.g., "Key features: fast startup, low memory, horizontal scalability")
- Convert tables to inline key-value lines (e.g., "Param: size = number of items")
- Flatten excessive heading nesting
- Remove markdown emphasis markers (bold, italic) — the content carries the meaning
- Remove code block fences for short inline code

#### Pass 3: Language pass — shorten prose
- Convert full sentences to dense noun-phrase assertions (e.g., "The system is designed to scale horizontally" → "System supports horizontal scaling")
- Remove transitional phrases and filler words
- Normalize terminology — define abbreviations once, then use short labels throughout (e.g., "Define: LLM = large language model" then use "LLM" everywhere)
- Use cause→effect chains with arrow notation (e.g., "High load → increased latency → degraded UX")

#### Pass 4: Token pass — final optimization
- Replace common words with symbols where LLMs understand them well ("leads to" → →, "results in" → →, "and" in lists → commas, "equals" → =, "greater than" → >, "less than" → <)
- Collapse remaining unnecessary whitespace

#### Target style
The ideal compressed output reads like dense technical notes:
```
## Auth
API requires token auth. Tokens expire in 24h. Invalid token → 401.
```
Declarative facts, cause→effect chains, definitions, constraints. Examples only when necessary.

### Integration: MCP tool invoked per `/maps` command instructions
The Compressor is exposed as an MCP tool. The `/maps` command instructions tell Claude to run documents through the Compressor before working with them. This ensures documents are always densified before entering the working context.

The MCP server provides a tool (e.g., `compress`) that accepts markdown text and returns the densified version. Claude calls this tool when retrieving documents via `artifact_list` — read the file from disk, pass its contents through `compress`, and use the densified output as working context.

Original files on disk are never modified. The Compressor does not need to be reversible because the original is always preserved.

## Open Questions
1. ~~What is the compression strategy?~~ **Resolved** — Rule-based, lossless semantic densification applied in four passes (meaning, structure, language, token). See above.
2. ~~Should compression be lossy (summarization) or lossless (formatting removal only)?~~ **Resolved** — Lossless. All semantic content is preserved; only formatting and verbal padding are removed.
3. ~~Is the Compressor a standalone utility, a library used by agents, or an MCP tool?~~ **Resolved** — MCP tool. The `/maps` command instructions tell Claude to run documents through the `compress` tool before using them as working context. This keeps the invocation in Claude's workflow without requiring a separate process.
4. ~~How do we measure/validate compression effectiveness? Do we have token count targets?~~ **Resolved** — Measure effectiveness as a token reduction percentage (original vs. compressed token count). Target range is 30-50% reduction for typical human-friendly markdown. Use a tokenizer (e.g., `tiktoken` or the Anthropic tokenizer) to count tokens in tests. Validate with a test suite of before/after pairs, plus human review of representative compressed documents to confirm semantic content is preserved.
5. ~~Should there be different compression levels (light, medium, aggressive)?~~ **Resolved** — No. One level that applies all four passes. The passes are lossless, so there's no reason to hold back. If specific document types need special handling, that's addressed by exclusions (see question #6), not compression levels.
6. ~~Are there document types that should NOT be compressed (e.g., code examples in implementation plans)?~~ **Resolved** — Code blocks (fenced with ``` or indented) are left untouched. Code is already token-dense and its formatting is semantically meaningful (indentation, line breaks). All other content is fair game for all four compression passes.
7. ~~Does the Compressor need to be reversible, or is the original always preserved alongside the compressed version?~~ **Resolved** — Not reversible. The original file is always preserved on disk.
8. ~~At what point in the workflow is compression applied — when documents are stored, or on-the-fly when agents retrieve them?~~ **Resolved** — On demand, when Claude retrieves documents as working context. The `/maps` command instructions direct Claude to pass document contents through the `compress` MCP tool before using them.

## Dependencies
- [02-document-management.md](02-document-management.md) — Compression integrates with how documents are stored and retrieved.
- [03-mcp-server.md](03-mcp-server.md) — The Compressor is exposed as an MCP tool.
- [05-orchestrator.md](05-orchestrator.md) — The `/maps` command instructions direct Claude to use the Compressor.
