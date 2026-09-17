# MAPS Specification: The Compressor

## Status: Draft

## Overview
The Compressor performs **semantic densification** of markdown documents — fewer tokens, same meaning. It converts human-friendly markdown (with formatting, emojis, prose, and visual polish) into dense, LLM-optimized text that preserves all semantic content.

The purpose is to combat **context rot** on large projects. As context windows fill up, important information gets compressed or dropped by the LLM. By pre-compacting documents before they enter the context window, the Compressor allows Claude to work with more information without losing meaning.

## Context
MAPS documents (specs, implementation plans, research summaries, etc.) are written in human-readable markdown — they contain formatting, emojis, explanatory prose, and visual structure that humans need. But when these documents are fed to Claude as working context, every token counts. The Compressor bridges this gap: humans read the originals, Claude reads the densified versions.

## Requirements
- Accept a **file path** as input, not the document's text. The caller must never have to read the document itself first. Passing text left the caller holding the original and the compressed copy at once, which costs more context than skipping compression.
- Relative paths resolve against the project root. A missing path returns `not_found`; a directory returns `validation_error`.
- Return a semantically densified version that uses fewer tokens
- Preserve all semantic content — no information loss
- Preserve `snake_case` and `SCREAMING_SNAKE_CASE` identifiers exactly. A specification names columns, constants and API fields, and an altered identifier makes it wrong.
- Preserve list structure, including indentation. A list of distinct requirements is not the same statement as the sentence its items make when joined, and a sub-item promoted to a sibling of its parent changes what the document claims. Only trailing whitespace is stripped per line.
- Code blocks (fenced with ```) are left untouched — code is already token-dense and its formatting is semantically meaningful
- The output does not need to be human-friendly
- Deterministic — same input always produces same output
- Original files on disk are never modified
- Single compression level — all passes are always applied (passes are lossless, so there's no reason to hold back)
- **Every document, every time.** Agents compress every context document in their delegation prompt. There is no size threshold, because a child cannot judge a document's size without reading it, which is the cost compression exists to avoid.
- **Read-only.** Agents never save compressed text back to a document's path. MAPS documents are read by people as well as agents.

## Validation
- Measure effectiveness as a token reduction percentage (original vs. compressed token count)
- Target range: **30-50% reduction** for typical human-friendly markdown. Measured on two real MAPS specifications: 31.6% on one that used whitespace-padded tables, 3.2% on one that did not. The ratio tracks how much decorative formatting the author added, so a low number means the source was already dense, not that the compressor failed.
- Use a tokenizer (e.g., `tiktoken` or the Anthropic tokenizer) to count tokens in tests
- Validate with a test suite of before/after pairs, plus human review of representative compressed documents to confirm semantic content is preserved

## Resolved Decisions

### Compression strategy: rule-based, lossless semantic densification
The Compressor uses a deterministic, rule-based approach to convert human-friendly markdown into LLM-optimized text. This is lossless — all semantic content is preserved. The Compressor does not summarize or condense content using an LLM.

The transformation is applied in three passes. Every pass is lossless at the word level: the compressed text contains every word of the source, in order. Only horizontal rules, decorative emoji, emphasis markers and redundant whitespace are removed.

#### Pass 1: Meaning pass — remove content that adds no meaning
- Remove decorative emojis and ASCII art
- Remove reader guidance phrases ("In this section...", "The following example shows...", "As mentioned above...", "It is important to note that...")
- Remove redundant headings that restate the content below them
- Remove horizontal rules, excessive empty lines

#### Pass 2: Structure pass — flatten formatting
- Remove asterisk emphasis markers (`**bold**`, `*italic*`) — the content carries the meaning
- Underscore emphasis (`_italic_`) is **not** removed. The rule cannot tell `_emphasis_` from the underscores inside `app_metadata` or `AUTH_LOGGED_IN`, so it corrupted every identifier in the document. It also destroyed the compressor's own code-block placeholders, which silently deleted every fenced code block.
- Bullet lists are **not** collapsed into inline comma-separated lists. Joining separate requirements into one sentence changes what the document says.
- Flatten excessive heading nesting

#### Pass 3: Token pass — collapse whitespace
- Collapse runs of spaces and tabs
- Word-to-symbol substitution is **not** performed. The rules matched nouns as well as verbs, so "distinguish four causes:" became "distinguish four →:".

#### The language pass was removed
An earlier design had a fourth pass that rewrote prose: it deleted transitional words and turned full sentences into noun phrases. It was removed. On two real MAPS specifications it deleted `additionally` from the requirement "It MUST NOT **additionally** read tenant-wide roles", which reads as a blanket ban once the word is gone. All of its rules together saved 46 and 71 bytes, under 0.03% of each file. Because compression now runs on every document an agent reads, a rule that is wrong once per specification is wrong on every epic.

#### Target style
The ideal compressed output reads like dense technical notes:
```
## Auth
API requires token auth. Tokens expire in 24h. Invalid token → 401.
```
Declarative facts, cause→effect chains, definitions, constraints. Examples only when necessary.

### Integration: MCP tool invoked per `/maps` command instructions
The Compressor is exposed as an MCP tool. The `/maps` command instructions tell Claude to run documents through the Compressor before working with them. This ensures documents are always densified before entering the working context.

The MCP server provides the `compress` tool. It takes `file_path` and returns the densified text. Claude calls it when retrieving documents via `artifact_list`: pass the path `artifact_list` returned, and use the returned text as working context. Do not read the file first. Reading it and then compressing it puts both copies in context and costs more than not compressing.

Original files on disk are never modified. The Compressor does not need to be reversible because the original is always preserved.

## Open Questions
1. ~~What is the compression strategy?~~ **Resolved** — Rule-based, lossless semantic densification applied in three passes (meaning, structure, token). See above. A fourth pass that rewrote prose was removed for changing what documents said.
2. ~~Should compression be lossy (summarization) or lossless (formatting removal only)?~~ **Resolved** — Lossless. All semantic content is preserved; only formatting and verbal padding are removed.
3. ~~Is the Compressor a standalone utility, a library used by agents, or an MCP tool?~~ **Resolved** — MCP tool. The `/maps` command instructions tell Claude to run documents through the `compress` tool before using them as working context. This keeps the invocation in Claude's workflow without requiring a separate process.
4. ~~How do we measure/validate compression effectiveness? Do we have token count targets?~~ **Resolved** — Measure effectiveness as a token reduction percentage (original vs. compressed token count). Target range is 30-50% reduction for typical human-friendly markdown. Use a tokenizer (e.g., `tiktoken` or the Anthropic tokenizer) to count tokens in tests. Validate with a test suite of before/after pairs, plus human review of representative compressed documents to confirm semantic content is preserved.
5. ~~Should there be different compression levels (light, medium, aggressive)?~~ **Resolved** — No. One level that applies all passes. The passes are lossless, so there's no reason to hold back. If specific document types need special handling, that's addressed by exclusions (see question #6), not compression levels.
6. ~~Are there document types that should NOT be compressed (e.g., code examples in implementation plans)?~~ **Resolved** — Code blocks (fenced with ``` or indented) are left untouched. Code is already token-dense and its formatting is semantically meaningful (indentation, line breaks). All other content is fair game for all compression passes.
7. ~~Does the Compressor need to be reversible, or is the original always preserved alongside the compressed version?~~ **Resolved** — Not reversible. The original file is always preserved on disk.
8. ~~At what point in the workflow is compression applied — when documents are stored, or on-the-fly when agents retrieve them?~~ **Resolved** — On demand, when Claude retrieves documents as working context. The `/maps` command instructions direct Claude to pass document contents through the `compress` MCP tool before using them.

9. ~~Does the tool take the document's text or its path?~~ **Resolved** — Its path. The original `text` input required the caller to read the whole document into context before compressing it, so the caller ended up holding the uncompressed original, the compressed copy, and the MCP round trip in between. That is worse than not compressing. The tool now reads the file itself.

## Dependencies
- [02-document-management.md](02-document-management.md) — Compression integrates with how documents are stored and retrieved.
- [03-mcp-server.md](03-mcp-server.md) — The Compressor is exposed as an MCP tool.
- [05-orchestrator.md](05-orchestrator.md) — The `/maps` command instructions direct Claude to use the Compressor.
