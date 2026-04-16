# XelaDash

A local web dashboard for Claude Code power users. Browse sessions, manage tools, track costs, and monitor usage — from a futuristic HUD-style interface. No tokens consumed. Runs entirely on your machine.

![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-339933?logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-4.x-000000?logo=express&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-blue)

## Features

- **Session browser** — Search, filter by branch/date, view full conversation history with diffs and commits
- **Live monitor** — Real-time SSE streaming of active sessions with burn rate tracking
- **Usage analytics** — Cost breakdown by model/project/date, 5-hour window and weekly usage tracking
- **Skills, agents & commands** — Full CRUD management with marketplace integration (install from GitHub)
- **Plugin system** — Install, uninstall, and discover Claude Code plugins
- **Memory viewer** — Browse and inspect project memory files
- **Config editor** — Edit CLAUDE.md, hooks, permissions, and settings from the UI
- **Insights dashboard** — Token usage heatmap, CO2 footprint, cache savings, cost trends
- **File activity** — Track which sessions touched which files
- **Directive injection** — Send live instructions to running Claude Code sessions

## Installation

### From GitHub (recommended)

```bash
npm install -g XelaJr/XelaDash
xeladash
```

### Manual

```bash
git clone https://github.com/XelaJr/XelaDash.git
cd XelaDash
npm install
node bin/cli.js
```

The dashboard opens automatically at `http://localhost:3141`.

## Usage

```bash
xeladash                        # Start on default port (3141)
xeladash --port 4000            # Custom port
xeladash --no-open              # Don't open browser
xeladash setup-hook             # Auto-start when Claude Code opens
xeladash remove-hook            # Remove auto-start
xeladash stop                   # Stop the running server
```

### Auto-start with Claude Code

Run `xeladash setup-hook` to add a SessionStart hook that launches the dashboard automatically every time you open Claude Code.

## How it works

XelaDash reads Claude Code's native data from `~/.claude/` — session JSONL files, settings, tools, and project configs. It never modifies your Claude Code installation or sends data anywhere. Everything stays local.

### Architecture

```
bin/cli.js    →  CLI entry point (port check, hooks, auto-open)
server.js     →  Express backend (REST API, SSE streaming, session parsing)
public/       →  Frontend (Alpine.js SPA with HUD-style CSS)
```

Single dependency: Express. No build step. No bundler.

## Requirements

- Node.js >= 18
- Claude Code installed (`~/.claude/` directory must exist)

## Acknowledgments

Inspired by [claude-home](https://www.npmjs.com/package/claude-home) by ZenekeZene.

## License

MIT
