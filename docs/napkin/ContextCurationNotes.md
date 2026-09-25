# Context Curation — Design Notes

## What is Context Curation
For the purposes of this document, "Context Curation" refers to the process of identifying sections of a large document (`chunks`)
that will be relevant to a sub-agent that is working on a task, and then instructing that sub-agent to retrieve and ingest only those 
relevant chunks instead of ingesting the entire document into its context window.

## Why are we introducing context curation to `/maps`?
The goal with Context Curation is to reduce the signal-to-noice ration for child agents, i.e. the developer, the test writer, the reviser, possibly other agents.

Currently, when a developer agent is tasked with writing an implementation plan, it's told to read the specification file, and the research files, in their entirety. 
These documents contain important context for all developer agents when they are writing their plans.
Some of that context is relevant to all developer agents, but some of it is relevant only to specific developer agents. 

By curating the context such that child agents are only provided with the context that is relevant to them, we hope to:
1) Reduce token usage
2) Reduce noise in the context window
3) Improve response times
4) Improve overall output


## Which documents are in scope

- **The specification.** Curated. The Architect already reads the whole thing to build the catalog, so pre-assigning relevant pieces to each catalog item costs it nothing new.
- **Research summaries.** Curated, for the same reason. The Developer already reads these in full today, at plan-writing time, specifically to check whether functionality already exists (`IMPLEMENTATION_PLAN_GUIDELINES.md`). There can be more than one (codebase summary, web research summary, and any future Researcher outputs). Curation narrows a door that's already open; it doesn't open a new one.

## Which documents are out of scope
- **`decisions.md` is excluded, on purpose.** It's not given to the Developer today at all, only to the Architect and the reviewer. Its whole extra content beyond the spec, by design, is the rejected alternatives and the argument that produced a decision. Handing that to a build-time agent risks exactly what `SPECIFICATION_GUIDELINES.md`'s Lesson 11 already warns about: "an implementer who reads the rejected shape can build it by mistake." If a Developer needs more than the spec's one-line reason for a decision, that's a signal the spec under-explained it, better routed as an escalation than as a retrieval.
- **The catalog and plans are out of scope for now.** The catalog already addresses its items by name (`AUTH-1`), not by position, so it doesn't have the addressing problem this design solves. Plans weren't examined in this pass.
- **Anything else** - any document not listed under "Which documents are in scope" is out of scope.


## Chunking: how documents are broken down into chunks

Two rules, checked in order.

1. **If a section is really a list of items that already carry a bolded, stable item id, chunk on the item, not the heading.** 
Acceptance Criteria is the clearest case: each entry is already `**AC-N — name**`, and the real spec inspected during this 
design work states outright, "IDs are assigned once and never renumbered or reused." These are the sections that use bolded, stable ids:
 `Acceptance Criteria`, `Success Metrics`, `Open Questions`, `Explicit Constraints`, `Acceptance Tests`, `Functional Requirements`, and 
`Risks and Mitigations`. For example, the item id for the third `Open Questions` would be `OQ-3`. These item id's can also be used
for cross-references, i.e. 'See OQ-3 for more information'.

2. **Otherwise, chunk on headings, every level below the document title.** 
A chunk holds only its own direct content, not its children's, so a parent heading with subsections doesn't duplicate what's already in them.
A heading with no direct content, a pure container for its subsections, gets no chunk of its own, but its text still shows in the table of 
contents as a grouping label. For cross-references, the section number and title should be used: "See '3.2.4 Email Validation Method' for more information".

**Resolved (2026-09-24): oversized sections don't need a new mechanism.** 
Genuinely oversized sections are likely to be extremely rare, and they point to a problem with spec composition, which is where they should be fixed, not in chunking.


## Making source documents chunkable
Source documents must be chunkable, according to the two rules set down in `Chunking: how documents are broken down into chunks`. 

There are no rules about this today. 

Nothing in the Architect or Researcher personas enforces this today. 

The Critic persona doesn't necessarily enforce it either.

This context curation project must introduce these rules.

To move forward with this design, we'll need:
- A rule in `SPECIFICATION_GUIDELINES.md` that outlines the two chunking rules
- An explanation of how the section headings and item id's should be used for cross-references.
- A simple `RESEARCH_GUIDELINES.md` document with the same information about chunking rules and cross-references.
- An update to the Critic persona to confirm the outputs of the Architect and the Researcher are chunkable.


## Storing chunks for later retrieval 
Chunks must be storable, retrievable and searchable.

### Where are chunks stored?
Chunks will be stored in SQLite, in a new table: `context_chunks`.
`context_chunks` table (sketch)

| Column        | Purpose                                                                                          |
|---------------|--------------------------------------------------------------------------------------------------|
| `id`          | `INTEGER PRIMARY KEY`. This is a GUID. The only value ever passed to `chunk_get`.                |
| `epic_id`     | Copied from the parent artifact's epic at creation time. Scopes `chunk_toc` / `chunk_search`.    |
| `artifact_id` | FK to `artifacts.id`. Which document.                                                            |
| `content`     | The chunk's actual text, copied in at creation time                                              |
| `heading`     | Either the "<Heading_number>: <Heading_title> or <item_id> For display in the table of contents. |
| `doc_type`    | `specification` or `research`. `decisions.md` is never chunked, so this can never point at it.   |

Add one FTS5 virtual table over `content`, for the "forgotten chunk" fallback search, see below.

### When are chunks stored?
Chunking is not necessary until Spec sign-off (Step 10) is complete. No chunking should be done before step 10.

When Step 10 is complete, the initial chunking of all in-scope documents must be done. 

The Architect will perform the chunking using the `chunk_document()` MCP tool (see below).

Chunking the in-scope documents should be a blocking task in SQLite. It should block creation of the implementation catalog (step 11).

Chunking must be complete before the implementation catalog is written.

Updating an in-scope document that has already been chunked means that all existing chunks for that document must be deleted
from SQLite and replaced with current chunks. Any references to the old-chunks must be replaced with new references.

### How are chunks retrieved?
3 ways, in order of reliability:
1. By id. The `id` field in `context_chunks` is a GUID. It never changes and uniquely identifies a chunk.
2. By Heading Text/Item ID - the `heading_path` in `context_chunks`. This is much less unique, but is more likely to be unique when paired with `epic_id`. It has the advantage of being much more human-readable and still useful to LLM's. 
3. By content search - the FTS5 search, which should also be paired with `epic_id`. This is probably the use case that will see the least use. It's implemented for the "missing context" issue, see below.

## New MCP tools (sketch, all deterministic, no model calls)

- `chunk_document(artifact_id)` — splits the file by the rules above, inserts chunk rows with copied content. Returns the manifest of what it just created: `id`, `heading` for every new chunk.
- `chunk_toc(epic_id)` — every current chunk's `id` and `heading`, across all in-scope documents in the epic.
- `chunk_get(chunk_id)` — the chunk's stored `id`, `heading` and `content`. Hard error if the id doesn't exist.
- `chunk_bulk_get([chunk_ids])` — take an array of chunk ids, and returns an array of the chunks data: `id`, `heading` and `content`. Hard error if any id doesn't exist.
- `chunk_get_by_heading(heading)` - takes a heading or item id, and returns `id`, `heading` and `content`. Same return signature as `chunk_get()`. If this search fails, the agent can try other methods to get in the information they need. No hard error is necessary here.
- `chunk_search(query, epic)` — FTS5 keyword search over chunk content, for the fallback path. Same return signature as `chunk_get()`.

## How are chunks assigned to child agents?
Before step 11 begins, the Architect will have already run `chunk_document` and should have the results in its context window for easy access.
This means the architect must have all in-scope documents and the results of `chunk_document` for each in-scope document in its context window. 

Step 11 (Architect builds the catalog): add `Context Chunks` and `Context IDs` columns to each catalog item, at the end of each row.

As the architect builds the catalog items, it will look at every heading/id pair returned from `chunk_document` and decide which chunks are relevant to the current catalog item.

`Context Chunks` lists the  `<Document Name> <heading>` for every chunk the architect says is relevant for that catalog item. They are shown in source-code order and in an unordered list.

`Context IDs` lists the `<id>` for each relevant context chunk, in the same order as `Context Chunks`, in a newline-delimited list. This list should be easy for LLM's to isolate and pass to `chunk_bulk_get()` (see above). 

## How do child agents retrieve their chunks?
The Architect and the Orchestrator MUST NOT tell child agents "Read these files" for in-scope. Instead, child agents should be instructed to retrieve a list of chunks by ID or by heading and current epic.
This is where the token conservation actually comes from.

### The Happy Path
Any time a child agent works on any item from the implementation catalog, as long as it knows which catalog item it's working on, it can retrieve the chunks for that item by their IDs in the `Context IDs` column. 
Child agents can then use the `chunk_bulk_get()` MCP tool to retrieve all of their chunks at once.

### The fallback path 
If a child agent retrieves its chunks, and concludes some important context is missing, it can use the `context_search` MCP tool to search the `heading` and `content` fields for any records matching any keywords it wants to know more about.
This search just uses SQLite's FTS5 search. No embeddings, no reranker. At this time, the expectation is that this tool will see every little use and doesn't need to be more robust.

## What this project will touch
- `01-db-schema.md` (new table)
- `03-mcp-server.md` (four new tools)
- `04b`/`04c` (Architect/Developer delegation contract changes)
- `CATALOG_GUIDELINES.md` (the new field)
- `07-workflow.md` (when chunking runs)

Possibly other workflow and/or persona changes.

## Status
Approved to build (2026-09-24), but still pre-catalog: not yet decomposed into sized, buildable items, and nothing here is scheduled. See "Decisions" below. Written down so the ideas survive past one conversation.

## Decisions
- **Build this.** (2026-09-24) Mike's reasoning: should reduce the overall tokens sent to sub-agents after Step 11, with no expected degradation in results if it works correctly, possibly better results.
- **Plans are not chunked.** (2026-09-24) Mike's reasoning: plans are atomic. Open to reconsidering if the Test Writer or Reviser show a real benefit, but the benefit doesn't look worth the effort today.

## Explicitly not decided

Nothing, as of 2026-09-24. All three open questions (build it, plan chunking, oversized sections) are resolved above, under "Decisions" and "Chunking."

