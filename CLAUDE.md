# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

XelaDash is a local web dashboard for Claude Code power users. It reads Claude Code's native data (sessions, configs, settings, tools) from `~/.claude/` and presents them through a browser UI. Zero external runtime dependencies beyond Express.

## Commands

```bash
npm start              # Start server on default port 3141
node server.js         # Same as above
node bin/cli.js        # Full CLI with auto-open, hook setup, update checks
node bin/cli.js --port 4000 --no-open   # Custom port, no browser
```

No test suite, no linter, no build step. The frontend is a single self-contained Vue.js file (`app.js`) served statically.

## Architecture

### Entry point flow

```
bin/cli.js → port check → require('./server.js').startServer(port) → Express on localhost → open browser
```

### Three core files

- **`server.js`** (~6K lines) — Express backend. All routes, data parsing, cost calculation, marketplace, plugin system. No external dependencies beyond Express. Uses only Node.js built-ins (`fs`, `path`, `os`, `https`, `child_process`).
- **`app.js`** (~213KB) — Vue.js SPA. Single component with large state object. Views: dashboard, sessions, insights, notes, commands, skills, agents, config, marketplace, plugins, live monitor, etc.
- **`bin/cli.js`** — CLI entry point. Handles `--port`, `--no-open`, `--config-dir`, subcommands (`setup-hook`, `remove-hook`, `stop`). Platform-aware (macOS/Windows/Linux) for browser opening and process management.

### Data paths

```
CLAUDE_DIR     = process.env.CLAUDE_CONFIG_DIR || ~/.claude
DATA_DIR       = CLAUDE_DIR/xeladash             # Notes, todos, marketplace config
PROJECTS_DIR   = CLAUDE_DIR/projects             # Session data per project
```

Session data lives in `PROJECTS_DIR/{dirName}/{sessionId}.jsonl` — each line is a JSON object with `type`, `timestamp`, `message`, `usage` fields.

### Key data flow

Sessions: `.jsonl` files → `parseJsonl()` → `aggregateTokens()` → `calculateCost()`/`calculateCarbon()` → REST API → Vue frontend

Tools: `~/.claude/commands/*.md` (slash commands), `~/.claude/agents/*.md` (agents with frontmatter), `~/.claude/skills/{name}/SKILL.md` (skills as directories)

### API structure

All routes are under `/api/`. Main groups:
- `/api/projects` — project listing, CLAUDE.md read/write, git status
- `/api/sessions` — query, stream (SSE), diffs, commits, summary, subagents, directive injection
- `/api/tools/{commands,agents,skills}` — CRUD for Claude Code tools (user and project scope)
- `/api/marketplace` — skill sources, registry discovery (GitHub API), install/check
- `/api/plugins` — proxies to `claude plugin` CLI commands
- `/api/insights`, `/api/stats`, `/api/costs` — analytics with caching
- `/api/search`, `/api/files/touched` — global session search, file-to-session mapping

### Marketplace system

Discovers skills from GitHub repos via Trees API. Sources configured in `DATA_DIR/marketplace.json`. Fetches `SKILL.md` files, caches for 10 minutes. Supports token auth via `token` or `tokenEnv` fields.

### Session live features

- **SSE streaming:** `GET /api/sessions/:project/:sessionId/stream` tails the JSONL file
- **Directive injection:** `POST /api/sessions/:project/:sessionId/inject` appends to `.claude/CLAUDE.local.md` with timestamped comment wrappers
- **Active detection:** sessions modified within 90 seconds count as "active"

## Key conventions

- **Pricing:** hardcoded in `MODEL_PRICING` array — match by model name substring (`opus`, `sonnet`, `haiku`). Default falls back to Sonnet pricing.
- **Path security:** all file operations validate resolved paths stay within `os.homedir()`. Slugs must match `^[a-zA-Z0-9_-]+$`.
- **Scope pattern:** tools support `user` scope (`~/.claude/`) and `project` scope (project's `.claude/` dir). `readScope()`/`writeScope()` handle both.
- **File writes:** use `safeWrite()` which creates a backup before overwriting (backup in `DATA_DIR/backups/`).
- **Frontmatter:** agents and memory files use YAML frontmatter (`---\n...\n---`). Parsed by `parseFrontmatter()`.
- **Noise filtering:** session messages with types `file-history-snapshot`, `queue-operation`, `progress` are filtered from chat display. Messages containing `<local-command-caveat>` are filtered as hook noise.
- **Diff engine:** custom Myers/LCS implementation in `server.js` — `diffLines()` → `buildHunks()`. Used for session diff visualization.
- **File touch index:** maps file paths to sessions that modified them. Built lazily, rebuilt every 5 minutes. Extracted from Write/Edit/Read/MultiEdit tool calls in assistant messages.

## graphify — Knowledge Graph

This project maintains a live knowledge graph at `graphify-out/`. It maps all code, assets, and documentation into a navigable graph with community detection and relationship tracking.

### MANDATORY: Always consult the graph for context

**Before ANY code modification or architecture question, you MUST:**
1. Read `graphify-out/GRAPH_REPORT.md` — god nodes, communities, surprising connections
2. Use `/graphify query "<question>"` for cross-cutting questions that span multiple files
3. Use `/graphify path "ConceptA" "ConceptB"` to trace dependency chains
4. Use `/graphify explain "NodeName"` to understand a single concept's connections

The graph gives you the full picture of how the codebase is connected. Use it to avoid blind edits.

### Graph auto-updates — don't rebuild manually

Git hooks (post-commit, post-checkout) handle graph rebuilds automatically. You do NOT need to run rebuild commands. Just commit your changes and the graph updates itself.

### Graph outputs

- `graphify-out/GRAPH_REPORT.md` — audit report with god nodes, communities, gaps
- `graphify-out/graph.html` — interactive visualization (open in browser)
- `graphify-out/graph.json` — raw graph data
- `graphify-out/obsidian/` — Obsidian vault (open as vault, use Graph View for visual navigation)
