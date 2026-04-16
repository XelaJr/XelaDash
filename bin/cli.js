#!/usr/bin/env node

'use strict';

const net = require('net');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const pkg = require('../package.json');

// ─── Arg parsing ────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const subcommand = args[0];

function getFlag(name, def) {
    const idx = args.indexOf(name);
    if (idx === -1) return def;
    return args[idx + 1];
}

const configDirFlag = getFlag('--config-dir', '');
if (configDirFlag) process.env.CLAUDE_CONFIG_DIR = path.resolve(configDirFlag);

const port = parseInt(getFlag('--port', getFlag('-p', process.env.PORT || 3141)), 10);
const noOpen = args.includes('--no-open');

// ─── Config directory + data dir ────────────────────────────────────────────
const CLAUDE_DIR = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
const DATA_DIR = path.join(CLAUDE_DIR, 'xeladash');

try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    const marketplaceDest = path.join(DATA_DIR, 'marketplace.json');
    if (!fs.existsSync(marketplaceDest)) {
        const defaultSrc = path.join(__dirname, '..', 'marketplace.default.json');
        if (fs.existsSync(defaultSrc)) fs.copyFileSync(defaultSrc, marketplaceDest);
    }
} catch { /* ignore */ }

if (args.includes('--version') || args.includes('-v')) {
    console.log(pkg.version);
    process.exit(0);
}

if (args.includes('--help') || args.includes('-h')) {
    console.log(`
  XelaDash v${pkg.version}

  Usage:
    xeladash [options]
    xeladash setup-hook

  Options:
    --port, -p <n>      Port to use (default: 3141)
    --no-open           Don't open the browser automatically
    --config-dir <path> Claude config directory (default: ~/.claude)
                          Also: CLAUDE_CONFIG_DIR env var
    --version, -v       Print version
    --help, -h          Show help

  Commands:
    setup-hook       Add SessionStart hook and /xeladash slash command
    remove-hook      Remove SessionStart hook and /xeladash slash command
    stop             Stop the running XelaDash server
  `);
    process.exit(0);
}

// ─── Stop subcommand ────────────────────────────────────────────────────────

if (subcommand === 'stop') {
    const { execSync } = require('child_process');
    try {
        if (process.platform === 'win32') {
            const out = execSync(`netstat -ano | findstr :${port} | findstr LISTENING`, { encoding: 'utf8' });
            const pid = out.trim().split(/\s+/).pop();
            if (pid) execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
        } else {
            execSync(`lsof -ti:${port} | xargs kill -9`, { stdio: 'ignore' });
        }
        console.log(`✓ XelaDash stopped`);
    } catch {
        console.log(`No XelaDash process found on port ${port}`);
    }
    process.exit(0);
}

// ─── Setup-hook / remove-hook subcommands ───────────────────────────────────

if (subcommand === 'setup-hook') {
    setupHook();
    process.exit(0);
}

if (subcommand === 'remove-hook') {
    removeHook();
    process.exit(0);
}

// ─── Main: start server or reuse existing ───────────────────────────────────

checkForUpdates();
promptSetupHookIfNeeded().then(() => {
    isPortFree(port).then(free => {
        if (free) {
            const { startServer } = require('../server.js');
            startServer(port);
        } else {
            console.log(`XelaDash already running at http://localhost:${port}`);
        }
        if (!noOpen) openBrowser(`http://localhost:${port}`);
    });
});

// ─── Update check ───────────────────────────────────────────────────────────

function checkForUpdates() {
    const cacheFile = path.join(DATA_DIR, '.update-check');
    const TTL = 24 * 60 * 60 * 1000;

    try {
        const cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
        if (Date.now() - cache.checkedAt < TTL) return;
    } catch { /* no cache yet */ }

    const https = require('https');
    https.get(`https://registry.npmjs.org/xeladash/latest`, {
        headers: { 'User-Agent': 'xeladash' }
    }, res => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
            try {
                const latest = JSON.parse(data).version;
                fs.writeFileSync(cacheFile, JSON.stringify({ checkedAt: Date.now(), latest }), 'utf8');
                if (latest && latest !== pkg.version && isNewer(latest, pkg.version)) {
                    console.log(`\n  Update available: ${pkg.version} → ${latest}`);
                    console.log(`  Run: npm install -g xeladash@latest\n`);
                }
            } catch { /* ignore parse errors */ }
        });
    }).on('error', () => { /* ignore network errors */ });
}

function isNewer(a, b) {
    const pa = a.split('.').map(Number);
    const pb = b.split('.').map(Number);
    for (let i = 0; i < 3; i++) {
        if (pa[i] > pb[i]) return true;
        if (pa[i] < pb[i]) return false;
    }
    return false;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function isPortFree(p) {
    return new Promise(resolve => {
        const s = net.createServer();
        s.once('error', () => resolve(false));
        s.once('listening', () => s.close(() => resolve(true)));
        s.listen(p);
    });
}

function promptSetupHookIfNeeded() {
    const settingsPath = path.join(CLAUDE_DIR, 'settings.json');
    const sentinelPath = path.join(DATA_DIR, '.hook-prompted');

    if (fs.existsSync(sentinelPath)) return Promise.resolve();
    try {
        const s = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        const already = s.hooks?.SessionStart?.some(e => e.hooks?.some(h => h.command?.includes('xeladash')));
        if (already) {
            fs.writeFileSync(sentinelPath, '1');
            return Promise.resolve();
        }
    } catch { /* settings.json may not exist */ }

    return new Promise(resolve => {
        process.stdout.write('\n  Auto-start XelaDash when Claude Code opens? (y/n) ');
        process.stdin.setEncoding('utf8');
        process.stdin.once('data', d => {
            process.stdin.pause();
            if (d.trim().toLowerCase() === 'y') {
                setupHook();
            } else {
                console.log('  Skipped. Run `xeladash setup-hook` anytime to enable it.\n');
            }
            fs.writeFileSync(sentinelPath, '1');
            resolve();
        });
    });
}

function openBrowser(url) {
    const cmd = process.platform === 'darwin' ? `open "${url}"` :
        process.platform === 'win32' ? `start "" "${url}"` :
        `xdg-open "${url}"`;
    exec(cmd, err => {
        if (err) console.log(`Open in browser: ${url}`);
    });
}

function setupHook() {
    const settingsPath = path.join(CLAUDE_DIR, 'settings.json');
    const commandsDir = path.join(CLAUDE_DIR, 'commands');
    const commandPath = path.join(commandsDir, 'xeladash.md');

    const hookCommand = process.platform === 'win32'
        ? `netstat -ano | grep ':${port}.*LISTEN' > /dev/null 2>&1 || xeladash --no-open &`
        : `lsof -ti:${port} >/dev/null 2>&1 || (xeladash --no-open &>/dev/null &)`;

    let settings = {};
    try {
        settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    } catch { /* new file */ }
    if (!settings.hooks) settings.hooks = {};
    if (!settings.hooks.SessionStart) settings.hooks.SessionStart = [];

    const alreadyExists = settings.hooks.SessionStart.some(entry =>
        entry.hooks?.some(h => h.command?.includes('xeladash'))
    );

    if (!alreadyExists) {
        settings.hooks.SessionStart.push({
            matcher: '',
            hooks: [{ type: 'command', command: hookCommand }],
        });
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
        console.log(`✓ SessionStart hook added to ${settingsPath}`);
    } else {
        console.log(`  SessionStart hook already present — skipped`);
    }

    if (!fs.existsSync(commandsDir)) fs.mkdirSync(commandsDir, { recursive: true });
    if (!fs.existsSync(commandPath)) {
        fs.writeFileSync(commandPath, [
            '---',
            'description: Start the XelaDash web dashboard',
            '---',
            '',
            'Start the XelaDash dashboard if not already running, then open it in the browser.',
            '',
            '```bash',
            process.platform === 'win32'
                ? `netstat -ano | grep ':${port}.*LISTEN' > /dev/null 2>&1 && echo "XelaDash running at http://localhost:${port}" || xeladash &`
                : `lsof -ti:${port} >/dev/null 2>&1 && echo "XelaDash running at http://localhost:${port}" || (xeladash &)`,
            '```',
        ].join('\n'), 'utf8');
        console.log(`✓ Slash command /xeladash created at ${commandPath}`);
    } else {
        console.log(`  Slash command already present — skipped`);
    }

    console.log('\nDone! Restart Claude Code for the hook to take effect.');
}

function removeHook() {
    const settingsPath = path.join(CLAUDE_DIR, 'settings.json');
    const commandPath = path.join(CLAUDE_DIR, 'commands', 'xeladash.md');
    const sentinelPath = path.join(DATA_DIR, '.hook-prompted');

    let removed = false;
    try {
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        if (settings.hooks?.SessionStart) {
            const before = settings.hooks.SessionStart.length;
            settings.hooks.SessionStart = settings.hooks.SessionStart.filter(
                e => !e.hooks?.some(h => h.command?.includes('xeladash'))
            );
            if (settings.hooks.SessionStart.length < before) {
                fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
                console.log(`✓ SessionStart hook removed from ${settingsPath}`);
                removed = true;
            }
        }
        if (!removed) console.log('  No XelaDash hook found — skipped');
    } catch {
        console.log('  Could not read settings.json — skipped');
    }

    if (fs.existsSync(commandPath)) {
        fs.unlinkSync(commandPath);
        console.log(`✓ Slash command removed from ${commandPath}`);
    }

    try { fs.unlinkSync(sentinelPath); } catch { /* ignore */ }

    console.log('\nDone! Restart Claude Code for the change to take effect.');
}
