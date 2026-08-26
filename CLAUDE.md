# MAPS — Mike's Agentic Programming System

## Project Overview

MAPS is an LLM-powered software development system implemented as a Claude Code custom command (`/maps`). It guides a user from a brief problem description through a multi-step workflow — research, specification, critical review, implementation planning, code generation, testing, and acceptance verification — producing tested, working code.

The system is **spec-driven**: it front-loads design decisions through iterative specification writing and critical review before any code is written. Open questions are resolved interactively, one at a time, forcing the engineer to engage deeply with the spec.

## Project Status

**Built.** All specifications are written and all 105 open questions are resolved. The MCP server (16 tools), database layer, compressor, all seven agent personas, the `/maps` orchestrator command, and the `maps-init.sh` setup script are implemented. Build with `npm run build` (TypeScript → `dist/`).

A lightweight variant, `/maps-lite`, for small changes and bug fixes is **specified** ([docs/specs/09-maps-lite.md](docs/specs/09-maps-lite.md)) but **not yet implemented** — the command, persona edits, and the full-`/maps` delegation retrofit are pending.

## Architecture

```
┌─────────────────────────────────────────────────┐
│  Intelligence Layer                             │
│  Claude Code + markdown persona files           │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐        │
│  │Researcher│ │Architect │ │Developer │        │
│  └──────────┘ └──────────┘ └──────────┘        │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐        │
│  │  Critic  │ │TestWriter│ │ Reviser  │        │
│  └──────────┘ └──────────┘ └──────────┘        │
│  ┌──────────────────┐ ┌──────────┐              │
│  │LLM Security      │ │ Verifier │              │
│  │Auditor           │ │          │              │
│  └──────────────────┘ └──────────┘              │
│                                                 │
│  Orchestrated by: /maps command                 │
│  (.claude/commands/maps.md)                     │
└────────────────────┬────────────────────────────┘
                     │ MCP tools (stdio)
┌────────────────────┴────────────────────────────┐
│  Infrastructure Layer                           │
│  Deterministic TypeScript code                  │
│  ┌────────────────┐  ┌───────────────────┐      │
│  │   MCP Server   │  │  SQLite Database  │      │
│  │  (Node.js)     │──│  (.maps/maps.db)  │      │
│  └────────────────┘  └───────────────────┘      │
│  ┌────────────────┐                             │
│  │  Compressor    │  Rule-based semantic         │
│  │  (compress)    │  densification               │
│  └────────────────┘                             │
└─────────────────────────────────────────────────┘
```

Two distinct layers with a clear separation of concerns:
- **Intelligence**: Claude Code + agent personas (markdown) — handles all reasoning, writing, coding
- **Infrastructure**: MCP Server + SQLite — handles all state management, task sequencing, validation

Agents are Claude Code personas (markdown files in `.claude/agents/`), NOT separate processes or TypeScript classes. Each agent task is **delegated to a fresh child session** via the Task tool (`subagent_type="general-purpose"`), giving each task a focused context window. The `/maps` command orchestrates the workflow, delegating agent tasks and handling human review inline. Claude Code IS the orchestrator.

This architecture was adopted after reviewing the [Agent Fabric](https://github.com/reliable/agent-fabric) project.

## Project Structure

```
mike_agentic_programming_system/
├── CLAUDE.md                          # This file
├── README.md                          # Project overview + usage
├── QUICKSTART.md                      # Quick-start guide
├── .gitignore
├── package.json                       # npm package (@mikegravity/maps), build/start scripts
├── tsconfig.json
├── maps-init.sh                       # Setup script — installs MAPS into a target project
├── .claude/                           # Runtime intelligence layer (this repo dogfoods MAPS)
│   ├── agents/                        # Agent persona markdown files
│   │   ├── researcher.md
│   │   ├── architect.md
│   │   ├── developer.md
│   │   ├── critic.md
│   │   ├── test-writer.md
│   │   ├── reviser.md
│   │   ├── llm-security-auditor.md
│   │   └── verifier.md
│   └── commands/
│       └── maps.md                    # The /maps orchestrator command
├── src/                               # Infrastructure layer (TypeScript MCP server)
│   ├── index.ts                       # Entry point (stdio MCP server; takes project_path arg)
│   ├── db/
│   │   ├── schema.ts                  # Table DDL + Task/Blocker/Artifact/Config types
│   │   └── database.ts                # better-sqlite3 access layer
│   ├── mcp/
│   │   ├── server.ts                  # MCP server: 16 tools, request routing
│   │   ├── validation.ts              # Application-level validation
│   │   ├── errors.ts                  # MapsError + 5 error categories
│   │   └── tools/                     # task/epic/blocker/artifact/config/project-init tools
│   └── compressor/
│       └── compress.ts                # 4-pass semantic densification
└── docs/
    ├── napkin/
    │   └── InitialDesignNotes.md      # Original design vision
    ├── guidelines/
    │   ├── SPECIFICATION_GUIDELINES.md      # Spec writing guidelines
    │   ├── IMPLEMENTATION_PLAN_GUIDELINES.md # Implementation plan guidelines
    │   └── LLM_SECURITY_GUIDELINES.md       # LLM security review guidelines
    └── specs/                         # System specifications
        ├── 01-db-schema.md            # SQLite database schema
        ├── 02-document-management.md  # Document storage, versioning, compression
        ├── 03-mcp-server.md           # MCP server tools, validation, error handling
        ├── 04-agents.md               # Agent framework (general)
        ├── 04a-agent-researcher.md    # Researcher agent
        ├── 04b-agent-architect.md     # Architect agent
        ├── 04c-agent-developer.md     # Developer agent
        ├── 04d-agent-critic.md        # Critic agent
        ├── 04e-agent-test-writer.md   # Test Writer agent
        ├── 04f-agent-reviser.md       # Reviser agent
        ├── 04g-agent-verifier.md      # Verifier agent (acceptance verification)
        ├── 05-orchestrator.md         # /maps command (Claude Code as orchestrator)
        ├── 06-compressor.md           # Semantic densification
        ├── 07-workflow.md             # 20-step workflow definition
        ├── 08-project-setup.md        # Setup script, portability
        └── 09-maps-lite.md            # /maps-lite lightweight workflow (spec; impl pending)
```

### Target project structure (produced by `maps-init.sh`)

```
target-project/
├── .mcp.json                     # MCP server config (merged, not overwritten)
├── .claude/
│   ├── agents/                   # Agent persona markdown files
│   │   ├── researcher.md
│   │   ├── architect.md
│   │   ├── developer.md
│   │   ├── critic.md
│   │   ├── test-writer.md
│   │   ├── reviser.md
│   │   ├── llm-security-auditor.md
│   │   └── verifier.md
│   └── commands/
│       └── maps.md               # The /maps orchestrator command
└── .maps/
    ├── maps.db                   # Per-project SQLite database
    └── docs/
        └── <epic-slug>/          # Epic-scoped documents
            ├── research/
            ├── specification/
            ├── catalog/
            ├── plans/
            └── reviews/
```

## Specification Index

Read these specs in order — later specs depend on earlier ones.

| Spec | What it defines | Key concepts |
|------|----------------|--------------|
| **01-db-schema.md** | SQLite schema: tasks, blockers, artifacts, config | Task hierarchy, forward-only status lifecycle, blocker-based sequencing |
| **02-document-management.md** | How documents are stored, versioned, compressed | Filesystem storage, insert-new-row versioning, epic-scoped directories, 10K token limit |
| **03-mcp-server.md** | MCP server: 16 tools, validation, error handling | TypeScript/Node.js, `better-sqlite3`, epic scoping, cascading unblock, 5 error categories |
| **04-agents.md** | General agent framework | Personas not processes, eight roles, two-layer architecture, context sharing |
| **04a-04g** | Individual agent specs (incl. **04g Verifier** — acceptance verification) | Role-specific inputs, outputs, success criteria, behavioral guidelines |
| **05-orchestrator.md** | `/maps` command behavior | Crash recovery, hard limits (3/5/unlimited), session model, code undo |
| **06-compressor.md** | Semantic densification | 4-pass rule-based compression, 30-50% token reduction, code blocks excluded |
| **07-workflow.md** | 20-step workflow | Sequential execution, review loops, integration testing, backward navigation |
| **08-project-setup.md** | Setup script and portability | `maps-init.sh`, `.mcp.json` merge, idempotent, Node.js + Claude Code prerequisites |
| **09-maps-lite.md** | Lightweight `/maps` variant for small changes/bug fixes | Merged change brief, section-writing delegation contract, `question`-task confirmation gate, escalation, conditional Step 20 |

## Workflow Overview

20 steps, sequential execution within a single Claude Code conversation:

1. User describes problem
2. Researcher analyzes codebase
3. Researcher searches web
4. Architect writes specification
5. Critic reviews spec (Critical Review #1)
6-7. User reviews spec + open questions
8. Critic reviews again (Critical Review #2)
9-10. User addresses questions + signs off (git commit)
10a-d. LLM Security Auditor reviews spec (skips if no LLM integration; 2-iteration limit)
11. Architect builds implementation catalog
12. Developer writes implementation plans
13. Critic reviews plans (Critical Review #3)
14. User resolves remaining questions
14a-d. LLM Security Auditor reviews plans (skips if no LLM integration; 2-iteration limit)
15. Developer builds code from plans
16. Test Writer writes and runs unit tests
17. Critic triages failures → Reviser/Developer/Test Writer fix → retest loop
18. Test Writer writes and runs integration tests
19. Same triage/fix loop for integration tests
20. Verifier confirms every acceptance criterion (MAPS-owned automatically, User-owned via hand-off); Critic triage adds a "criterion/spec wrong" verdict; the Epic completes only when all criteria are verified

**Small changes:** `/maps-lite` provides a shorter path for bug fixes and minor changes that reuses this infrastructure and these personas. See [09-maps-lite.md](docs/specs/09-maps-lite.md).

### Loop hard limits
- **Critical review**: 3 iterations
- **LLM security review**: 2 iterations (conditional — skips if no LLM integration)
- **Test/fix**: 5 iterations
- **Acceptance verification** (step 20 fix loop): 5 iterations
- **Spec review** (human-driven): no limit

## MCP Server Tools (16 total)

**Task**: `task_create`, `task_get`, `task_update`, `task_list`
**Epic**: `epic_list`
**Blocker**: `blocker_add`, `blocker_remove`, `blocker_dependencies`, `blocker_dependents`
**Artifact**: `artifact_register`, `artifact_list`
**Config**: `config_set`, `config_get`
**Compression**: `compress`
**Convenience**: `next_task`, `project_init`

All task/artifact operations are auto-scoped to the current epic via `current_epic_id` in the config table.

## Task Status Lifecycle

```
open → in_progress → done
open → blocked → open → in_progress → done
any → deferred
in_progress → orphaned (crash recovery only)
```

Forward-only. Never reopen completed tasks — create new ones instead.

## Key Architectural Decisions

1. **Claude Code IS the orchestrator** — no separate TypeScript process, no standalone CLI
2. **Agents are personas, not processes** — markdown files in `.claude/agents/`, not TypeScript classes
3. **Session delegation** — each agent task delegated to a fresh child session via Task tool, preventing context window degradation
4. **One child at a time** — sequential delegation, never parallel; each child sees code produced by previous children
5. **Task tree drives sequencing** — `next_task` + blocker dependencies, not hardcoded step logic
6. **Documents are shared state** — agents share context through documents on disk, not conversation history
7. **MCP server is the only DB gateway** — all validation at application level, DB enforces only foreign keys
8. **Forward-only status lifecycle** — completed tasks are never reopened; create new tasks instead
9. **Epic scoping** — all operations auto-scoped to current epic via config table
10. **Compression on demand** — documents stored human-friendly, compressed when loaded into context

## Technology Stack

- **MCP Server**: TypeScript, Node.js, `@modelcontextprotocol/sdk`, `better-sqlite3`
- **Database**: SQLite (per-project, at `.maps/maps.db`)
- **Compressor**: Rule-based TypeScript (4-pass semantic densification)
- **Agent personas**: Markdown files
- **Orchestrator**: Markdown file (Claude Code custom command)
- **User interface**: Claude Code CLI

## Conventions

- **Document size limit**: 10K tokens per document. Decompose if larger.
- **Artifact versioning**: Insert new row, never update existing. Latest = most recent by `created_at`.
- **Epic directory slug**: Derived from epic name at runtime (e.g., "Build Stock Tracker" → `build-stock-tracker`).
- **Agents own task status**: Agents set their own `in_progress` and `done` via `task_update`.
- **Code undo before rebuild**: `git checkout` modified files + delete new files.
- **Open question resolution**: One at a time, interactively, recorded before moving on.
- **`.mcp.json` handling**: Merge MAPS entry into existing `mcpServers` object — never overwrite the file.
