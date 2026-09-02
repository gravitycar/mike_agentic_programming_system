# MAPS - Mike's Agentic Programming System

An LLM-powered software development system implemented as a Claude Code custom command. MAPS guides you from a brief problem description through a multi-step workflow — research, specification, critical review, implementation planning, code generation, and testing — producing tested, working code.

## What is MAPS?

MAPS is a **spec-driven development system** that front-loads design decisions through iterative specification writing and critical review before any code is written. The system:

- ✅ Researches your codebase and problem domain
- ✅ Writes detailed specifications with acceptance criteria
- ✅ Critically reviews specs to find gaps and open questions
- ✅ Breaks specs into discrete implementation items
- ✅ Writes detailed implementation plans with code examples
- ✅ Builds code from plans
- ✅ Writes and runs unit + integration tests
- ✅ Triages test failures and iterates until tests pass

All while maintaining a **spec as source of truth** philosophy and using **task-based workflow management** that survives crashes and restarts.

## Architecture

MAPS has two distinct layers:

**Intelligence Layer** (Claude Code + Agent Personas)
- 8 core agent personas (Researcher, Architect, Developer, Critic, Test Writer, Reviser, LLM Security Auditor, Verifier), plus a Story Reconciler for the `mr-maps` variant
- Three orchestrator commands: `/maps`, `/maps-lite`, `/mr-maps`
- All reasoning, writing, and coding happens here

**Infrastructure Layer** (TypeScript MCP Server + SQLite)
- 16 MCP tools for task/artifact/blocker management
- SQLite database for workflow state
- 4-pass semantic compression for context optimization
- All state management and validation happens here

## Prerequisites

- **Claude Code** — download from https://claude.ai/download.
- **Node.js**, at the version pinned in this repo's `.tool-versions` (currently **22.23.2**). MAPS runs its MCP server under that exact version, because it uses a native module (`better-sqlite3`) whose compiled ABI must match the node that runs it. Install that version with your version manager. With asdf: `asdf install nodejs 22.23.2`.
- **git**.
- For **`/mr-maps`** (the MetaRouter variant): the **Shortcut MCP** server configured in your project. A read-capable server is required. A write-capable one lets `mr-maps` create Shortcut epics and stories for you.

## The Three Commands

MAPS installs three orchestrator commands. They share the same MCP server, database, and personas.

- **`/maps`** — the full 20-step workflow for feature-scale work.
- **`/maps-lite`** — a lightweight path for small changes and bug fixes.
- **`/mr-maps`** ("Mister Maps") — the MetaRouter variant. It maps work onto Shortcut epics and stories, creates one git branch per story, and tests with unit tests plus UI-driven Cypress specs. See [Using `/mr-maps`](#using-mr-maps-at-metarouter).

## Installation

```bash
# Clone the repository
git clone https://github.com/gravitycar/mike_agentic_programming_system.git
cd mike_agentic_programming_system

# Install dependencies and build. These run under the node pinned in
# .tool-versions. npm install fetches a prebuilt better-sqlite3 binary, so
# no C/C++ toolchain or python is needed.
npm install
npm run build
```

## Setup a Project for MAPS

Navigate to any project directory and run the setup script:

```bash
cd /path/to/your/project
/path/to/maps/maps-init.sh
```

This will:
- ✓ Copy all agent personas to `.claude/agents/`
- ✓ Copy all commands (`/maps`, `/maps-lite`, `/mr-maps`) to `.claude/commands/`
- ✓ Copy guidelines to `.maps/guidelines/`
- ✓ Configure the MCP server in `.mcp.json` (merges, doesn't overwrite)
- ✓ Create the `.maps/` directory structure

The MCP server is wired through a launcher, `bin/maps-server.sh`, so it always runs under the node pinned in the MAPS repo, regardless of the node your project pins.

**After setup:**
1. Restart Claude Code to load the MCP server.
2. Run `/mcp` and confirm `maps` shows **connected**.
3. You're ready to use `/maps`, `/maps-lite`, or `/mr-maps`.

**If `/mcp` reports a `maps` scope conflict:** an old `maps` entry in another scope can shadow the new one and fail. Keep the project entry and remove the other, for example `claude mcp remove maps -s local`.

## Usage

In Claude Code, invoke the `/maps` command with your problem description:

```
/maps I want to build a user authentication system with JWT tokens
```

MAPS will then:

1. **Research Phase**
   - Analyze your codebase
   - Search the web for best practices

2. **Specification Phase**
   - Write a detailed specification
   - Critical review to find gaps
   - Interactive question resolution with you
   - Iterate until you sign off

3. **Implementation Planning Phase**
   - Break spec into discrete items (~3 files each)
   - Write detailed implementation plans with code examples
   - Critical review of plans

4. **Build Phase**
   - Build code from implementation plans
   - Write and run unit tests
   - Triage failures, revise plans or tests, rebuild
   - Iterate until tests pass

5. **Integration Testing Phase**
   - Write and run integration tests
   - Same triage/fix loop as unit tests

All progress is saved in the `.maps/` directory and SQLite database. You can stop and resume at any time.

## Using `/mr-maps` at MetaRouter

`/mr-maps` runs the MAPS workflow in a MetaRouter repository, mapped onto MetaRouter's Shortcut and git conventions. It works in any MetaRouter GitLab or GitHub repo, not one specific project.

### What it does differently
- **Shortcut epic and stories.** Your problem statement is the epic. Each implementation plan becomes one Shortcut story.
- **One branch per story.** Each story gets one git branch, named `<user>/<type>/sc-<story#>/<short-desc>`, 40 characters or fewer.
- **Documents in `docs/plans/`.** The spec and each story plan are committed under `docs/plans/sc-<epic#>/`. Internal MAPS files stay in `.maps/`.
- **Unit tests plus Cypress.** Unit tests are colocated. UI-facing behavior is covered by UI-driven Cypress specs, which must pass before each commit.

### Prerequisites
- Everything under [Prerequisites](#prerequisites) above, including the pinned node version.
- The **Shortcut MCP** server configured in your project. Read access is required. Write access is optional and lets `mr-maps` create the epic and stories for you.
- Gitignore the whole `.maps/` directory. `mr-maps` commits deliverables to `docs/plans/`, not `.maps/`.

### Start it

```
/mr-maps <problem statement for a Shortcut epic>
```

`mr-maps` captures the Shortcut epic number, writes and reviews a spec, breaks it into stories, and reconciles those against existing Shortcut stories. It then builds each story on its own branch, with unit and Cypress tests passing before commit. It makes local commits only. You control `git push` and merge request creation.

For the full design, see [docs/specs/10-mr-maps.md](docs/specs/10-mr-maps.md).

## Project Structure

```
maps/
├── README.md                   # This file
├── CLAUDE.md                   # Project overview for Claude
├── package.json
├── tsconfig.json
├── maps-init.sh               # Setup script
├── .claude/
│   ├── agents/                # Agent persona definitions
│   │   ├── researcher.md
│   │   ├── architect.md
│   │   ├── developer.md
│   │   ├── critic.md
│   │   ├── test-writer.md
│   │   └── reviser.md
│   └── commands/
│       └── maps.md            # /maps orchestrator command
├── src/                       # MCP server source (TypeScript)
│   ├── db/                    # Database schema and connection
│   ├── mcp/                   # MCP tools and server
│   └── compressor/            # Semantic compression
├── dist/                      # Compiled JavaScript (build output)
├── docs/
│   ├── specs/                 # System specifications (14 files)
│   ├── guidelines/            # Spec and plan writing guidelines
│   └── napkin/                # Initial design notes
└── .maps/                     # Target project's MAPS directory
    ├── maps.db                # SQLite database (per-project)
    └── docs/                  # Generated documents
        └── <epic-slug>/
            ├── research/
            ├── specification/
            ├── catalog/
            ├── plans/
            └── reviews/
```

## How It Works

### The 20-Step Workflow

1. User describes problem
2. Researcher analyzes codebase
3. Researcher searches web
4. Architect writes specification
5. Critic reviews spec (Critical Review #1)
6-7. User reviews spec + resolves open questions
8. Critic reviews again (Critical Review #2)
9-10. User addresses questions + signs off (git commit)
11. Architect builds implementation catalog
12. Developer writes implementation plans
13. Critic reviews plans (Critical Review #3)
14. User resolves remaining questions
15. Developer builds code from plans
16. Test Writer writes and runs unit tests
17. Critic triages failures → fix loop (5 iterations max)
18. Test Writer writes and runs integration tests
19. Critic triages → fix loop (5 iterations max)
20. Verifier confirms every acceptance criterion (5-iteration fix loop); Epic completes only when all criteria are verified

### Key Features

**Spec-Driven Development**
- Specification is source of truth
- No code written until spec is approved
- All tests verify against spec requirements

**Task-Based Workflow**
- Every step is a task in the database
- Tasks have dependencies (blockers)
- Workflow survives crashes and restarts

**Iterative Reviews with Hard Limits**
- Critical review loop: 3 iterations
- Test/fix loop: 5 iterations
- Prevents infinite loops when clarity is needed

**Semantic Compression**
- 4-pass rule-based compression (30-50% token reduction)
- Preserves all semantic content
- Optimizes context window usage

## Configuration

### MCP Server Configuration

MAPS adds this entry to your project's `.mcp.json`:

```json
{
  "mcpServers": {
    "maps": {
      "command": "/path/to/maps/bin/maps-server.sh",
      "args": [
        "/path/to/your/project"
      ]
    }
  }
}
```

The `command` is a launcher that runs the server under the node pinned in the MAPS repo, so a different node in your project cannot break it. The setup script writes this automatically and merges with existing configurations. It never overwrites other servers.

## Development

### Building

```bash
npm run build
```

### Running the MCP Server Standalone

```bash
node dist/index.js /path/to/project
```

### Project Structure for Development

- `src/db/` - Database schema and connection management
- `src/mcp/` - MCP server and tool implementations
  - `tools/` - Individual tool modules (task, blocker, artifact, etc.)
  - `errors.ts` - Error categories and custom error classes
  - `validation.ts` - Input validation and business rules
  - `server.ts` - Main MCP server
- `src/compressor/` - 4-pass semantic densification

## Documentation

- **CLAUDE.md** - System overview for Claude
- **docs/specs/** - Complete system specifications (14 files)
  - Database schema, document management, MCP server, agents, orchestrator, compressor, workflow, setup
- **docs/guidelines/** - Writing guidelines
  - `SPECIFICATION_GUIDELINES.md` - How to write effective specifications
  - `IMPLEMENTATION_PLAN_GUIDELINES.md` - How to write effective implementation plans

## Philosophy

MAPS is built on the principle that **software development is specification refinement**. By forcing upfront specification, critical review, and open question resolution, MAPS ensures that:

1. Requirements are clear before coding begins
2. Edge cases and errors are considered early
3. Code is built to a spec, not improvised
4. Tests verify spec compliance, not just code behavior
5. Failures trigger plan revision, not code patching

The result: higher quality software with fewer rework cycles.

## Status

**Current**: v1.0.0 — core features implemented, plus the `mr-maps` MetaRouter variant.

- ✅ MCP Server with 16 tools
- ✅ 8 core agent personas, plus the Story Reconciler for `mr-maps`
- ✅ Three commands: `/maps`, `/maps-lite`, `/mr-maps`
- ✅ Setup script with a portable node launcher
- ✅ Semantic compression

**What's next**: Real-world testing with the team, iteration based on feedback.

## License

ISC

## Author

Mike

## Contributing

Not currently accepting contributions. This is a personal project for exploring agentic programming workflows.

## Acknowledgments

- Inspired by the [Agent Fabric](https://github.com/reliable/agent-fabric) project
- Built with [Anthropic's MCP SDK](https://github.com/anthropics/mcp)
- Powered by Claude Code and Claude Sonnet 4.5
