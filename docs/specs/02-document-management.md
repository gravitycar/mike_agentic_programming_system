# MAPS Specification: Document Management

## Status: Draft

## Overview
The MAPS workflow produces several key documents: the specification, the implementation catalog, and individual implementation plans. This spec defines how these documents are stored, retrieved, versioned, and compressed.

## Context
From the initial design notes, the following document types are produced during the workflow:

| Document | Produced At | Description |
|----------|------------|-------------|
| Problem Statement | Step 1 | User's initial description of the project goal |
| Codebase Summary | Step 2 | Agent's summary of the current codebase state |
| Research Summary | Step 3 | Agent's summary of web research on the problem domain |
| Specification | Step 4 | Full spec document written from a template, no code examples |
| Open Questions | Steps 5, 8, 13 | Questions surfaced during critical reviews |
| Implementation Catalog | Step 11 | Concise list of everything to build |
| Implementation Plans | Step 12 | Detailed build plans with code examples and tests |

Documents are stored as files on the filesystem, not in the database. The `results` column on the tasks table holds agent operational output (confirmations, summaries), while document file locations are tracked via the `artifacts` table.

## Resolved Decisions

### Document storage: filesystem, not the database
Documents (specs, implementation plans, catalogs, etc.) are stored as files on the filesystem. The `results` column on the tasks table holds the agent's operational output — confirmation text, summaries, and notes — not the documents themselves. The relationship between tasks and their output files is tracked via the `artifacts` table (see [01-db-schema.md](01-db-schema.md)).

### Versioning: insert-new-row strategy
When a document is revised (e.g., a spec updated after critical review), a new artifact row is inserted pointing to the new version of the file rather than updating the existing row. This gives us version history for free — querying all artifacts for a given task type ordered by `created_at` shows the full revision history. The latest version is always the most recent row.

### Document retrieval and storage: epic-scoped directory structure
Documents are organized under `.maps/docs/` in directories scoped by epic. The epic directory name is a slug derived from the epic task's `name` field (e.g., an epic named "Build Agentic Coding System" becomes `build-agentic-coding-system`). The slug is not stored in the database — it is derived at runtime.

Agents determine the current epic by querying the `config` table for `current_epic_id` (see [01-db-schema.md](01-db-schema.md)), then use the epic task's name to derive the slug and locate the correct directory.

#### Directory structure

```
.maps/
  maps.db
  docs/
    <epic-slug>/
      research/
      specification/
      catalog/
      plans/
      reviews/
```

#### Example

```
.maps/
  maps.db
  docs/
    build-agentic-coding-system/
      research/
        codebase-summary.md
        web-research.md
      specification/
        spec.md
      catalog/
        implementation-catalog.md
      plans/
        api-client.md
        auth-module.md
      reviews/
        critical-review-1.md
```

Agents store new documents by writing files to the appropriate subdirectory and inserting an artifact row with the file path. Agents retrieve documents by querying the artifacts table through the MCP server for the relevant artifact type and epic, then reading the file at the returned path.

### Document size and decomposition
All documents have a hard limit of **10K tokens**. This constraint exists because LLM context windows are finite (~38K tokens), and a single prompt may need to include multiple documents along with agent instructions and response space.

When a document would exceed the 10K token limit, it must be decomposed:

- **Specifications**: A broad epic may produce multiple specifications rather than one monolithic spec. Each sub-specification becomes its own `specification` task under the epic, with its own downstream chain (catalog → plans → implement → test). For example:

```
Epic: "Fantasy Strategy Game"
  → Specification: "Core Game Engine & Turn System"
    → Catalog → Plans → Implement → Test
  → Specification: "Combat System"
    → Catalog → Plans → Implement → Test
  → Specification: "AI Opponent Behavior"
    → Catalog → Plans → Implement → Test
```

- **Other document types**: Research summaries, implementation plans, and catalogs should also respect the 10K token limit. If a research summary covers too much ground, split it by topic. If an implementation plan is too large, the catalog item it implements may need further decomposition.

Decomposition and compression are the two primary strategies for managing context window constraints. The 10K token limit drives decomposition at authoring time; the Compressor reduces token count when Claude retrieves documents as working context.

Document guidelines should include specific guidance on when and how to decompose each document type.

### Compression: on-demand via MCP tool
Documents are stored in their original human-friendly markdown format. When Claude needs to work with a document's contents, the `compress` MCP tool is used to produce a semantically densified version with reduced token count. The original file is never modified. See [06-compressor.md](06-compressor.md) for the compression strategy.

### Document format: guidelines, not rigid templates
Each document type (specification, research summary, implementation catalog, implementation plan, etc.) has its own guidelines document that provides principles, structure recommendations, and examples — but agents are not rigidly bound to a template. Guidelines are static files bundled with MAPS in `docs/guidelines/` within the MAPS project directory. They are not per-project artifacts and do not belong in the `.maps/` directory or the database. An initial specification guidelines document exists at `docs/guidelines/SPECIFICATION_GUIDELINES.md`; guidelines for other document types still need to be developed.

## Open Questions
1. ~~Are documents stored in the database (`results` column), on the filesystem, or both?~~ **Resolved** — filesystem, with artifact references in the DB.
2. ~~If filesystem, where? In the project directory? A `.maps/docs/` subdirectory?~~ **Resolved** — In `.maps/docs/<epic-slug>/`, scoped by epic. See above.
3. ~~Do documents need versioning? The workflow revises specs and implementation plans — do we keep prior versions?~~ **Resolved** — yes, via insert-new-row in the artifacts table.
4. ~~How do agents retrieve documents — by task ID through the MCP server, or by reading files directly?~~ **Resolved** — Agents query the MCP server for the current epic (via the `config` table), derive the epic slug from the epic name, and use the predictable directory structure to locate documents. The artifacts table provides exact file paths. See directory structure above.
5. ~~At what point is the Compressor applied — on storage, on retrieval, or on demand?~~ **Resolved** — On demand, when Claude retrieves documents as working context. Documents are stored in their original human-friendly markdown format. When Claude needs to work with a document's contents, the `compress` MCP tool is used to produce a semantically densified version with reduced token count. The original file is never modified. See [06-compressor.md](06-compressor.md) for the compression strategy.
6. ~~Should documents have a consistent format/template, or are they free-form markdown?~~ **Resolved** — Guidelines, not straitjackets. Each document type (specification, research summary, implementation catalog, implementation plan, etc.) should have its own guidelines document that provides principles, structure recommendations, and examples — but agents are not rigidly bound to a template. Guidelines live in `docs/guidelines/` within the MAPS project. An initial specification guidelines document exists at `docs/guidelines/SPECIFICATION_GUIDELINES.md`; guidelines for other document types still need to be developed.
7. ~~How large can documents get? Do we need to split large specs across multiple records/files?~~ **Resolved** — Hard limit of 10K tokens per document. This leaves room for multiple documents plus prompt overhead and response space within a single context window. When a specification would exceed this limit, it should be decomposed into multiple smaller specifications, each as its own `specification` task under the epic. Each sub-specification then gets its own downstream chain (catalog → plans → implement → test). The task hierarchy and blockers table already support this naturally. Document guidelines should include guidance on when and how to decompose. See "Document Size and Decomposition" below.
8. ~~Should the specification guidelines and templates (mentioned in Components) be stored as documents in the system, or are they static files bundled with MAPS?~~ **Resolved** — Static files bundled with MAPS in `docs/guidelines/`. They are not per-project artifacts and do not belong in the `.maps/` directory or the database.

## Dependencies
- [01-db-schema.md](01-db-schema.md) — The artifacts table tracks document file locations; the config table provides the current epic ID.
- [06-compressor.md](06-compressor.md) — Documents are densified via the `compress` MCP tool before use as working context.
- [03-mcp-server.md](03-mcp-server.md) — Claude retrieves document references through `artifact_list` and registers new documents through `artifact_register`.
