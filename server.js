const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');
const https = require('https');

// ─── Config directory (supports CLAUDE_CONFIG_DIR override) ──────────────────
const CLAUDE_DIR = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
const DATA_DIR = path.join(CLAUDE_DIR, 'claude-home');
const CLAUDE_SETTINGS_PATH = path.join(CLAUDE_DIR, 'settings.json');
const PROJECTS_DIR = path.join(CLAUDE_DIR, 'projects');

function tildePrefix(p) {
    const home = os.homedir();
    return p.startsWith(home + path.sep) ? '~' + p.slice(home.length) : p;
}
const CLAUDE_DIR_DISPLAY = tildePrefix(CLAUDE_DIR);

function ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, {
        recursive: true
    });
    const marketplaceDest = path.join(DATA_DIR, 'marketplace.json');
    if (!fs.existsSync(marketplaceDest)) {
        const defaultSrc = path.join(__dirname, 'marketplace.default.json');
        if (fs.existsSync(defaultSrc)) fs.copyFileSync(defaultSrc, marketplaceDest);
    }
    const templatesDest = path.join(DATA_DIR, 'templates.json');
    if (!fs.existsSync(templatesDest)) {
        const defaultSrc = path.join(__dirname, 'templates.default.json');
        if (fs.existsSync(defaultSrc)) fs.copyFileSync(defaultSrc, templatesDest);
    }
}
ensureDataDir();

// ─── Claude Code permissions (auto-allow notes/todos writes) ──────────────────
const CLAUDE_HOME_PERMISSIONS = [
    `Write(${tildePrefix(path.join(DATA_DIR, 'notes', '*'))})`,
    `Write(${tildePrefix(path.join(DATA_DIR, 'todos', '*'))})`,
];

function ensureClaudePermissions() {
    try {
        let settings = {};
        if (fs.existsSync(CLAUDE_SETTINGS_PATH)) {
            try {
                settings = JSON.parse(fs.readFileSync(CLAUDE_SETTINGS_PATH, 'utf8'));
            } catch {
                /* corrupt, overwrite */ }
        }
        if (!settings.permissions) settings.permissions = {};
        if (!Array.isArray(settings.permissions.allow)) settings.permissions.allow = [];

        const before = settings.permissions.allow.length;
        for (const perm of CLAUDE_HOME_PERMISSIONS) {
            if (!settings.permissions.allow.includes(perm)) settings.permissions.allow.push(perm);
        }
        if (settings.permissions.allow.length !== before) {
            fs.writeFileSync(CLAUDE_SETTINGS_PATH, JSON.stringify(settings, null, 2) + '\n');
        }
    } catch {
        /* never crash the server over this */ }
}
ensureClaudePermissions();

// Load .env manually (no dotenv dependency)
try {
    const envPath = path.join(DATA_DIR, '.env');
    if (fs.existsSync(envPath)) {
        for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
            const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
            if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
        }
    }
} catch {
    /* ignore */ }

const app = express();
app.use(express.json({
    limit: '1mb'
}));
const PORT = parseInt(process.env.PORT, 10) || 3141;

// ─── Marketplace ──────────────────────────────────────────────────────────────
const MARKETPLACE_CONFIG_PATH = path.join(DATA_DIR, 'marketplace.json');
const MARKETPLACE_TTL = 10 * 60 * 1000; // 10 min
const URL_WHITELIST = ['raw.githubusercontent.com', 'gist.githubusercontent.com'];
const sourceCache = new Map(); // sourceId → { skills, fetchedAt }

function getMarketplaceSources() {
    try {
        const sources = JSON.parse(fs.readFileSync(MARKETPLACE_CONFIG_PATH, 'utf8')).sources || [];
        return sources.map(s => ({
            ...s,
            token: s.token || (s.tokenEnv ? process.env[s.tokenEnv] || '' : ''),
        }));
    } catch {
        return [];
    }
}

function fetchRemote(url, token) {
    return new Promise((resolve, reject) => {
        const headers = {
            'User-Agent': 'claude-home/1.0'
        };
        if (token) headers['Authorization'] = `token ${token}`;
        const req = https.get(url, {
            headers
        }, (res) => {
            if (res.statusCode === 302 || res.statusCode === 301) {
                return fetchRemote(res.headers.location, token).then(resolve).catch(reject);
            }
            if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        });
        req.setTimeout(8000, () => {
            req.destroy();
            reject(new Error('Timeout'));
        });
        req.on('error', reject);
    });
}

async function discoverSourceSkills(source) {
    const {
        owner,
        repo,
        branch,
        skillsPath,
        token
    } = source;
    if (!owner || !repo) return [];
    // GitHub Trees API — one call to list all files
    const url = `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch || 'main'}?recursive=1`;
    const raw = await fetchRemote(url, token);
    const tree = JSON.parse(raw).tree || [];
    const prefix = skillsPath ? skillsPath + '/' : '';
    const skills = [];
    for (const item of tree) {
        const pathLower = item.path.toLowerCase();
        if (!pathLower.endsWith('/skill.md')) continue;
        if (!item.path.startsWith(prefix)) continue;
        const rest = item.path.slice(prefix.length);
        const parts = rest.split('/');
        if (parts.length === 2 && parts[1].toLowerCase() === 'skill.md') {
            skills.push({
                slug: parts[0],
                treePath: item.path
            });
        }
    }
    return skills;
}

async function fetchSkillContent(source, treePath) {
    const {
        owner,
        repo,
        branch,
        token
    } = source;
    // Use Contents API (works for both public and private)
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${treePath}?ref=${branch || 'main'}`;
    const raw = await fetchRemote(url, token);
    const json = JSON.parse(raw);
    const content = Buffer.from(json.content, 'base64').toString('utf8');
    return content;
}

// ─── Write helpers ────────────────────────────────────────────────────────────

function backupFile(filePath) {
    try {
        if (fs.existsSync(filePath)) {
            fs.copyFileSync(filePath, filePath + '.bak');
        }
    } catch {}
}

function safeWrite(filePath, content) {
    backupFile(filePath);
    fs.mkdirSync(path.dirname(filePath), {
        recursive: true
    });
    fs.writeFileSync(filePath, content, 'utf8');
}

// ─── Pricing ─────────────────────────────────────────────────────────────────

// USD per million tokens
const MODEL_PRICING = [{
        match: 'opus',
        input: 15,
        output: 75,
        cacheRead: 1.50,
        cacheWrite: 18.75
    },
    {
        match: 'sonnet',
        input: 3,
        output: 15,
        cacheRead: 0.30,
        cacheWrite: 3.75
    },
    {
        match: 'haiku',
        input: 0.80,
        output: 4,
        cacheRead: 0.08,
        cacheWrite: 1.00
    },
];
const DEFAULT_PRICING = {
    input: 3,
    output: 15,
    cacheRead: 0.30,
    cacheWrite: 3.75
};

function getPricing(modelName) {
    if (!modelName) return DEFAULT_PRICING;
    const m = modelName.toLowerCase();
    return MODEL_PRICING.find(p => m.includes(p.match)) || DEFAULT_PRICING;
}

function calculateCost(tokens, modelName) {
    const p = getPricing(modelName);
    return (
        tokens.input * p.input +
        tokens.output * p.output +
        tokens.cacheRead * p.cacheRead +
        tokens.cacheCreate * p.cacheWrite
    ) / 1_000_000;
}

function cacheSavings(tokens, modelName) {
    const p = getPricing(modelName);
    // Savings = what cache_read would have cost at full input price minus what it actually cost
    return tokens.cacheRead * (p.input - p.cacheRead) / 1_000_000;
}

// ─── Carbon ──────────────────────────────────────────────────────────────────
// Approximate Wh per million *output* tokens (input ~30%, cache-read ~5%)
// Based on Luccioni et al. (2023) methodology + public scaling estimates
const CARBON_WH_PER_1M = {
    opus: 10_000,
    sonnet: 3_000,
    haiku: 800
};
const CARBON_DEFAULT_WH = 3_000;
const CARBON_INTENSITY = 0.300; // gCO2e per Wh (≈300 gCO2/kWh global avg grid)

function calculateCarbon(tokens, modelName) {
    const m = (modelName || '').toLowerCase();
    const wh = m.includes('opus') ? CARBON_WH_PER_1M.opus :
        m.includes('haiku') ? CARBON_WH_PER_1M.haiku :
        CARBON_WH_PER_1M.sonnet || CARBON_DEFAULT_WH;
    const energy =
        (tokens.output * wh +
            tokens.input * wh * 0.30 +
            tokens.cacheRead * wh * 0.05 +
            tokens.cacheCreate * wh * 0.30) / 1_000_000;
    return energy * CARBON_INTENSITY; // gCO2e
}

// ─── Cache ────────────────────────────────────────────────────────────────────

const indexCache = new Map(); // dirName → { mtime, entries }

function getProjectDirs() {
    try {
        return fs.readdirSync(PROJECTS_DIR).filter(name => {
            const p = path.join(PROJECTS_DIR, name);
            return fs.statSync(p).isDirectory() && name !== 'memory';
        });
    } catch {
        return [];
    }
}

async function readFirstMessage(filePath) {
    try {
        const rl = readline.createInterface({
            input: fs.createReadStream(filePath),
            crlfDelay: Infinity
        });
        let firstPrompt = '';
        let gitBranch = '';
        let timestamp = '';
        let count = 0;
        for await (const line of rl) {
            if (!line.trim()) continue;
            try {
                const obj = JSON.parse(line);
                count++;
                if (!gitBranch && obj.gitBranch) gitBranch = obj.gitBranch;
                if (!timestamp && obj.timestamp) timestamp = obj.timestamp;
                if (!firstPrompt && obj.type === 'user') {
                    const content = obj.message?.content;
                    const isHook = typeof content === 'string' ?
                        content.includes('<local-command-caveat>') :
                        Array.isArray(content) && content.every(c => c.type === 'text' && c.text?.includes('<local-command-caveat>'));
                    if (!isHook) {
                        if (typeof content === 'string' && !content.includes('<command-name>')) firstPrompt = content.slice(0, 300);
                        else if (Array.isArray(content)) {
                            const txt = content.find(c => c.type === 'text' && !c.text?.includes('<command-name>') && !c.text?.includes('<local-command-caveat>'));
                            if (txt) firstPrompt = txt.text.slice(0, 300);
                        }
                    }
                }
                if (firstPrompt && gitBranch && count > 5) break;
            } catch {}
        }
        rl.close();
        return {
            firstPrompt,
            gitBranch,
            timestamp,
            count
        };
    } catch {
        return {
            firstPrompt: '',
            gitBranch: '',
            timestamp: '',
            count: 0
        };
    }
}

async function loadSessionIndex(dirName) {
    const dir = path.join(PROJECTS_DIR, dirName);
    const indexPath = path.join(dir, 'sessions-index.json');

    // Load indexed entries
    let indexedEntries = [];
    let indexMtime = 0;
    try {
        const stat = fs.statSync(indexPath);
        indexMtime = stat.mtimeMs;
        const raw = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
        indexedEntries = (raw.entries || []).map(e => ({
            ...e,
            projectDir: dirName
        }));
    } catch {}

    const indexedIds = new Set(indexedEntries.map(e => e.sessionId));

    // Find .jsonl files not in the index
    let jsonlFiles = [];
    try {
        jsonlFiles = fs.readdirSync(dir).filter(f => f.endsWith('.jsonl'));
    } catch {}

    const unindexed = jsonlFiles.filter(f => !indexedIds.has(f.replace('.jsonl', '')));

    // Use cache if nothing changed
    const cached = indexCache.get(dirName);
    const dirStat = (() => {
        try {
            return fs.statSync(dir).mtimeMs;
        } catch {
            return 0;
        }
    })();
    if (cached && cached.indexMtime === indexMtime && cached.dirMtime === dirStat) {
        return cached.entries;
    }

    // Build unindexed entries by reading first line of each file
    const unindexedEntries = await Promise.all(unindexed.map(async f => {
        const sessionId = f.replace('.jsonl', '');
        const filePath = path.join(dir, f);
        const stat = fs.statSync(filePath);
        const {
            firstPrompt,
            gitBranch,
            timestamp
        } = await readFirstMessage(filePath);
        return {
            sessionId,
            projectDir: dirName,
            fullPath: filePath,
            firstPrompt,
            gitBranch,
            created: timestamp || new Date(stat.birthtimeMs).toISOString(),
            modified: new Date(stat.mtimeMs).toISOString(),
            messageCount: Math.round(stat.size / 400), // rough estimate
            fileMtime: stat.mtimeMs,
            projectPath: indexedEntries[0]?.projectPath || '',
        };
    }));

    const allEntries = [
        ...indexedEntries.map(e => {
            const exists = fs.existsSync(e.fullPath || path.join(dir, `${e.sessionId}.jsonl`));
            return {
                ...e,
                orphaned: !exists,
                resumable: exists
            };
        }),
        ...unindexedEntries.map(e => ({
            ...e,
            resumable: true
        })),
    ];
    indexCache.set(dirName, {
        indexMtime,
        dirMtime: dirStat,
        entries: allEntries
    });
    return allEntries;
}

// ─── JSONL Parser ─────────────────────────────────────────────────────────────

const NOISE_TYPES = new Set(['file-history-snapshot', 'queue-operation', 'progress']);

async function parseJsonl(filePath, {
    includeNoise = false,
    searchText = null
} = {}) {
    const messages = [];
    if (!fs.existsSync(filePath)) return messages;

    const rl = readline.createInterface({
        input: fs.createReadStream(filePath),
        crlfDelay: Infinity,
    });

    for await (const line of rl) {
        if (!line.trim()) continue;
        let obj;
        try {
            obj = JSON.parse(line);
        } catch {
            continue;
        }
        if (!includeNoise && NOISE_TYPES.has(obj.type)) continue;

        // Filter out hook output messages (local-command-caveat)
        if (obj.type === 'user') {
            const c = obj.message?.content;
            const isHookMsg = typeof c === 'string' ?
                c.includes('<local-command-caveat>') :
                Array.isArray(c) && c.every(b => b.type === 'text' && b.text?.includes('<local-command-caveat>'));
            if (isHookMsg) continue;
        }

        if (searchText) {
            const text = extractText(obj);
            if (!text.toLowerCase().includes(searchText.toLowerCase())) continue;
        }

        messages.push(obj);
    }
    return messages;
}

function extractText(msg) {
    if (msg.type === 'user') {
        const content = msg.message?.content;
        if (typeof content === 'string') return content;
        if (Array.isArray(content)) {
            return content.map(c => {
                if (c.type === 'text') return c.text || '';
                if (c.type === 'tool_result') return typeof c.content === 'string' ? c.content : '';
                return '';
            }).join(' ');
        }
    }
    if (msg.type === 'assistant') {
        const content = msg.message?.content;
        if (Array.isArray(content)) {
            return content.map(c => {
                if (c.type === 'text') return c.text || '';
                if (c.type === 'thinking') return c.thinking || '';
                return '';
            }).join(' ');
        }
    }
    return '';
}

function aggregateTokens(messages) {
    let input = 0,
        output = 0,
        cacheRead = 0,
        cacheCreate = 0;
    for (const msg of messages) {
        if (msg.type === 'assistant' && msg.message?.usage) {
            const u = msg.message.usage;
            input += u.input_tokens || 0;
            output += u.output_tokens || 0;
            cacheRead += u.cache_read_input_tokens || 0;
            cacheCreate += u.cache_creation_input_tokens || 0;
        }
    }
    return {
        input,
        output,
        cacheRead,
        cacheCreate,
        total: input + output
    };
}

// ─── Memory ───────────────────────────────────────────────────────────────────

function parseFrontmatter(raw) {
    const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    if (!match) return {
        meta: {},
        content: raw
    };
    const meta = {};
    const lines = match[1].split('\n');
    let currentKey = null;
    for (const line of lines) {
        const kv = line.match(/^([\w-]+):\s*(.*)$/);
        if (kv) {
            currentKey = kv[1];
            const val = kv[2].trim();
            if (val.startsWith('[') && val.endsWith(']')) {
                meta[currentKey] = val.slice(1, -1).split(',').map(s => s.trim()).filter(Boolean);
            } else {
                meta[currentKey] = val;
            }
        } else if (currentKey && line.match(/^\s+-\s+(.+)$/)) {
            const val = line.match(/^\s+-\s+(.+)$/)[1].trim();
            if (!Array.isArray(meta[currentKey])) meta[currentKey] = meta[currentKey] ? [meta[currentKey]] : [];
            meta[currentKey].push(val);
        }
    }
    return {
        meta,
        content: match[2].trim()
    };
}

function loadMemoryFiles(dirName) {
    const memDir = path.join(PROJECTS_DIR, dirName, 'memory');
    if (!fs.existsSync(memDir)) return [];
    const files = fs.readdirSync(memDir).filter(f => f.endsWith('.md'));
    return files.map(filename => {
        const raw = fs.readFileSync(path.join(memDir, filename), 'utf8');
        const {
            meta,
            content
        } = parseFrontmatter(raw);
        return {
            filename,
            projectDir: dirName,
            name: meta.name || filename.replace('.md', ''),
            description: meta.description || '',
            type: meta.type || (filename === 'MEMORY.md' ? 'index' : 'unknown'),
            content,
            raw,
            mtime: fs.statSync(path.join(memDir, filename)).mtimeMs,
        };
    });
}

// ─── API Routes ───────────────────────────────────────────────────────────────

app.use(express.static(path.join(__dirname, 'public')));

// ─── Project helpers ─────────────────────────────────────────────────────────

async function getProjectPath(dirName) {
    // 1. Try sessions-index.json originalPath (most reliable)
    const indexPath = path.join(PROJECTS_DIR, dirName, 'sessions-index.json');
    try {
        const idx = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
        if (idx.originalPath) return idx.originalPath;
    } catch {}
    // 2. Try projectPath from loaded entries
    const entries = await loadSessionIndex(dirName);
    if (entries[0]?.projectPath) return entries[0].projectPath;
    // 3. Try cwd field from first few lines of any available JSONL
    const dir = path.join(PROJECTS_DIR, dirName);
    try {
        const jsonlFiles = fs.readdirSync(dir).filter(f => f.endsWith('.jsonl'));
        for (const f of jsonlFiles.slice(0, 3)) {
            const rl = readline.createInterface({
                input: fs.createReadStream(path.join(dir, f)),
                crlfDelay: Infinity
            });
            let scanned = 0;
            for await (const line of rl) {
                if (!line.trim()) continue;
                try {
                    const obj = JSON.parse(line);
                    if (obj.cwd) {
                        rl.close();
                        return obj.cwd;
                    }
                } catch {}
                if (++scanned >= 20) break; // scan up to 20 lines per file
            }
            rl.close();
        }
    } catch {}
    return '';
}

// GET /api/projects
app.get('/api/projects', async (req, res) => {
    const dirs = getProjectDirs();
    const results = await Promise.all(dirs.map(async dirName => {
        const entries = await loadSessionIndex(dirName);
        const projectPath = await getProjectPath(dirName);
        const lastActive = entries.length ?
            entries.reduce((max, e) => e.modified > max ? e.modified : max, '') :
            null;
        const memDir = path.join(PROJECTS_DIR, dirName, 'memory');
        const memoryCount = fs.existsSync(memDir) ?
            fs.readdirSync(memDir).filter(f => f.endsWith('.md') && !f.endsWith('.bak')).length :
            0;
        const diskExists = projectPath ? fs.existsSync(projectPath) : false;
        const branches = [...new Set(entries.map(e => e.gitBranch).filter(Boolean))];
        const visibleCount = entries.filter(e => !e.orphaned).length;
        return {
            dirName,
            projectPath,
            sessionCount: visibleCount,
            lastActive,
            memoryCount,
            diskExists,
            branches
        };
    }));
    res.json(results.filter(p => p.sessionCount > 0).sort((a, b) => (b.lastActive || '').localeCompare(a.lastActive || '')));
});

// GET /api/projects/:dirName/claude-md
app.get('/api/projects/:dirName/claude-md', async (req, res) => {
    const {
        dirName
    } = req.params;
    const projectPath = await getProjectPath(dirName);
    if (!projectPath) return res.json({
        projectPath: '',
        files: []
    });
    const candidates = [{
            label: 'CLAUDE.md',
            p: path.join(projectPath, 'CLAUDE.md')
        },
        {
            label: '.claude/CLAUDE.md',
            p: path.join(projectPath, '.claude', 'CLAUDE.md')
        },
        {
            label: '.claude/CLAUDE.local.md',
            p: path.join(projectPath, '.claude', 'CLAUDE.local.md')
        },
    ];
    const files = [];
    for (const {
            label,
            p
        }
        of candidates) {
        if (fs.existsSync(p)) files.push({
            label,
            filePath: p,
            content: fs.readFileSync(p, 'utf8')
        });
    }
    res.json({
        projectPath,
        files
    });
});

// PUT /api/projects/:dirName/claude-md
app.put('/api/projects/:dirName/claude-md', async (req, res) => {
    const {
        dirName
    } = req.params;
    const {
        filePath,
        content
    } = req.body;
    if (!filePath || typeof content !== 'string') return res.status(400).json({
        error: 'Missing filePath or content'
    });
    const projectPath = await getProjectPath(dirName);
    if (!projectPath) return res.status(404).json({
        error: 'Project not found'
    });
    // Security: filePath must be within projectPath
    const resolved = path.resolve(filePath);
    const base = path.resolve(projectPath);
    if (!resolved.startsWith(base + path.sep) && resolved !== base) {
        return res.status(403).json({
            error: 'Path not allowed'
        });
    }
    try {
        safeWrite(resolved, content);
        res.json({
            ok: true
        });
    } catch (e) {
        res.status(500).json({
            error: e.message
        });
    }
});

// GET /api/projects/:dirName/git-status
app.get('/api/projects/:dirName/git-status', async (req, res) => {
    const {
        dirName
    } = req.params;
    const projectPath = await getProjectPath(dirName);
    if (!projectPath) return res.json({
        projectPath: '',
        files: [],
        isRepo: false
    });
    const {
        exec
    } = require('child_process');
    const run = (cmd) => new Promise((resolve) => {
        exec(cmd, {
            cwd: projectPath,
            timeout: 8000
        }, (err, stdout) => resolve(err ? '' : stdout.trim()));
    });
    const [statusOut, branchOut, logOut] = await Promise.all([
        run('git status --short'),
        run('git rev-parse --abbrev-ref HEAD 2>/dev/null'),
        run('git log --oneline -5 2>/dev/null'),
    ]);
    if (branchOut === '') return res.json({
        projectPath,
        files: [],
        isRepo: false
    });
    const files = statusOut ? statusOut.split('\n').filter(Boolean).map(line => {
        const xy = line.slice(0, 2);
        const rest = line.slice(2).trim();
        return {
            status: xy.trim() || '?',
            path: rest
        };
    }) : [];
    const recentCommits = logOut ? logOut.split('\n').map(l => ({
        hash: l.slice(0, 7),
        message: l.slice(8)
    })) : [];
    res.json({
        projectPath,
        files,
        isRepo: true,
        branch: branchOut,
        recentCommits
    });
});

// ─── Live Session Control (Context Injection) ────────────────────────────────

// POST /api/sessions/:project/:sessionId/inject — append directive to CLAUDE.local.md
app.post('/api/sessions/:project/:sessionId/inject', async (req, res) => {
    const {
        project
    } = req.params;
    const {
        directive,
        persistent = false
    } = req.body;
    if (!directive || typeof directive !== 'string') return res.status(400).json({
        error: 'directive required'
    });

    const projectPath = await getProjectPath(project);
    if (!projectPath) return res.status(404).json({
        error: 'Project not found'
    });

    const claudeLocalPath = path.join(projectPath, '.claude', 'CLAUDE.local.md');
    const timestamp = new Date().toISOString();
    const persistentFlag = persistent ? ' persistent' : '';
    const block = `\n\n<!-- claude-home directive [${timestamp}]${persistentFlag} -->\nIMPORTANT: ${directive.trim()}\n<!-- /claude-home directive -->`;

    try {
        const existing = fs.existsSync(claudeLocalPath) ? fs.readFileSync(claudeLocalPath, 'utf8') : '';
        safeWrite(claudeLocalPath, existing + block);
        res.json({
            ok: true,
            filePath: claudeLocalPath,
            timestamp
        });
    } catch (e) {
        res.status(500).json({
            error: e.message
        });
    }
});

// GET /api/sessions/:project/:sessionId/directives — list injected directives
app.get('/api/sessions/:project/:sessionId/directives', async (req, res) => {
    const {
        project
    } = req.params;
    const projectPath = await getProjectPath(project);
    if (!projectPath) return res.json({
        directives: []
    });

    const claudeLocalPath = path.join(projectPath, '.claude', 'CLAUDE.local.md');
    if (!fs.existsSync(claudeLocalPath)) return res.json({
        directives: []
    });

    const content = fs.readFileSync(claudeLocalPath, 'utf8');
    const regex = /<!-- claude-home directive \[([^\]]+)\]([^>]*) -->\nIMPORTANT: ([\s\S]*?)\n<!-- \/claude-home directive -->/g;
    const directives = [];
    let m;
    while ((m = regex.exec(content)) !== null) {
        directives.push({
            timestamp: m[1],
            persistent: m[2].includes('persistent'),
            text: m[3].trim()
        });
    }
    res.json({
        directives
    });
});

// DELETE /api/sessions/:project/:sessionId/directives — remove a directive by timestamp
app.delete('/api/sessions/:project/:sessionId/directives', async (req, res) => {
    const {
        project
    } = req.params;
    const {
        timestamp
    } = req.body;
    if (!timestamp) return res.status(400).json({
        error: 'timestamp required'
    });

    const projectPath = await getProjectPath(project);
    if (!projectPath) return res.status(404).json({
        error: 'Project not found'
    });

    const claudeLocalPath = path.join(projectPath, '.claude', 'CLAUDE.local.md');
    if (!fs.existsSync(claudeLocalPath)) return res.status(404).json({
        error: 'No directives file'
    });

    let content = fs.readFileSync(claudeLocalPath, 'utf8');
    const escaped = timestamp.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\n\\n<!-- claude-home directive \\[${escaped}\\][^>]* -->\\nIMPORTANT: [\\s\\S]*?\\n<!-- /claude-home directive -->`, 'g');
    content = content.replace(regex, '');
    safeWrite(claudeLocalPath, content);
    res.json({
        ok: true
    });
});

// GET /api/sessions
app.get('/api/sessions', async (req, res) => {
    const {
        project,
        branch,
        search,
        from,
        to
    } = req.query;
    const dirs = project ? [project] : getProjectDirs();
    const all = await Promise.all(dirs.map(d => loadSessionIndex(d)));
    let entries = all.flat();

    if (branch) entries = entries.filter(e => e.gitBranch === branch);
    if (from) entries = entries.filter(e => e.modified >= from);
    if (to) entries = entries.filter(e => e.modified <= to + 'T23:59:59Z');
    if (search) {
        const q = search.toLowerCase();
        entries = entries.filter(e => e.firstPrompt?.toLowerCase().includes(q));
    }

    entries = entries.filter(e => !e.orphaned);
    entries.sort((a, b) => b.modified.localeCompare(a.modified));
    res.json(entries);
});

// GET /api/sessions/active — sessions modified in the last 90s
app.get('/api/sessions/active', (req, res) => {
    const dirs = getProjectDirs();
    const active = [];
    const cutoff = Date.now() - 90 * 1000;
    for (const dirName of dirs) {
        const dir = path.join(PROJECTS_DIR, dirName);
        let files;
        try {
            files = fs.readdirSync(dir).filter(f => f.endsWith('.jsonl'));
        } catch {
            continue;
        }
        for (const file of files) {
            const filePath = path.join(dir, file);
            let stat;
            try {
                stat = fs.statSync(filePath);
            } catch {
                continue;
            }
            if (stat.mtimeMs < cutoff) continue;
            const sessionId = file.replace('.jsonl', '');
            const cached = indexCache.get(dirName);
            const entry = cached?.entries?.find(e => e.sessionId === sessionId);
            let projectPath = entry?.projectPath || '';
            if (!projectPath) {
                try {
                    const idx = JSON.parse(fs.readFileSync(path.join(dir, 'sessions-index.json'), 'utf8'));
                    projectPath = idx.originalPath || '';
                } catch {}
            }
            active.push({
                sessionId,
                projectDir: dirName,
                firstPrompt: entry?.firstPrompt || '',
                gitBranch: entry?.gitBranch || '',
                projectPath,
                modified: new Date(stat.mtimeMs).toISOString(),
            });
        }
    }
    active.sort((a, b) => b.modified.localeCompare(a.modified));
    res.json(active);
});

// ── Session Archaeology ─────────────────────────────────────────────────────

// Parse a JSONL session and extract a lightweight summary (no LLM)
async function parseSessionSummary(filePath) {
    const summary = {
        userPrompts: [], // first 4 user prompts
        toolCounts: {}, // { Bash: N, Write: N, ... }
        filesTouched: [], // [{ tool, path }] deduplicated
        turnCount: 0, // number of user turns
        durationSecs: 0,
    };
    if (!fs.existsSync(filePath)) return summary;

    let firstTs = null,
        lastTs = null;
    const seenFiles = new Set();

    const rl = readline.createInterface({
        input: fs.createReadStream(filePath),
        crlfDelay: Infinity
    });
    for await (const line of rl) {
        if (!line.trim()) continue;
        let obj;
        try {
            obj = JSON.parse(line);
        } catch {
            continue;
        }

        if (obj.timestamp) {
            const t = new Date(obj.timestamp).getTime();
            if (!isNaN(t)) {
                if (firstTs === null) firstTs = t;
                lastTs = t;
            }
        }

        // User prompts
        if (obj.type === 'user' && summary.userPrompts.length < 4) {
            const c = obj.message?.content;
            const isHook = typeof c === 'string' ?
                c.includes('<local-command-caveat>') :
                Array.isArray(c) && c.every(b => b.type === 'text' && b.text?.includes('<local-command-caveat>'));
            if (!isHook) {
                let text = '';
                if (typeof c === 'string' && !c.includes('<command-name>')) text = c.trim();
                else if (Array.isArray(c)) {
                    const t = c.find(b => b.type === 'text' && !b.text?.includes('<command-name>') && !b.text?.includes('<local-command-caveat>'));
                    if (t) text = t.text.trim();
                }
                if (text) {
                    summary.userPrompts.push(text.slice(0, 200));
                    summary.turnCount++;
                }
            }
        }

        // Tool calls from assistant messages
        if (obj.type === 'assistant') {
            const content = obj.message?.content;
            if (Array.isArray(content)) {
                for (const block of content) {
                    if (block.type !== 'tool_use') continue;
                    const name = block.name;
                    summary.toolCounts[name] = (summary.toolCounts[name] || 0) + 1;
                    // Extract file paths for Write / Edit / Read / MultiEdit
                    const fp = block.input?.file_path;
                    if (fp && (name === 'Write' || name === 'Edit' || name === 'Read' || name === 'MultiEdit')) {
                        const key = `${name}:${fp}`;
                        if (!seenFiles.has(key)) {
                            seenFiles.add(key);
                            summary.filesTouched.push({
                                tool: name,
                                path: fp
                            });
                        }
                    }
                }
            }
        }
    }
    rl.close();

    if (firstTs !== null && lastTs !== null) summary.durationSecs = Math.round((lastTs - firstTs) / 1000);
    return summary;
}

// File-touch index: path fragment → matching sessions
let fileTouchIndex = null;
let fileTouchBuildPromise = null;
let fileTouchBuiltAt = 0;

async function buildFileTouchIndex() {
    if (fileTouchBuildPromise) return fileTouchBuildPromise;
    fileTouchBuildPromise = _doBuildFileTouchIndex().finally(() => {
        fileTouchBuildPromise = null;
    });
    return fileTouchBuildPromise;
}

async function _doBuildFileTouchIndex() {
    const idx = new Map(); // normalizedPath → [{sessionId, projectDir, firstPrompt, modified, tools}]
    const dirs = getProjectDirs();
    for (const dirName of dirs) {
        const entries = await loadSessionIndex(dirName);
        for (const entry of entries) {
            if (entry.orphaned) continue;
            const fp = path.join(PROJECTS_DIR, dirName, `${entry.sessionId}.jsonl`);
            try {
                const summary = await parseSessionSummary(fp);
                const toolSet = new Set();
                for (const {
                        tool,
                        path: filePath
                    }
                    of summary.filesTouched) {
                    toolSet.add(tool);
                    const norm = filePath.toLowerCase();
                    if (!idx.has(norm)) idx.set(norm, []);
                    const list = idx.get(norm);
                    // avoid duplicate sessionId for same file
                    if (!list.find(r => r.sessionId === entry.sessionId && r.filePath === filePath)) {
                        list.push({
                            sessionId: entry.sessionId,
                            projectDir: dirName,
                            projectPath: entry.projectPath || '',
                            firstPrompt: entry.firstPrompt || '',
                            modified: entry.modified || '',
                            filePath,
                            tool,
                        });
                    }
                }
            } catch {}
        }
    }
    fileTouchIndex = idx;
    fileTouchBuiltAt = Date.now();
}

// ── Diff view ───────────────────────────────────────────────────────────────

// Myers/LCS line diff — returns flat array of {type:'add'|'remove'|'context', line}
function diffLines(oldStr, newStr) {
    const a = (oldStr || '').split('\n');
    const b = (newStr || '').split('\n');
    const m = a.length,
        n = b.length;
    // LCS DP table (only need two rows for memory efficiency — but keep simple for correctness)
    const dp = Array.from({
        length: m + 1
    }, () => new Uint32Array(n + 1));
    for (let i = m - 1; i >= 0; i--) {
        for (let j = n - 1; j >= 0; j--) {
            dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
        }
    }
    const result = [];
    let i = 0,
        j = 0;
    while (i < m || j < n) {
        if (i < m && j < n && a[i] === b[j]) {
            result.push({
                type: 'context',
                line: a[i]
            });
            i++;
            j++;
        } else if (j < n && (i >= m || dp[i + 1] && dp[i + 1][j] >= dp[i][j + 1])) {
            result.push({
                type: 'add',
                line: b[j]
            });
            j++;
        } else {
            result.push({
                type: 'remove',
                line: a[i]
            });
            i++;
        }
    }
    return result;
}

// Group flat diff into hunks with N context lines around each change block
function buildHunks(flat, ctx = 3) {
    if (!flat.length) return [];
    const changed = new Set(flat.map((d, i) => d.type !== 'context' ? i : -1).filter(i => i >= 0));
    if (!changed.size) return [];
    const included = new Set();
    changed.forEach(pos => {
        for (let k = Math.max(0, pos - ctx); k <= Math.min(flat.length - 1, pos + ctx); k++) included.add(k);
    });
    const sorted = [...included].sort((a, b) => a - b);
    const hunks = [];
    let hunk = [];
    for (let k = 0; k < sorted.length; k++) {
        if (k > 0 && sorted[k] > sorted[k - 1] + 1) {
            hunks.push(hunk);
            hunk = [];
        }
        hunk.push(flat[sorted[k]]);
    }
    if (hunk.length) hunks.push(hunk);
    return hunks;
}

// GET /api/sessions/:project/:sessionId/diffs
app.get('/api/sessions/:project/:sessionId/diffs', async (req, res) => {
    const {
        project,
        sessionId
    } = req.params;
    const filePath = path.join(PROJECTS_DIR, project, `${sessionId}.jsonl`);
    if (!fs.existsSync(filePath)) return res.json([]);
    const changes = [];
    try {
        const rl = readline.createInterface({
            input: fs.createReadStream(filePath),
            crlfDelay: Infinity
        });
        for await (const line of rl) {
            if (!line.trim()) continue;
            let obj;
            try {
                obj = JSON.parse(line);
            } catch {
                continue;
            }
            if (obj.type !== 'assistant') continue;
            const content = obj.message?.content;
            if (!Array.isArray(content)) continue;
            for (const block of content) {
                if (block.type !== 'tool_use') continue;
                if (block.name === 'Edit' && block.input?.file_path) {
                    const flat = diffLines(block.input.old_string || '', block.input.new_string || '');
                    const hunks = buildHunks(flat);
                    const added = flat.filter(d => d.type === 'add').length;
                    const removed = flat.filter(d => d.type === 'remove').length;
                    if (hunks.length) changes.push({
                        tool: 'Edit',
                        filePath: block.input.file_path,
                        hunks,
                        added,
                        removed,
                        timestamp: obj.timestamp,
                        allLines: flat
                    });
                } else if (block.name === 'Write' && block.input?.file_path) {
                    const lines = (block.input.content || '').split('\n').map(l => ({
                        type: 'add',
                        line: l
                    }));
                    // For Write, show all lines as added (no context needed — it's a new file)
                    changes.push({
                        tool: 'Write',
                        filePath: block.input.file_path,
                        hunks: [lines],
                        added: lines.length,
                        removed: 0,
                        timestamp: obj.timestamp
                    });
                }
            }
        }
        rl.close();
    } catch (e) {
        return res.status(500).json({
            error: e.message
        });
    }
    res.json(changes);
});

// GET /api/sessions/:project/:sessionId/commits
app.get('/api/sessions/:project/:sessionId/commits', async (req, res) => {
    const {
        project,
        sessionId
    } = req.params;
    const filePath = path.join(PROJECTS_DIR, project, `${sessionId}.jsonl`);
    if (!fs.existsSync(filePath)) return res.json([]);
    const commits = [];
    try {
        const lines = fs.readFileSync(filePath, 'utf8').split('\n').filter(l => l.trim());
        const messages = lines.map(l => {
            try {
                return JSON.parse(l);
            } catch {
                return null;
            }
        }).filter(Boolean);
        // Build map of tool_use_id → tool_result text
        const toolResults = new Map();
        for (const msg of messages) {
            if (msg.type !== 'user') continue;
            const content = Array.isArray(msg.message?.content) ? msg.message.content : [];
            for (const block of content) {
                if (block.type !== 'tool_result' || !block.tool_use_id) continue;
                const text = typeof block.content === 'string' ? block.content :
                    Array.isArray(block.content) ? block.content.map(c => c.text || '').join('') : '';
                toolResults.set(block.tool_use_id, text);
            }
        }
        // Find git commit tool_use blocks
        for (const msg of messages) {
            if (msg.type !== 'assistant') continue;
            const content = Array.isArray(msg.message?.content) ? msg.message.content : [];
            for (const block of content) {
                if (block.type !== 'tool_use' || block.name !== 'Bash') continue;
                const cmd = block.input?.command || '';
                if (!/git\s+commit/.test(cmd)) continue;
                const output = toolResults.get(block.id) || '';
                const match = output.match(/\[(\S+)\s+([a-f0-9]+)\]\s+(.+)/);
                if (!match) continue;
                const [, branch, hash, message] = match;
                const statsMatch = output.match(/(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/);
                const stats = {
                    files: statsMatch ? parseInt(statsMatch[1]) || 0 : 0,
                    insertions: statsMatch ? parseInt(statsMatch[2]) || 0 : 0,
                    deletions: statsMatch ? parseInt(statsMatch[3]) || 0 : 0
                };
                const authorMatch = cmd.match(/Co-Authored-By:\s*([^<\n]+)/);
                const author = authorMatch ? authorMatch[1].trim() : 'Claude';
                commits.push({
                    hash,
                    branch,
                    message: message.trim(),
                    author,
                    timestamp: msg.timestamp,
                    stats
                });
            }
        }
    } catch (e) {
        return res.status(500).json({
            error: e.message
        });
    }
    res.json(commits);
});

// GET /api/sessions/:project/:sessionId/summary
app.get('/api/sessions/:project/:sessionId/summary', async (req, res) => {
    const {
        project,
        sessionId
    } = req.params;
    const filePath = path.join(PROJECTS_DIR, project, `${sessionId}.jsonl`);
    try {
        const summary = await parseSessionSummary(filePath);
        res.json(summary);
    } catch (e) {
        res.status(500).json({
            error: e.message
        });
    }
});

// GET /api/files/touched?q=<path fragment>
app.get('/api/files/touched', async (req, res) => {
    const q = (req.query.q || '').toLowerCase().trim();
    if (!q) return res.json([]);

    // Rebuild index if stale (> 5 min) or not yet built
    if (!fileTouchIndex || Date.now() - fileTouchBuiltAt > 5 * 60 * 1000) {
        await buildFileTouchIndex();
    }

    const results = [];
    const seen = new Set();
    for (const [norm, entries] of fileTouchIndex) {
        if (!norm.includes(q)) continue;
        for (const e of entries) {
            const key = `${e.sessionId}:${e.filePath}`;
            if (!seen.has(key)) {
                seen.add(key);
                results.push(e);
            }
        }
    }
    // Sort by modified desc
    results.sort((a, b) => b.modified.localeCompare(a.modified));
    res.json(results.slice(0, 200));
});

// GET /api/files/recent — top N most recently touched files (unique paths)
app.get('/api/files/recent', async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit) || 30, 100);
    if (!fileTouchIndex || Date.now() - fileTouchBuiltAt > 5 * 60 * 1000) {
        await buildFileTouchIndex();
    }
    // For each unique file path, get the most recent session that touched it
    const byPath = new Map(); // filePath → most recent entry
    for (const [, entries] of fileTouchIndex) {
        for (const e of entries) {
            const cur = byPath.get(e.filePath);
            if (!cur || e.modified > cur.modified) byPath.set(e.filePath, e);
        }
    }
    const results = [...byPath.values()].sort((a, b) => b.modified.localeCompare(a.modified));
    res.json(results.slice(0, limit).map(e => ({
        filePath: e.filePath,
        modified: e.modified,
        tool: e.tool,
        sessionCount: (fileTouchIndex.get(e.filePath.toLowerCase()) || []).length
    })));
});

// Invalidate file-touch index when sessions change
function invalidateFileTouchIndex() {
    fileTouchIndex = null;
}

// GET /api/sessions/:project/:sessionId
app.get('/api/sessions/:project/:sessionId', async (req, res) => {
    const {
        project,
        sessionId
    } = req.params;
    const filePath = path.join(PROJECTS_DIR, project, `${sessionId}.jsonl`);
    try {
        const resumable = fs.existsSync(filePath);
        const messages = await parseJsonl(filePath);
        const tokens = aggregateTokens(messages);
        const models = [...new Set(
            messages
            .filter(m => m.type === 'assistant' && m.message?.model)
            .map(m => m.message.model)
        )];
        const primaryModel = models[0] || '';
        const cost = calculateCost(tokens, primaryModel);
        const savings = cacheSavings(tokens, primaryModel);
        const carbon = calculateCarbon(tokens, primaryModel);
        res.json({
            sessionId,
            tokens,
            models,
            cost,
            savings,
            carbon,
            messages,
            resumable
        });
    } catch (e) {
        res.status(500).json({
            error: e.message
        });
    }
});

// GET /api/sessions/:project/:sessionId/subagents
app.get('/api/sessions/:project/:sessionId/subagents', (req, res) => {
    const {
        project,
        sessionId
    } = req.params;
    const subagentsDir = path.join(PROJECTS_DIR, project, sessionId, 'subagents');
    try {
        if (!fs.existsSync(subagentsDir)) return res.json([]);
        const files = fs.readdirSync(subagentsDir);
        const agents = [];
        const metaFiles = files.filter(f => f.endsWith('.meta.json'));
        const jsonlFiles = files.filter(f => f.endsWith('.jsonl'));

        for (const jsonlFile of jsonlFiles) {
            const agentId = jsonlFile.replace('agent-', '').replace('.jsonl', '');
            const metaFile = `agent-${agentId}.meta.json`;
            let meta = {};
            if (metaFiles.includes(metaFile)) {
                try {
                    meta = JSON.parse(fs.readFileSync(path.join(subagentsDir, metaFile), 'utf8'));
                } catch {}
            }
            agents.push({
                agentId,
                agentType: meta.agentType || 'unknown',
                description: meta.description || ''
            });
        }
        res.json(agents);
    } catch (e) {
        res.status(500).json({
            error: e.message
        });
    }
});

// GET /api/sessions/:project/:sessionId/subagents/:agentId
app.get('/api/sessions/:project/:sessionId/subagents/:agentId', async (req, res) => {
    const {
        project,
        sessionId,
        agentId
    } = req.params;
    const filePath = path.join(PROJECTS_DIR, project, sessionId, 'subagents', `agent-${agentId}.jsonl`);
    try {
        const messages = await parseJsonl(filePath);
        const tokens = aggregateTokens(messages);
        res.json({
            agentId,
            tokens,
            messages
        });
    } catch (e) {
        res.status(500).json({
            error: e.message
        });
    }
});

// GET /api/sessions/:project/:sessionId/stream — SSE live tail
app.get('/api/sessions/:project/:sessionId/stream', (req, res) => {
    const {
        project,
        sessionId
    } = req.params;
    const filePath = path.join(PROJECTS_DIR, project, `${sessionId}.jsonl`);

    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
    });

    // Start from current EOF — only tail NEW lines, never replay history
    let lastPosition = 0;
    try {
        if (fs.existsSync(filePath)) lastPosition = fs.statSync(filePath).size;
    } catch {}
    let tail = '';

    function readNew() {
        if (!fs.existsSync(filePath)) return;
        let stat;
        try {
            stat = fs.statSync(filePath);
        } catch {
            return;
        }
        if (stat.size <= lastPosition) return;
        const fd = fs.openSync(filePath, 'r');
        const chunk = Buffer.alloc(stat.size - lastPosition);
        fs.readSync(fd, chunk, 0, chunk.length, lastPosition);
        fs.closeSync(fd);
        lastPosition = stat.size;
        tail += chunk.toString('utf8');
        const lines = tail.split('\n');
        tail = lines.pop();
        for (const line of lines) {
            if (!line.trim()) continue;
            let obj;
            try {
                obj = JSON.parse(line);
            } catch {
                continue;
            }
            if (NOISE_TYPES.has(obj.type)) continue;
            if (obj.type === 'user') {
                const c = obj.message?.content;
                const isHook = typeof c === 'string' ?
                    c.includes('<local-command-caveat>') :
                    Array.isArray(c) && c.every(b => b.type === 'text' && b.text?.includes('<local-command-caveat>'));
                if (isHook) continue;
            }
            res.write(`data: ${JSON.stringify(obj)}\n\n`);
        }
    }

    let watcher;
    try {
        watcher = fs.watch(filePath, () => readNew());
    } catch {
        // file might not exist yet; watch the project directory
        try {
            const dirPath = path.join(PROJECTS_DIR, project);
            const dirWatcher = fs.watch(dirPath, (event, filename) => {
                if (filename === `${sessionId}.jsonl`) {
                    readNew();
                    dirWatcher.close();
                    try {
                        watcher = fs.watch(filePath, () => readNew());
                    } catch {}
                }
            });
            req.on('close', () => {
                try {
                    dirWatcher.close();
                } catch {}
            });
        } catch {}
    }

    const keepalive = setInterval(() => res.write(': ping\n\n'), 15000);
    req.on('close', () => {
        clearInterval(keepalive);
        try {
            if (watcher) watcher.close();
        } catch {}
    });
});

// GET /api/search
app.get('/api/search', async (req, res) => {
    const {
        q,
        project
    } = req.query;
    if (!q || q.length < 2) return res.json([]);

    const dirs = project ? [project] : getProjectDirs();
    const results = [];
    const lower = q.toLowerCase();

    for (const dirName of dirs) {
        const entries = await loadSessionIndex(dirName);
        for (const entry of entries) {
            const filePath = path.join(PROJECTS_DIR, dirName, `${entry.sessionId}.jsonl`);
            if (!fs.existsSync(filePath)) continue;
            try {
                const messages = await parseJsonl(filePath);
                const matches = [];
                for (const msg of messages) {
                    const text = extractText(msg);
                    if (!text.toLowerCase().includes(lower)) continue;
                    const idx = text.toLowerCase().indexOf(lower);
                    const start = Math.max(0, idx - 80);
                    const end = Math.min(text.length, idx + q.length + 80);
                    matches.push({
                        role: msg.type === 'user' ? 'user' : 'assistant',
                        timestamp: msg.timestamp,
                        snippet: text.slice(start, end),
                        matchStart: idx - start,
                        matchLen: q.length,
                    });
                    if (matches.length >= 3) break;
                }
                if (matches.length > 0) {
                    results.push({
                        sessionId: entry.sessionId,
                        projectDir: dirName,
                        firstPrompt: entry.firstPrompt,
                        gitBranch: entry.gitBranch,
                        modified: entry.modified,
                        matches,
                    });
                }
                if (results.length >= 50) break;
            } catch {}
        }
        if (results.length >= 50) break;
    }

    res.json(results);
});

// GET /api/stats
app.get('/api/stats', async (req, res) => {
    const dirs = getProjectDirs();
    const all = await Promise.all(dirs.map(d => loadSessionIndex(d)));
    const allEntries = all.flat();

    const sessionsByDate = {};
    const sessionsByBranch = {};

    for (const e of allEntries) {
        const date = e.modified.slice(0, 10);
        sessionsByDate[date] = (sessionsByDate[date] || 0) + 1;
        if (e.gitBranch) {
            sessionsByBranch[e.gitBranch] = (sessionsByBranch[e.gitBranch] || 0) + 1;
        }
    }

    const activeProjects = (await Promise.all(dirs.map(async d => (await loadSessionIndex(d)).length > 0))).filter(Boolean).length;

    res.json({
        totalSessions: allEntries.length,
        totalProjects: activeProjects,
        sessionsByDate,
        sessionsByBranch,
    });
});

// GET /api/branches
app.get('/api/branches', async (req, res) => {
    const {
        project
    } = req.query;
    const dirs = project ? [project] : getProjectDirs();
    const all = await Promise.all(dirs.map(d => loadSessionIndex(d)));
    const branches = [...new Set(all.flat().map(e => e.gitBranch).filter(Boolean))].sort();
    res.json(branches);
});

// GET /api/memory
app.get('/api/memory', (req, res) => {
    const {
        project
    } = req.query;
    const dirs = project ? [project] : getProjectDirs();
    const files = dirs.flatMap(d => loadMemoryFiles(d));
    res.json(files);
});

// GET /api/memory/:project/:filename
app.get('/api/memory/:project/:filename', (req, res) => {
    const {
        project,
        filename
    } = req.params;
    const filePath = path.join(PROJECTS_DIR, project, 'memory', filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({
        error: 'Not found'
    });
    const raw = fs.readFileSync(filePath, 'utf8');
    const {
        meta,
        content
    } = parseFrontmatter(raw);
    res.json({
        filename,
        projectDir: project,
        meta,
        content,
        raw
    });
});

// GET /api/insights
let insightsCache = null;
let insightsCacheTime = 0;

async function extractSessionCost(filePath) {
    let input = 0,
        output = 0,
        cacheRead = 0,
        cacheCreate = 0,
        model = null;
    const rl = readline.createInterface({
        input: fs.createReadStream(filePath),
        crlfDelay: Infinity
    });
    for await (const line of rl) {
        if (!line.includes('"assistant"')) continue;
        try {
            const obj = JSON.parse(line);
            if (obj.type !== 'assistant') continue;
            if (!model && obj.message?.model) model = obj.message.model;
            const u = obj.message?.usage;
            if (u) {
                input += u.input_tokens || 0;
                output += u.output_tokens || 0;
                cacheRead += u.cache_read_input_tokens || 0;
                cacheCreate += u.cache_creation_input_tokens || 0;
            }
        } catch {}
    }
    const tokens = {
        input,
        output,
        cacheRead,
        cacheCreate
    };
    return {
        tokens,
        model,
        cost: calculateCost(tokens, model),
        savings: cacheSavings(tokens, model),
        carbon: calculateCarbon(tokens, model)
    };
}

app.get('/api/insights', async (req, res) => {
    const force = req.query.refresh === '1';
    if (insightsCache && !force && Date.now() - insightsCacheTime < 300_000) {
        return res.json(insightsCache);
    }

    const dirs = getProjectDirs();
    const allEntries = (await Promise.all(dirs.map(d => loadSessionIndex(d)))).flat();

    let totalCost = 0,
        totalSavings = 0,
        totalCarbon = 0;
    const totalTokens = {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheCreate: 0
    };
    const byDate = {};
    const byProjectMap = {};
    const byModelMap = {};
    const sessionCosts = [];

    await Promise.all(allEntries.map(async entry => {
        const filePath = path.join(PROJECTS_DIR, entry.projectDir, `${entry.sessionId}.jsonl`);
        if (!fs.existsSync(filePath)) return;
        try {
            const {
                tokens,
                model,
                cost,
                savings,
                carbon
            } = await extractSessionCost(filePath);
            if (cost === 0 && tokens.input === 0) return;

            totalCost += cost;
            totalSavings += savings;
            totalCarbon += carbon;
            totalTokens.input += tokens.input;
            totalTokens.output += tokens.output;
            totalTokens.cacheRead += tokens.cacheRead;
            totalTokens.cacheCreate += tokens.cacheCreate;

            const date = (entry.modified || '').slice(0, 10);
            byDate[date] = (byDate[date] || 0) + cost;

            const proj = entry.projectDir;
            if (!byProjectMap[proj]) byProjectMap[proj] = {
                cost: 0,
                sessions: 0,
                projectPath: entry.projectPath || proj
            };
            byProjectMap[proj].cost += cost;
            byProjectMap[proj].sessions += 1;

            const mkey = model || 'unknown';
            if (!byModelMap[mkey]) byModelMap[mkey] = {
                cost: 0,
                sessions: 0
            };
            byModelMap[mkey].cost += cost;
            byModelMap[mkey].sessions += 1;

            sessionCosts.push({
                sessionId: entry.sessionId,
                projectDir: entry.projectDir,
                firstPrompt: entry.firstPrompt,
                modified: entry.modified,
                cost,
                model,
                carbon
            });
        } catch {}
    }));

    const byProject = Object.entries(byProjectMap)
        .map(([dir, v]) => ({
            dir,
            ...v
        }))
        .sort((a, b) => b.cost - a.cost)
        .slice(0, 10);

    const byModel = Object.entries(byModelMap)
        .map(([model, v]) => ({
            model,
            ...v
        }))
        .sort((a, b) => b.cost - a.cost);

    const topSessions = sessionCosts
        .sort((a, b) => b.cost - a.cost)
        .slice(0, 15);

    insightsCache = {
        totalCost,
        totalSavings,
        totalCarbon,
        totalTokens,
        byDate,
        byProject,
        byModel,
        topSessions,
        computedAt: new Date().toISOString()
    };
    insightsCacheTime = Date.now();
    res.json(insightsCache);
});

// GET /api/costs  — lightweight: only session costs map, no full aggregation
let costsCache = null;
let costsCacheTime = 0;

app.get('/api/costs', async (req, res) => {
    if (costsCache && Date.now() - costsCacheTime < 300_000) return res.json(costsCache);
    const dirs = getProjectDirs();
    const allEntries = (await Promise.all(dirs.map(d => loadSessionIndex(d)))).flat();
    const result = {};
    await Promise.all(allEntries.map(async entry => {
        const filePath = path.join(PROJECTS_DIR, entry.projectDir, `${entry.sessionId}.jsonl`);
        if (!fs.existsSync(filePath)) return;
        try {
            const {
                cost,
                carbon
            } = await extractSessionCost(filePath);
            if (cost > 0.00001) result[entry.sessionId] = {
                cost,
                carbon
            };
        } catch {}
    }));
    costsCache = result;
    costsCacheTime = Date.now();
    res.json(result);
});

// GET /api/plans
app.get('/api/plans', (req, res) => {
    const plansDir = path.join(CLAUDE_DIR, 'plans');
    try {
        if (!fs.existsSync(plansDir)) return res.json([]);
        const files = fs.readdirSync(plansDir).filter(f => f.endsWith('.md'));
        const plans = files.map(filename => {
            const filePath = path.join(plansDir, filename);
            const stat = fs.statSync(filePath);
            const raw = fs.readFileSync(filePath, 'utf8');
            const titleMatch = raw.match(/^#\s+(.+)$/m);
            const title = titleMatch ? titleMatch[1].replace(/^Plan:\s*/i, '').trim() : filename.replace('.md', '');
            const lines = raw.split('\n');
            let summary = '';
            let pastTitle = false;
            for (const line of lines) {
                if (!pastTitle && line.startsWith('#')) {
                    pastTitle = true;
                    continue;
                }
                if (pastTitle && line.trim() && !line.startsWith('#')) {
                    summary = line.trim().slice(0, 200);
                    break;
                }
            }
            return {
                filename,
                title,
                summary,
                content: raw,
                modified: new Date(stat.mtimeMs).toISOString(),
                size: stat.size
            };
        }).sort((a, b) => b.modified.localeCompare(a.modified));
        res.json(plans);
    } catch (e) {
        res.status(500).json({
            error: e.message
        });
    }
});

// GET /api/history
app.get('/api/history', async (req, res) => {
    const {
        q,
        project
    } = req.query;
    const historyPath = path.join(CLAUDE_DIR, 'history.jsonl');
    try {
        const entries = [];
        const rl = readline.createInterface({
            input: fs.createReadStream(historyPath),
            crlfDelay: Infinity
        });
        for await (const line of rl) {
            if (!line.trim()) continue;
            try {
                const obj = JSON.parse(line);
                if (project && !obj.project?.includes(project)) continue;
                if (q && !obj.display?.toLowerCase().includes(q.toLowerCase())) continue;
                const projectParts = (obj.project || '').split('/');
                const projectName = projectParts[projectParts.length - 1] || obj.project || '';
                entries.push({
                    display: (obj.display || '').slice(0, 300),
                    timestamp: obj.timestamp,
                    project: obj.project || '',
                    projectName,
                    sessionId: obj.sessionId || '',
                });
            } catch {}
        }
        entries.reverse();
        res.json(entries);
    } catch (e) {
        res.status(500).json({
            error: e.message
        });
    }
});

function scopePath(scope, projectPath) {
    if (scope === 'user') return path.join(CLAUDE_DIR, 'settings.json');
    if (scope === 'project') return path.join(projectPath, '.claude', 'settings.json');
    if (scope === 'local') return path.join(projectPath, '.claude', 'settings.local.json');
}

function readScope(scope, projectPath) {
    try {
        return JSON.parse(fs.readFileSync(scopePath(scope, projectPath), 'utf8'));
    } catch {
        return {};
    }
}

function writeScope(scope, projectPath, data) {
    safeWrite(scopePath(scope, projectPath), JSON.stringify(data, null, 2) + '\n');
}

// GET /api/config
app.get('/api/config', (req, res) => {
    const claudeDir = CLAUDE_DIR;
    const projectPath = req.query.projectPath || '';
    try {
        const settings = readScope('user', '');
        // Merge hooks from project + local scopes, tagging each with scope
        if (projectPath) {
            const projectSettings = readScope('project', projectPath);
            const localSettings = readScope('local', projectPath);
            if (projectSettings.hooks) {
                if (!settings._scopedHooks) settings._scopedHooks = {};
                for (const [ev, matchers] of Object.entries(projectSettings.hooks)) {
                    if (!settings._scopedHooks[ev]) settings._scopedHooks[ev] = [];
                    matchers.forEach((m, i) => settings._scopedHooks[ev].push({
                        ...m,
                        _scope: 'project',
                        _idx: i
                    }));
                }
            }
            if (localSettings.hooks) {
                if (!settings._scopedHooks) settings._scopedHooks = {};
                for (const [ev, matchers] of Object.entries(localSettings.hooks)) {
                    if (!settings._scopedHooks[ev]) settings._scopedHooks[ev] = [];
                    matchers.forEach((m, i) => settings._scopedHooks[ev].push({
                        ...m,
                        _scope: 'local',
                        _idx: i
                    }));
                }
            }
        }
        const hooksDir = path.join(claudeDir, 'hooks');
        const hookFiles = [];
        try {
            for (const f of fs.readdirSync(hooksDir)) {
                const raw = fs.readFileSync(path.join(hooksDir, f), 'utf8');
                hookFiles.push({
                    filename: f,
                    content: raw.slice(0, 3000)
                });
            }
        } catch {}
        // Resolve CLAUDE.md with @-includes (user scope)
        const claudeMdFiles = [];
        try {
            const claudeMdPath = path.join(claudeDir, 'CLAUDE.md');
            const claudeMdRaw = fs.readFileSync(claudeMdPath, 'utf8');
            claudeMdFiles.push({
                filename: 'CLAUDE.md',
                content: claudeMdRaw,
                _scope: 'user',
                _path: claudeMdPath
            });
            for (const line of claudeMdRaw.split('\n')) {
                const ref = line.match(/^@(.+)$/);
                if (ref) {
                    const refPath = path.join(claudeDir, ref[1].trim());
                    try {
                        claudeMdFiles.push({
                            filename: ref[1].trim(),
                            content: fs.readFileSync(refPath, 'utf8'),
                            _scope: 'user',
                            _path: refPath
                        });
                    } catch {}
                }
            }
        } catch {}
        // Project-level CLAUDE.md files
        if (projectPath) {
            const candidates = [{
                    label: 'CLAUDE.md',
                    p: path.join(projectPath, 'CLAUDE.md')
                },
                {
                    label: '.claude/CLAUDE.md',
                    p: path.join(projectPath, '.claude', 'CLAUDE.md')
                },
                {
                    label: '.claude/CLAUDE.local.md',
                    p: path.join(projectPath, '.claude', 'CLAUDE.local.md')
                },
            ];
            for (const {
                    label,
                    p
                }
                of candidates) {
                try {
                    claudeMdFiles.push({
                        filename: label,
                        content: fs.readFileSync(p, 'utf8'),
                        _scope: 'project',
                        _path: p
                    });
                } catch {}
            }
            // Merge project + local permissions into _scopedPermissions
            const projSettings = readScope('project', projectPath);
            const localSettings = readScope('local', projectPath);
            const scopedPerms = [];
            if (projSettings.permissions) scopedPerms.push({
                ...projSettings.permissions,
                _scope: 'project'
            });
            if (localSettings.permissions) scopedPerms.push({
                ...localSettings.permissions,
                _scope: 'local'
            });
            if (scopedPerms.length) settings._scopedPermissions = scopedPerms;
        }
        // List custom output styles from ~/.claude/output-styles/
        const outputStyles = [];
        const outputStylesDir = path.join(claudeDir, 'output-styles');
        try {
            for (const f of fs.readdirSync(outputStylesDir).filter(f => f.endsWith('.md'))) {
                const raw = fs.readFileSync(path.join(outputStylesDir, f), 'utf8');
                const {
                    meta
                } = parseFrontmatter(raw);
                outputStyles.push({
                    filename: f,
                    name: meta.name || f.replace('.md', ''),
                    description: meta.description || ''
                });
            }
        } catch {}
        res.json({
            settings,
            hookFiles,
            claudeMdFiles,
            outputStyles
        });
    } catch (e) {
        res.status(500).json({
            error: e.message
        });
    }
});

// Helper: build slug→pluginId maps from installed plugins' caches
function buildPluginAttribution() {
    const skillSlugs = {}; // slug → pluginId
    const agentSlugs = {}; // slug → pluginId
    const commandSlugs = {}; // "namespace:slug" → pluginId

    const cacheBase = path.join(CLAUDE_DIR, 'plugins', 'cache');
    let installedPluginIds = [];
    try {
        const installedJson = path.join(CLAUDE_DIR, 'plugins', 'installed_plugins.json');
        if (fs.existsSync(installedJson)) {
            const installed = JSON.parse(fs.readFileSync(installedJson, 'utf8'));
            installedPluginIds = Object.keys(installed.plugins || {});
        }
    } catch {}

    for (const pluginId of installedPluginIds) {
        const atIdx = pluginId.lastIndexOf('@');
        const pName = atIdx >= 0 ? pluginId.slice(0, atIdx) : pluginId;
        const marketplace = atIdx >= 0 ? pluginId.slice(atIdx + 1) : null;
        if (!marketplace) continue;

        let pluginDir = null;
        try {
            const cacheDir = path.join(cacheBase, marketplace, pName);
            const versions = fs.readdirSync(cacheDir).filter(v => {
                try {
                    return fs.statSync(path.join(cacheDir, v)).isDirectory();
                } catch {
                    return false;
                }
            });
            if (versions.length > 0) {
                versions.sort((a, b) => b.localeCompare(a, undefined, {
                    numeric: true
                }));
                pluginDir = path.join(cacheDir, versions[0]);
            }
        } catch {}

        if (!pluginDir) continue;

        try {
            fs.readdirSync(path.join(pluginDir, 'skills')).filter(d => {
                try {
                    return fs.statSync(path.join(pluginDir, 'skills', d)).isDirectory();
                } catch {
                    return false;
                }
            }).forEach(d => {
                skillSlugs[d] = pluginId;
            });
        } catch {}
        try {
            fs.readdirSync(path.join(pluginDir, 'agents')).filter(f => f.endsWith('.md')).forEach(f => {
                agentSlugs[f.replace('.md', '')] = pluginId;
            });
        } catch {}
        try {
            fs.readdirSync(path.join(pluginDir, '.claude', 'commands')).filter(f => f.endsWith('.md')).forEach(f => {
                commandSlugs[`${pName}:${f.replace('.md', '')}`] = pluginId;
            });
        } catch {}
    }
    return {
        skillSlugs,
        agentSlugs,
        commandSlugs
    };
}

// GET /api/tools/commands
app.get('/api/tools/commands', (req, res) => {
    const projectPath = req.query.projectPath || '';
    const commands = [];

    function readCommandsDir(dir, scope) {
        try {
            const entries = fs.readdirSync(dir);
            // Flat .md files (project-level convention)
            for (const f of entries.filter(f => f.endsWith('.md'))) {
                try {
                    const raw = fs.readFileSync(path.join(dir, f), 'utf8');
                    const {
                        meta,
                        content
                    } = parseFrontmatter(raw);
                    const slug = f.replace('.md', '');
                    commands.push({
                        namespace: scope === 'user' ? 'user' : 'project',
                        slug,
                        name: meta.name || slug,
                        description: meta.description || '',
                        argumentHint: meta['argument-hint'] || '',
                        allowedTools: Array.isArray(meta['allowed-tools']) ? meta['allowed-tools'] : (meta['allowed-tools'] ? [meta['allowed-tools']] : []),
                        content,
                        _scope: scope
                    });
                } catch {}
            }
            // Namespaced subdirs (personal convention: ~/.claude/commands/{ns}/*.md)
            for (const ns of entries.filter(f => fs.statSync(path.join(dir, f)).isDirectory())) {
                const nsDir = path.join(dir, ns);
                for (const file of fs.readdirSync(nsDir).filter(f => f.endsWith('.md'))) {
                    try {
                        const raw = fs.readFileSync(path.join(nsDir, file), 'utf8');
                        const {
                            meta,
                            content
                        } = parseFrontmatter(raw);
                        const slug = file.replace('.md', '');
                        commands.push({
                            namespace: ns,
                            slug,
                            name: meta.name || `${ns}:${slug}`,
                            description: meta.description || '',
                            argumentHint: meta['argument-hint'] || '',
                            allowedTools: Array.isArray(meta['allowed-tools']) ? meta['allowed-tools'] : (meta['allowed-tools'] ? [meta['allowed-tools']] : []),
                            content,
                            _scope: scope
                        });
                    } catch {}
                }
            }
        } catch {}
    }

    try {
        readCommandsDir(path.join(CLAUDE_DIR, 'commands'), 'user');
        if (projectPath) {
            readCommandsDir(path.join(projectPath, '.claude', 'commands'), 'project');
        }
        // Also include commands from installed plugins
        try {
            const installedJson = path.join(CLAUDE_DIR, 'plugins', 'installed_plugins.json');
            if (fs.existsSync(installedJson)) {
                const installed = JSON.parse(fs.readFileSync(installedJson, 'utf8'));
                for (const [pluginId, entries] of Object.entries(installed.plugins || {})) {
                    const installPath = entries[0]?.installPath;
                    if (!installPath) continue;
                    const cmdsDir = path.join(installPath, '.claude', 'commands');
                    if (!fs.existsSync(cmdsDir)) continue;
                    const atIdx = pluginId.lastIndexOf('@');
                    const pName = atIdx >= 0 ? pluginId.slice(0, atIdx) : pluginId;
                    for (const f of fs.readdirSync(cmdsDir).filter(f => f.endsWith('.md'))) {
                        const slug = f.replace('.md', '');
                        if (commands.some(c => c.namespace === pName && c.slug === slug)) continue;
                        try {
                            const raw = fs.readFileSync(path.join(cmdsDir, f), 'utf8');
                            const {
                                meta,
                                content
                            } = parseFrontmatter(raw);
                            commands.push({
                                namespace: pName,
                                slug,
                                name: meta.name || `${pName}:${slug}`,
                                description: meta.description || '',
                                argumentHint: meta['argument-hint'] || '',
                                allowedTools: [],
                                content,
                                _scope: 'user',
                                pluginId
                            });
                        } catch {}
                    }
                }
            }
        } catch {}
        commands.sort((a, b) => a.name.localeCompare(b.name));
        res.json(commands);
    } catch (e) {
        res.status(500).json({
            error: e.message
        });
    }
});

// DELETE /api/tools/commands/:slug — delete a command file
app.delete('/api/tools/commands/:slug', (req, res) => {
    const {
        slug
    } = req.params;
    const {
        scope,
        namespace,
        projectPath
    } = req.body || {};
    if (!slug || !/^[a-zA-Z0-9_-]+$/.test(slug)) return res.status(400).json({
        error: 'slug inválido'
    });

    let baseDir;
    if (scope === 'project') {
        if (!projectPath) return res.status(400).json({
            error: 'projectPath requerido para scope project'
        });
        const pp = path.resolve(projectPath);
        if (!pp.startsWith(os.homedir())) return res.status(403).json({
            error: 'Forbidden'
        });
        baseDir = path.join(pp, '.claude', 'commands');
    } else {
        baseDir = path.join(CLAUDE_DIR, 'commands');
    }

    const filePath = namespace ?
        path.join(baseDir, namespace, slug + '.md') :
        path.join(baseDir, slug + '.md');

    if (!path.resolve(filePath).startsWith(path.resolve(baseDir))) return res.status(403).json({
        error: 'Forbidden'
    });
    if (!fs.existsSync(filePath)) return res.status(404).json({
        error: 'Comando no encontrado'
    });

    try {
        fs.unlinkSync(filePath);
        res.json({
            ok: true
        });
    } catch (e) {
        res.status(500).json({
            error: e.message
        });
    }
});

// GET /api/tools/agents
app.get('/api/tools/agents', (req, res) => {
    const projectPath = req.query.projectPath || '';
    const agents = [];

    function readAgentsDir(dir, scope) {
        try {
            const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
            for (const f of files) {
                try {
                    const raw = fs.readFileSync(path.join(dir, f), 'utf8');
                    const {
                        meta,
                        content
                    } = parseFrontmatter(raw);
                    const slug = f.replace('.md', '');
                    const tools = meta.tools ? meta.tools.split(',').map(t => t.trim()).filter(Boolean) : [];
                    agents.push({
                        slug,
                        name: meta.name || slug,
                        description: meta.description || '',
                        tools,
                        color: meta.color || '',
                        content,
                        _scope: scope
                    });
                } catch {}
            }
        } catch {}
    }

    try {
        readAgentsDir(path.join(CLAUDE_DIR, 'agents'), 'user');
        if (projectPath) {
            const pp = path.resolve(projectPath);
            if (pp.startsWith(os.homedir())) readAgentsDir(path.join(pp, '.claude', 'agents'), 'project');
        }
        // Also include agents from installed plugins
        try {
            const installedJson = path.join(CLAUDE_DIR, 'plugins', 'installed_plugins.json');
            if (fs.existsSync(installedJson)) {
                const installed = JSON.parse(fs.readFileSync(installedJson, 'utf8'));
                for (const [pluginId, entries] of Object.entries(installed.plugins || {})) {
                    const installPath = entries[0]?.installPath;
                    if (!installPath) continue;
                    const agentsDir = path.join(installPath, 'agents');
                    if (!fs.existsSync(agentsDir)) continue;
                    for (const f of fs.readdirSync(agentsDir).filter(f => f.endsWith('.md'))) {
                        const slug = f.replace('.md', '');
                        if (agents.some(a => a.slug === slug)) continue;
                        try {
                            const raw = fs.readFileSync(path.join(agentsDir, f), 'utf8');
                            const {
                                meta,
                                content
                            } = parseFrontmatter(raw);
                            const tools = meta.tools ? meta.tools.split(',').map(t => t.trim()).filter(Boolean) : [];
                            agents.push({
                                slug,
                                name: meta.name || slug,
                                description: meta.description || '',
                                tools,
                                color: meta.color || '',
                                content,
                                _scope: 'user',
                                pluginId
                            });
                        } catch {}
                    }
                }
            }
        } catch {}
        agents.sort((a, b) => a.name.localeCompare(b.name));
        res.json(agents);
    } catch (e) {
        res.status(500).json({
            error: e.message
        });
    }
});

// POST /api/tools/agents
app.post('/api/tools/agents', (req, res) => {
    const {
        slug,
        name,
        description,
        tools,
        color,
        content,
        scope,
        projectPath
    } = req.body || {};
    if (!slug || !/^[a-zA-Z0-9_-]+$/.test(slug)) return res.status(400).json({
        error: 'slug inválido'
    });

    let baseDir;
    if (scope === 'project') {
        if (!projectPath) return res.status(400).json({
            error: 'projectPath requerido'
        });
        const pp = path.resolve(projectPath);
        if (!pp.startsWith(os.homedir())) return res.status(403).json({
            error: 'Forbidden'
        });
        baseDir = path.join(pp, '.claude', 'agents');
    } else {
        baseDir = path.join(CLAUDE_DIR, 'agents');
    }

    const agentPath = path.join(baseDir, slug + '.md');
    if (fs.existsSync(agentPath)) return res.status(409).json({
        error: `Ya existe un agente con el slug "${slug}"`
    });

    try {
        fs.mkdirSync(baseDir, {
            recursive: true
        });
        const toolsStr = Array.isArray(tools) ? tools.join(', ') : (tools || '');
        const fm = `---\nname: ${name || slug}\ndescription: ${description || ''}\ntools: ${toolsStr}${color ? '\ncolor: ' + color : ''}\n---\n\n${content || ''}`;
        fs.writeFileSync(agentPath, fm, 'utf8');
        res.json({
            ok: true
        });
    } catch (e) {
        res.status(500).json({
            error: e.message
        });
    }
});

// PUT /api/tools/agents/:slug
app.put('/api/tools/agents/:slug', (req, res) => {
    const {
        slug
    } = req.params;
    const {
        name,
        description,
        tools,
        color,
        content,
        scope,
        projectPath
    } = req.body || {};

    let baseDir;
    if (scope === 'project') {
        if (!projectPath) return res.status(400).json({
            error: 'projectPath requerido'
        });
        const pp = path.resolve(projectPath);
        if (!pp.startsWith(os.homedir())) return res.status(403).json({
            error: 'Forbidden'
        });
        baseDir = path.join(pp, '.claude', 'agents');
    } else {
        baseDir = path.join(CLAUDE_DIR, 'agents');
    }

    const agentPath = path.join(baseDir, slug + '.md');
    if (!fs.existsSync(agentPath)) return res.status(404).json({
        error: 'Agente no encontrado'
    });

    try {
        const existing = parseFrontmatter(fs.readFileSync(agentPath, 'utf8'));
        const newName = name !== undefined ? name : (existing.meta.name || slug);
        const newDesc = description !== undefined ? description : (existing.meta.description || '');
        const newTools = tools !== undefined ? (Array.isArray(tools) ? tools.join(', ') : tools) : (existing.meta.tools || '');
        const newColor = color !== undefined ? color : (existing.meta.color || '');
        const newContent = content !== undefined ? content : existing.content;
        const fm = `---\nname: ${newName}\ndescription: ${newDesc}\ntools: ${newTools}${newColor ? '\ncolor: ' + newColor : ''}\n---\n\n${newContent}`;
        fs.writeFileSync(agentPath, fm, 'utf8');
        res.json({
            ok: true
        });
    } catch (e) {
        res.status(500).json({
            error: e.message
        });
    }
});

// DELETE /api/tools/agents/:slug
app.delete('/api/tools/agents/:slug', (req, res) => {
    const {
        slug
    } = req.params;
    const {
        scope,
        projectPath
    } = req.body || {};

    let baseDir;
    if (scope === 'project') {
        if (!projectPath) return res.status(400).json({
            error: 'projectPath requerido'
        });
        const pp = path.resolve(projectPath);
        if (!pp.startsWith(os.homedir())) return res.status(403).json({
            error: 'Forbidden'
        });
        baseDir = path.join(pp, '.claude', 'agents');
    } else {
        baseDir = path.join(CLAUDE_DIR, 'agents');
    }

    const agentPath = path.join(baseDir, slug + '.md');
    if (!fs.existsSync(agentPath)) return res.status(404).json({
        error: 'Agente no encontrado'
    });
    if (!path.resolve(agentPath).startsWith(path.resolve(baseDir))) return res.status(403).json({
        error: 'Forbidden'
    });

    try {
        fs.unlinkSync(agentPath);
        res.json({
            ok: true
        });
    } catch (e) {
        res.status(500).json({
            error: e.message
        });
    }
});

// GET /api/tools/skills
app.get('/api/tools/skills', (req, res) => {
    const projectPath = req.query.projectPath || '';
    const skills = [];

    function readSkillsDir(dir, scope) {
        try {
            const dirs = fs.readdirSync(dir).filter(f => fs.statSync(path.join(dir, f)).isDirectory());
            for (const d of dirs) {
                const skillMdPath = path.join(dir, d, 'SKILL.md');
                if (!fs.existsSync(skillMdPath)) continue;
                try {
                    const raw = fs.readFileSync(skillMdPath, 'utf8');
                    const {
                        meta,
                        content
                    } = parseFrontmatter(raw);
                    skills.push({
                        slug: d,
                        name: meta.name || d,
                        description: meta.description || '',
                        content,
                        _scope: scope
                    });
                } catch {}
            }
        } catch {}
    }

    try {
        readSkillsDir(path.join(CLAUDE_DIR, 'skills'), 'user');
        if (projectPath) {
            readSkillsDir(path.join(projectPath, '.claude', 'skills'), 'project');
        }
        // Also include skills from installed plugins (plugin items live in cache, not ~/.claude/skills)
        try {
            const installedJson = path.join(CLAUDE_DIR, 'plugins', 'installed_plugins.json');
            if (fs.existsSync(installedJson)) {
                const installed = JSON.parse(fs.readFileSync(installedJson, 'utf8'));
                for (const [pluginId, entries] of Object.entries(installed.plugins || {})) {
                    const installPath = entries[0]?.installPath;
                    if (!installPath) continue;
                    const skillsDir = path.join(installPath, 'skills');
                    if (!fs.existsSync(skillsDir)) continue;
                    const dirs = fs.readdirSync(skillsDir).filter(f => {
                        try {
                            return fs.statSync(path.join(skillsDir, f)).isDirectory();
                        } catch {
                            return false;
                        }
                    });
                    for (const d of dirs) {
                        if (skills.some(s => s.slug === d)) continue; // skip if already present
                        const skillMdPath = path.join(skillsDir, d, 'SKILL.md');
                        if (!fs.existsSync(skillMdPath)) continue;
                        try {
                            const raw = fs.readFileSync(skillMdPath, 'utf8');
                            const {
                                meta,
                                content
                            } = parseFrontmatter(raw);
                            skills.push({
                                slug: d,
                                name: meta.name || d,
                                description: meta.description || '',
                                content,
                                _scope: 'user',
                                pluginId
                            });
                        } catch {}
                    }
                }
            }
        } catch {}
        skills.sort((a, b) => a.name.localeCompare(b.name));
        res.json(skills);
    } catch (e) {
        res.status(500).json({
            error: e.message
        });
    }
});

// POST /api/tools/skills — create a new skill
app.post('/api/tools/skills', (req, res) => {
    const {
        slug,
        name,
        description,
        content,
        scope,
        projectPath
    } = req.body || {};
    if (!slug || !/^[a-zA-Z0-9_-]+$/.test(slug)) return res.status(400).json({
        error: 'slug inválido (solo letras, números, guiones, guiones bajos)'
    });

    let baseDir;
    if (scope === 'project') {
        if (!projectPath) return res.status(400).json({
            error: 'projectPath requerido para scope project'
        });
        const pp = path.resolve(projectPath);
        if (!pp.startsWith(os.homedir())) return res.status(403).json({
            error: 'Forbidden'
        });
        baseDir = path.join(pp, '.claude', 'skills');
    } else {
        baseDir = path.join(CLAUDE_DIR, 'skills');
    }

    const skillDir = path.join(baseDir, slug);
    if (fs.existsSync(skillDir)) return res.status(409).json({
        error: `Ya existe una skill con el slug "${slug}"`
    });

    try {
        fs.mkdirSync(skillDir, {
            recursive: true
        });
        const frontmatter = `---\nname: ${name || slug}\ndescription: ${description || ''}\n---\n\n${content || ''}`;
        fs.writeFileSync(path.join(skillDir, 'SKILL.md'), frontmatter, 'utf8');
        res.json({
            ok: true
        });
    } catch (e) {
        res.status(500).json({
            error: e.message
        });
    }
});

// PUT /api/tools/skills/:slug — update a skill's content
app.put('/api/tools/skills/:slug', (req, res) => {
    const {
        slug
    } = req.params;
    const {
        name,
        description,
        content,
        scope,
        projectPath
    } = req.body || {};

    let baseDir;
    if (scope === 'project') {
        if (!projectPath) return res.status(400).json({
            error: 'projectPath requerido para scope project'
        });
        const pp = path.resolve(projectPath);
        if (!pp.startsWith(os.homedir())) return res.status(403).json({
            error: 'Forbidden'
        });
        baseDir = path.join(pp, '.claude', 'skills');
    } else {
        baseDir = path.join(CLAUDE_DIR, 'skills');
    }

    const skillMdPath = path.join(baseDir, slug, 'SKILL.md');
    if (!fs.existsSync(skillMdPath)) return res.status(404).json({
        error: 'Skill no encontrada'
    });

    try {
        // Read existing to preserve fields not being updated
        const existing = parseFrontmatter(fs.readFileSync(skillMdPath, 'utf8'));
        const newName = name !== undefined ? name : (existing.meta.name || slug);
        const newDesc = description !== undefined ? description : (existing.meta.description || '');
        const newContent = content !== undefined ? content : existing.content;
        const frontmatter = `---\nname: ${newName}\ndescription: ${newDesc}\n---\n\n${newContent}`;
        fs.writeFileSync(skillMdPath, frontmatter, 'utf8');
        res.json({
            ok: true
        });
    } catch (e) {
        res.status(500).json({
            error: e.message
        });
    }
});

// DELETE /api/tools/skills/:slug — delete a skill directory
app.delete('/api/tools/skills/:slug', (req, res) => {
    const {
        slug
    } = req.params;
    const {
        scope,
        projectPath
    } = req.body || {};

    let baseDir;
    if (scope === 'project') {
        if (!projectPath) return res.status(400).json({
            error: 'projectPath requerido para scope project'
        });
        const pp = path.resolve(projectPath);
        if (!pp.startsWith(os.homedir())) return res.status(403).json({
            error: 'Forbidden'
        });
        baseDir = path.join(pp, '.claude', 'skills');
    } else {
        baseDir = path.join(CLAUDE_DIR, 'skills');
    }

    const skillDir = path.join(baseDir, slug);
    if (!fs.existsSync(skillDir)) return res.status(404).json({
        error: 'Skill no encontrada'
    });

    // Safety: ensure path is inside baseDir
    if (!path.resolve(skillDir).startsWith(path.resolve(baseDir))) return res.status(403).json({
        error: 'Forbidden'
    });

    try {
        fs.rmSync(skillDir, {
            recursive: true,
            force: true
        });
        res.json({
            ok: true
        });
    } catch (e) {
        res.status(500).json({
            error: e.message
        });
    }
});

// GET /api/status
app.get('/api/status', (req, res) => {
    let claudeVersion = '—';
    try {
        const {
            execSync
        } = require('child_process');
        const out = execSync('claude --version 2>/dev/null', {
            timeout: 3000
        }).toString().trim();
        claudeVersion = out.split('\n')[0];
    } catch {}
    const appVersion = require('./package.json').version;
    res.json({
        claudeVersion,
        appVersion,
        claudeDir: CLAUDE_DIR_DISPLAY
    });
});

// ─── Marketplace endpoints ───────────────────────────────────────────────────

// GET /api/marketplace/sources — returns configured sources (no tokens)
app.get('/api/marketplace/sources', (req, res) => {
    const sources = getMarketplaceSources()
        .filter(s => s.owner && s.repo)
        .map(({
            id,
            name,
            owner,
            repo,
            branch,
            skillsPath
        }) => ({
            id,
            name,
            owner,
            repo,
            branch,
            skillsPath
        }));
    res.json(sources);
});

// POST /api/marketplace/sources — add a new source
app.post('/api/marketplace/sources', (req, res) => {
    const {
        name,
        owner,
        repo,
        branch,
        skillsPath,
        token,
        tokenEnv
    } = req.body || {};
    if (!name || !owner || !repo) return res.status(400).json({
        error: 'name, owner and repo are required'
    });
    const config = JSON.parse(fs.readFileSync(MARKETPLACE_CONFIG_PATH, 'utf8'));
    const id = owner.toLowerCase() + '-' + repo.toLowerCase().replace(/[^a-z0-9]/g, '-');
    if (config.sources.some(s => s.id === id)) return res.status(409).json({
        error: 'Source already exists'
    });
    config.sources.push({
        id,
        name,
        owner,
        repo,
        branch: branch || 'main',
        skillsPath: skillsPath || '',
        token: token || '',
        tokenEnv: tokenEnv || ''
    });
    fs.writeFileSync(MARKETPLACE_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
    sourceCache.delete(id);
    res.json({
        id
    });
});

// DELETE /api/marketplace/sources/:id — remove a source
app.delete('/api/marketplace/sources/:id', (req, res) => {
    const {
        id
    } = req.params;
    const config = JSON.parse(fs.readFileSync(MARKETPLACE_CONFIG_PATH, 'utf8'));
    const idx = config.sources.findIndex(s => s.id === id);
    if (idx === -1) return res.status(404).json({
        error: 'Source not found'
    });
    config.sources.splice(idx, 1);
    fs.writeFileSync(MARKETPLACE_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
    sourceCache.delete(id);
    res.json({
        ok: true
    });
});

// GET /api/marketplace/registry — discovers skills from all configured sources
app.get('/api/marketplace/registry', async (req, res) => {
    const sources = getMarketplaceSources().filter(s => s.owner && s.repo);
    if (sources.length === 0) return res.json([]);

    const now = Date.now();
    const results = await Promise.allSettled(sources.map(async source => {
        const cached = sourceCache.get(source.id);
        if (cached && (now - cached.fetchedAt) < MARKETPLACE_TTL) return cached.skills;

        const slugEntries = await discoverSourceSkills(source);
        // Fetch all SKILL.md contents in parallel to get name/description
        const skills = await Promise.all(slugEntries.map(async ({
            slug,
            treePath
        }) => {
            try {
                const raw = await fetchSkillContent(source, treePath);
                const {
                    meta,
                    content
                } = parseFrontmatter(raw);
                return {
                    slug,
                    name: meta.name || slug,
                    description: meta.description || '',
                    content,
                    _source: source.id,
                    _sourceName: source.name
                };
            } catch {
                return {
                    slug,
                    name: slug,
                    description: '',
                    content: '',
                    _source: source.id,
                    _sourceName: source.name
                };
            }
        }));

        sourceCache.set(source.id, {
            skills,
            fetchedAt: now
        });
        return skills;
    }));

    const all = results
        .filter(r => r.status === 'fulfilled')
        .flatMap(r => r.value)
        .sort((a, b) => a.name.localeCompare(b.name));

    const errors = results
        .filter(r => r.status === 'rejected')
        .map((r, i) => `${sources[i]?.name || i}: ${r.reason?.message}`);

    res.json({
        skills: all,
        errors
    });
});

// GET /api/marketplace/skill/:slug?source= — re-fetch a single skill (fresh content)
app.get('/api/marketplace/skill/:slug', async (req, res) => {
    const {
        slug
    } = req.params;
    const sourceId = req.query.source;
    if (!/^[a-zA-Z0-9_-]+$/.test(slug)) return res.status(400).json({
        error: 'slug inválido'
    });

    const sources = getMarketplaceSources().filter(s => s.owner && s.repo);
    const source = sourceId ? sources.find(s => s.id === sourceId) : sources[0];
    if (!source) return res.status(404).json({
        error: 'Fuente no encontrada'
    });

    const prefix = source.skillsPath ? source.skillsPath + '/' : '';
    const treePath = `${prefix}${slug}/SKILL.md`;
    try {
        const raw = await fetchSkillContent(source, treePath);
        const {
            meta,
            content
        } = parseFrontmatter(raw);
        res.json({
            slug,
            name: meta.name || slug,
            description: meta.description || '',
            content,
            _source: source.id
        });
    } catch (e) {
        res.status(502).json({
            error: e.message
        });
    }
});

// POST /api/marketplace/install
app.post('/api/marketplace/install', (req, res) => {
    const {
        slug,
        name,
        description,
        content,
        scope,
        projectPath
    } = req.body || {};
    if (!slug || !/^[a-zA-Z0-9_-]+$/.test(slug)) return res.status(400).json({
        error: 'slug inválido'
    });
    if (!content || content.length > 200_000) return res.status(400).json({
        error: 'Contenido inválido o demasiado grande'
    });

    let baseDir;
    if (scope === 'project') {
        if (!projectPath) return res.status(400).json({
            error: 'projectPath requerido'
        });
        const pp = path.resolve(projectPath);
        if (!pp.startsWith(os.homedir())) return res.status(403).json({
            error: 'Forbidden'
        });
        baseDir = path.join(pp, '.claude', 'skills');
    } else {
        baseDir = path.join(CLAUDE_DIR, 'skills');
    }

    const skillDir = path.join(baseDir, slug);
    if (fs.existsSync(skillDir)) return res.status(409).json({
        error: `La skill "${slug}" ya está instalada`
    });

    try {
        fs.mkdirSync(skillDir, {
            recursive: true
        });
        const fm = `---\nname: ${name || slug}\ndescription: ${description || ''}\n---\n\n${content}`;
        fs.writeFileSync(path.join(skillDir, 'SKILL.md'), fm, 'utf8');
        res.json({
            ok: true
        });
    } catch (e) {
        res.status(500).json({
            error: e.message
        });
    }
});

// GET /api/marketplace/check-installed
app.get('/api/marketplace/check-installed', (req, res) => {
    const {
        slugs,
        projectPath
    } = req.query;
    if (!slugs) return res.json({});
    const slugList = slugs.split(',').map(s => s.trim()).filter(Boolean);
    const result = {};
    const userSkillsDir = path.join(CLAUDE_DIR, 'skills');
    let projectSkillsDir = null;
    if (projectPath) {
        const pp = path.resolve(projectPath);
        if (pp.startsWith(os.homedir())) projectSkillsDir = path.join(pp, '.claude', 'skills');
    }
    for (const slug of slugList) {
        if (!/^[a-zA-Z0-9_-]+$/.test(slug)) continue;
        const inUser = fs.existsSync(path.join(userSkillsDir, slug, 'SKILL.md'));
        const inProject = projectSkillsDir ? fs.existsSync(path.join(projectSkillsDir, slug, 'SKILL.md')) : false;
        result[slug] = inUser || inProject;
    }
    res.json(result);
});

function normalizeSkillUrl(url) {
    // Convert GitHub blob URLs to raw URLs:
    // https://github.com/{owner}/{repo}/blob/{branch}/{path} → https://raw.githubusercontent.com/{owner}/{repo}/{branch}/{path}
    const blobMatch = url.match(/^https:\/\/github\.com\/([^/]+\/[^/]+)\/blob\/(.+)$/);
    if (blobMatch) return `https://raw.githubusercontent.com/${blobMatch[1]}/${blobMatch[2]}`;
    return url;
}

// GET /api/marketplace/fetch-url
app.get('/api/marketplace/fetch-url', async (req, res) => {
    const {
        url
    } = req.query;
    if (!url) return res.status(400).json({
        error: 'url requerida'
    });

    const normalizedUrl = normalizeSkillUrl(url);
    let parsed;
    try {
        parsed = new URL(normalizedUrl);
    } catch {
        return res.status(400).json({
            error: 'URL inválida'
        });
    }
    if (parsed.protocol !== 'https:') return res.status(400).json({
        error: 'Solo se permiten URLs HTTPS'
    });
    if (!URL_WHITELIST.includes(parsed.hostname)) return res.status(400).json({
        error: `Dominio no permitido. Dominios aceptados: ${URL_WHITELIST.join(', ')}`
    });
    if (!parsed.pathname.endsWith('.md')) return res.status(400).json({
        error: 'La URL debe apuntar a un archivo .md'
    });

    try {
        const raw = await fetchRemote(normalizedUrl);
        if (raw.length > 200_000) return res.status(400).json({
            error: 'Archivo demasiado grande'
        });
        const {
            meta,
            content
        } = parseFrontmatter(raw);
        const parts = parsed.pathname.split('/');
        const slugFromPath = parts[parts.length - 2] || parts[parts.length - 1].replace('.md', '');
        const slug = (meta.name || slugFromPath).toLowerCase().replace(/[^a-z0-9_-]/g, '-');
        res.json({
            slug,
            name: meta.name || slug,
            description: meta.description || '',
            content,
            raw
        });
    } catch (e) {
        res.status(502).json({
            error: e.message
        });
    }
});

// ─── Write endpoints ─────────────────────────────────────────────────────────

// PUT /api/config/claude-md  — save a CLAUDE.md file (user scope or project via filePath)
app.put('/api/config/claude-md', (req, res) => {
    const {
        filename,
        content,
        filePath: explicitPath
    } = req.body;
    if (typeof content !== 'string') return res.status(400).json({
        error: 'content required'
    });
    try {
        let targetPath;
        if (explicitPath) {
            // Project-level file: must be within home dir and end in .md
            const home = os.homedir();
            const resolved = path.resolve(explicitPath);
            if (!resolved.startsWith(home)) return res.status(400).json({
                error: 'path outside home'
            });
            if (!resolved.endsWith('.md')) return res.status(400).json({
                error: 'only .md files allowed'
            });
            targetPath = resolved;
        } else {
            if (!filename) return res.status(400).json({
                error: 'filename required'
            });
            const base = path.basename(filename);
            if (base !== filename) return res.status(400).json({
                error: 'invalid filename'
            });
            targetPath = path.join(CLAUDE_DIR, base);
        }
        safeWrite(targetPath, content);
        res.json({
            ok: true
        });
    } catch (e) {
        res.status(500).json({
            error: e.message
        });
    }
});

// DELETE /api/config/claude-md  — delete a CLAUDE.md file
app.delete('/api/config/claude-md', (req, res) => {
    const {
        filename,
        filePath: explicitPath
    } = req.body;
    try {
        let targetPath;
        if (explicitPath) {
            const home = os.homedir();
            const resolved = path.resolve(explicitPath);
            if (!resolved.startsWith(home)) return res.status(400).json({
                error: 'path outside home'
            });
            if (!resolved.endsWith('.md')) return res.status(400).json({
                error: 'only .md files allowed'
            });
            targetPath = resolved;
        } else {
            if (!filename) return res.status(400).json({
                error: 'filename required'
            });
            const base = path.basename(filename);
            if (base !== filename) return res.status(400).json({
                error: 'invalid filename'
            });
            targetPath = path.join(CLAUDE_DIR, base);
        }
        backupFile(targetPath);
        fs.unlinkSync(targetPath);
        res.json({
            ok: true
        });
    } catch (e) {
        res.status(500).json({
            error: e.message
        });
    }
});

// PUT /api/config/settings  — update settings.json (model, language, voiceEnabled)
app.put('/api/config/settings', (req, res) => {
    const settingsPath = path.join(CLAUDE_DIR, 'settings.json');
    try {
        const current = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        const {
            model,
            language,
            voiceEnabled,
            outputStyle,
            effortLevel,
            defaultMode,
            permissions
        } = req.body;
        if (model !== undefined) current.model = model;
        if (language !== undefined) current.language = language;
        if (voiceEnabled !== undefined) current.voiceEnabled = voiceEnabled;
        if (outputStyle !== undefined) current.outputStyle = outputStyle;
        if (effortLevel !== undefined) current.effortLevel = effortLevel;
        if (defaultMode !== undefined) current.defaultMode = defaultMode;
        if (permissions !== undefined) current.permissions = permissions;
        safeWrite(settingsPath, JSON.stringify(current, null, 2) + '\n');
        res.json({
            ok: true,
            settings: current
        });
    } catch (e) {
        res.status(500).json({
            error: e.message
        });
    }
});

// POST /api/config/hooks — add a new hook
app.post('/api/config/hooks', (req, res) => {
    try {
        const {
            event,
            matcher,
            type,
            command,
            url,
            prompt,
            scope = 'user',
            projectPath = ''
        } = req.body;
        if (!event || !type) return res.status(400).json({
            error: 'event and type required'
        });
        const hookEntry = {
            type
        };
        if (type === 'command') {
            if (!command) return res.status(400).json({
                error: 'command required'
            });
            hookEntry.command = command;
        } else if (type === 'http') {
            if (!url) return res.status(400).json({
                error: 'url required'
            });
            hookEntry.url = url;
        } else if (type === 'prompt' || type === 'agent') {
            if (!prompt) return res.status(400).json({
                error: 'prompt required'
            });
            hookEntry.prompt = prompt;
        }
        const current = readScope(scope, projectPath);
        if (!current.hooks) current.hooks = {};
        if (!current.hooks[event]) current.hooks[event] = [];
        const matcherEntry = {
            hooks: [hookEntry]
        };
        if (matcher) matcherEntry.matcher = matcher;
        current.hooks[event].push(matcherEntry);
        writeScope(scope, projectPath, current);
        res.json({
            ok: true,
            settings: readScope('user', ''),
            projectPath
        });
    } catch (e) {
        res.status(500).json({
            error: e.message
        });
    }
});

// DELETE /api/config/hooks — remove a hook by event+matcherIndex
app.delete('/api/config/hooks', (req, res) => {
    try {
        const {
            event,
            matcherIndex,
            scope = 'user',
            projectPath = ''
        } = req.body;
        const current = readScope(scope, projectPath);
        if (!current.hooks?.[event]) return res.status(404).json({
            error: 'hook not found'
        });
        current.hooks[event].splice(matcherIndex, 1);
        if (current.hooks[event].length === 0) delete current.hooks[event];
        if (Object.keys(current.hooks).length === 0) delete current.hooks;
        writeScope(scope, projectPath, current);
        res.json({
            ok: true,
            settings: readScope('user', '')
        });
    } catch (e) {
        res.status(500).json({
            error: e.message
        });
    }
});

// PATCH /api/config/hooks — update command/url/prompt of an existing hook
app.patch('/api/config/hooks', (req, res) => {
    try {
        const {
            event,
            matcherIndex,
            command,
            url,
            prompt,
            scope = 'user',
            projectPath = ''
        } = req.body;
        const current = readScope(scope, projectPath);
        const h = current.hooks?.[event]?.[matcherIndex]?.hooks?.[0];
        if (!h) return res.status(404).json({
            error: 'hook not found'
        });
        if (command !== undefined) h.command = command;
        if (url !== undefined) h.url = url;
        if (prompt !== undefined) h.prompt = prompt;
        writeScope(scope, projectPath, current);
        res.json({
            ok: true,
            settings: readScope('user', '')
        });
    } catch (e) {
        res.status(500).json({
            error: e.message
        });
    }
});

// POST /api/config/hooks/move — move a hook from one scope to another
app.post('/api/config/hooks/move', (req, res) => {
    try {
        const {
            fromScope,
            toScope,
            event,
            matcherIndex,
            projectPath = ''
        } = req.body;
        if (!fromScope || !toScope || !event) return res.status(400).json({
            error: 'fromScope, toScope, event required'
        });
        const src = readScope(fromScope, projectPath);
        const entry = src.hooks?.[event]?.[matcherIndex];
        if (!entry) return res.status(404).json({
            error: 'hook not found'
        });
        // Add to destination
        const dst = readScope(toScope, projectPath);
        if (!dst.hooks) dst.hooks = {};
        if (!dst.hooks[event]) dst.hooks[event] = [];
        dst.hooks[event].push(entry);
        writeScope(toScope, projectPath, dst);
        // Remove from source
        src.hooks[event].splice(matcherIndex, 1);
        if (src.hooks[event].length === 0) delete src.hooks[event];
        if (Object.keys(src.hooks).length === 0) delete src.hooks;
        writeScope(fromScope, projectPath, src);
        res.json({
            ok: true,
            settings: readScope('user', '')
        });
    } catch (e) {
        res.status(500).json({
            error: e.message
        });
    }
});

// POST /api/config/hooks/test — dry-run a hook with a synthetic event payload
app.post('/api/config/hooks/test', (req, res) => {
    const {
        type,
        command,
        url,
        event
    } = req.body;
    const PAYLOADS = {
        PreToolUse: {
            session_id: 'test-session',
            tool_name: 'Bash',
            tool_input: {
                command: 'echo hello'
            }
        },
        PostToolUse: {
            session_id: 'test-session',
            tool_name: 'Bash',
            tool_input: {
                command: 'echo hello'
            },
            tool_response: {
                output: 'hello\n'
            }
        },
        SessionStart: {
            session_id: 'test-session'
        },
        Stop: {
            session_id: 'test-session',
            num_turns: 3
        },
        UserPromptSubmit: {
            session_id: 'test-session',
            prompt: 'Hello Claude'
        },
        Notification: {
            session_id: 'test-session',
            message: 'Claude needs your attention'
        },
        CwdChanged: {
            session_id: 'test-session',
            previous_cwd: '/tmp',
            new_cwd: process.cwd()
        },
        FileChanged: {
            session_id: 'test-session',
            file_path: '/tmp/test.js',
            change_type: 'modified'
        },
    };
    const payload = JSON.stringify(PAYLOADS[event] || {
        session_id: 'test-session'
    });

    if (type === 'http') {
        const https = require('https'),
            http = require('http');
        try {
            const u = new URL(url);
            const lib = u.protocol === 'https:' ? https : http;
            const data = Buffer.from(payload);
            const start = Date.now();
            const req2 = lib.request({
                hostname: u.hostname,
                port: u.port || (u.protocol === 'https:' ? 443 : 80),
                path: u.pathname + u.search,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': data.length
                }
            }, (res2) => {
                let body = '';
                res2.on('data', d => body += d);
                res2.on('end', () => res.json({
                    exitCode: res2.statusCode,
                    stdout: body.slice(0, 2000),
                    stderr: '',
                    duration: Date.now() - start
                }));
            });
            req2.on('error', e => res.json({
                exitCode: -1,
                stdout: '',
                stderr: e.message,
                duration: 0
            }));
            req2.setTimeout(5000, () => {
                req2.destroy();
                res.json({
                    exitCode: -1,
                    stdout: '',
                    stderr: 'Timeout (5s)',
                    duration: 5000
                });
            });
            req2.write(data);
            req2.end();
        } catch (e) {
            res.json({
                exitCode: -1,
                stdout: '',
                stderr: e.message,
                duration: 0
            });
        }
        return;
    }

    const {
        spawn
    } = require('child_process');
    const start = Date.now();
    let stdout = '',
        stderr = '';
    const child = spawn('sh', ['-c', command], {
        timeout: 5000
    });
    child.stdin.write(payload);
    child.stdin.end();
    child.stdout.on('data', d => stdout += d.toString());
    child.stderr.on('data', d => stderr += d.toString());
    child.on('close', code => res.json({
        exitCode: code,
        stdout: stdout.slice(0, 2000),
        stderr: stderr.slice(0, 2000),
        duration: Date.now() - start
    }));
    child.on('error', e => res.json({
        exitCode: -1,
        stdout: '',
        stderr: e.message,
        duration: 0
    }));
});

// POST /api/config/hooks/toggle — move hook to/from _hiddenHooks
app.post('/api/config/hooks/toggle', (req, res) => {
    try {
        const {
            event,
            matcherIndex,
            scope = 'user',
            projectPath = ''
        } = req.body;
        const current = readScope(scope, projectPath);
        const hookEntry = current.hooks?.[event]?.[matcherIndex];
        if (!hookEntry) return res.status(404).json({
            error: 'hook not found'
        });
        if (!current._hiddenHooks) current._hiddenHooks = [];
        current._hiddenHooks.push({
            event,
            matcherEntry: hookEntry
        });
        current.hooks[event].splice(matcherIndex, 1);
        if (current.hooks[event].length === 0) delete current.hooks[event];
        if (Object.keys(current.hooks || {}).length === 0) delete current.hooks;
        writeScope(scope, projectPath, current);
        res.json({
            ok: true,
            settings: readScope('user', '')
        });
    } catch (e) {
        res.status(500).json({
            error: e.message
        });
    }
});

// POST /api/config/hooks/enable — restore a hook from _hiddenHooks
app.post('/api/config/hooks/enable', (req, res) => {
    try {
        const {
            hiddenIndex,
            scope = 'user',
            projectPath = ''
        } = req.body;
        const current = readScope(scope, projectPath);
        const entry = current._hiddenHooks?.[hiddenIndex];
        if (!entry) return res.status(404).json({
            error: 'hidden hook not found'
        });
        if (!current.hooks) current.hooks = {};
        if (!current.hooks[entry.event]) current.hooks[entry.event] = [];
        current.hooks[entry.event].push(entry.matcherEntry);
        current._hiddenHooks.splice(hiddenIndex, 1);
        if (current._hiddenHooks.length === 0) delete current._hiddenHooks;
        writeScope(scope, projectPath, current);
        res.json({
            ok: true,
            settings: readScope('user', '')
        });
    } catch (e) {
        res.status(500).json({
            error: e.message
        });
    }
});

// ─── Guardrail Dashboard ──────────────────────────────────────────────────────

const GUARDRAIL_TAG = 'claude-home-guardrail';

// Preset guardrail definitions
const GUARDRAIL_PRESETS = {
    'destructive-commands': {
        label: 'Block destructive commands',
        description: 'Blocks rm -rf, git push --force, git reset --hard, DROP TABLE, sudo',
        event: 'PreToolUse',
        matcher: 'Bash',
        command: `# ${GUARDRAIL_TAG}:destructive-commands\nINPUT=$(cat); echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); cmd=d.get('tool_input',{}).get('command',''); import re; bad=bool(re.search(r'rm\\s+-rf|git\\s+push\\s+--force|git\\s+reset\\s+--hard|DROP\\s+TABLE|sudo\\s', cmd, re.I)); print(json.dumps({'decision':'block','reason':'Destructive command blocked by guardrail'}) if bad else json.dumps({'decision':'allow'}))" 2>/dev/null || echo '{"decision":"allow"}'`,
    },
    'sensitive-files': {
        label: 'Block writes to sensitive files',
        description: 'Blocks writes to .env, .pem, .key, credentials files',
        event: 'PreToolUse',
        matcher: 'Write',
        command: `# ${GUARDRAIL_TAG}:sensitive-files\nINPUT=$(cat); echo "$INPUT" | python3 -c "import sys,json,re; d=json.load(sys.stdin); fp=d.get('tool_input',{}).get('file_path',''); bad=bool(re.search(r'\\.(env|pem|key|credentials|secret)$', fp, re.I)); print(json.dumps({'decision':'block','reason':'Write to sensitive file blocked'}) if bad else json.dumps({'decision':'allow'}))" 2>/dev/null || echo '{"decision":"allow"}'`,
    },
    'no-force-push': {
        label: 'Block force push',
        description: 'Prevents git push --force and git push -f',
        event: 'PreToolUse',
        matcher: 'Bash',
        command: `# ${GUARDRAIL_TAG}:no-force-push\nINPUT=$(cat); echo "$INPUT" | python3 -c "import sys,json,re; d=json.load(sys.stdin); cmd=d.get('tool_input',{}).get('command',''); bad=bool(re.search(r'git\\s+push\\s+(.*--force|-f\\b)', cmd, re.I)); print(json.dumps({'decision':'block','reason':'Force push blocked by guardrail'}) if bad else json.dumps({'decision':'allow'}))" 2>/dev/null || echo '{"decision":"allow"}'`,
    },
};

// GET /api/guardrails — list active guardrails (PreToolUse hooks tagged as guardrails)
app.get('/api/guardrails', (req, res) => {
    const {
        scope = 'user', projectPath = ''
    } = req.query;
    const settings = readScope(scope, projectPath);
    const hooks = settings.hooks?.PreToolUse || [];
    const guardrails = [];
    for (let i = 0; i < hooks.length; i++) {
        const h = hooks[i];
        const cmd = h.hooks?.[0]?.command || '';
        const tagMatch = cmd.match(new RegExp(`# ${GUARDRAIL_TAG}:([\\w-]+)`));
        if (tagMatch) {
            const presetId = tagMatch[1];
            const preset = GUARDRAIL_PRESETS[presetId] || {
                label: presetId,
                description: ''
            };
            guardrails.push({
                presetId,
                label: preset.label,
                description: preset.description,
                matcherIndex: i,
                matcher: h.matcher
            });
        }
    }
    // Check hidden hooks too
    const hidden = settings._hiddenHooks || [];
    const hiddenGuardrails = [];
    for (let i = 0; i < hidden.length; i++) {
        const h = hidden[i];
        if (h.event !== 'PreToolUse') continue;
        const cmd = h.matcherEntry?.hooks?.[0]?.command || '';
        const tagMatch = cmd.match(new RegExp(`# ${GUARDRAIL_TAG}:([\\w-]+)`));
        if (tagMatch) hiddenGuardrails.push({
            presetId: tagMatch[1],
            hiddenIndex: i
        });
    }
    res.json({
        guardrails,
        hiddenGuardrails,
        presets: Object.entries(GUARDRAIL_PRESETS).map(([id, p]) => ({
            id,
            label: p.label,
            description: p.description
        }))
    });
});

// POST /api/guardrails — install a preset guardrail as a PreToolUse hook
app.post('/api/guardrails', (req, res) => {
    try {
        const {
            presetId,
            scope = 'user',
            projectPath = ''
        } = req.body;
        const preset = GUARDRAIL_PRESETS[presetId];
        if (!preset) return res.status(400).json({
            error: 'Unknown guardrail preset: ' + presetId
        });
        const current = readScope(scope, projectPath);
        if (!current.hooks) current.hooks = {};
        if (!current.hooks[preset.event]) current.hooks[preset.event] = [];
        // Avoid duplicates
        const exists = current.hooks[preset.event].some(h => (h.hooks?.[0]?.command || '').includes(`${GUARDRAIL_TAG}:${presetId}`));
        if (exists) return res.json({
            ok: true,
            alreadyInstalled: true
        });
        current.hooks[preset.event].push({
            matcher: preset.matcher,
            hooks: [{
                type: 'command',
                command: preset.command
            }]
        });
        writeScope(scope, projectPath, current);
        res.json({
            ok: true
        });
    } catch (e) {
        res.status(500).json({
            error: e.message
        });
    }
});

// DELETE /api/guardrails — remove a guardrail by presetId
app.delete('/api/guardrails', (req, res) => {
    try {
        const {
            presetId,
            scope = 'user',
            projectPath = ''
        } = req.body;
        const current = readScope(scope, projectPath);
        if (!current.hooks?.PreToolUse) return res.json({
            ok: true
        });
        current.hooks.PreToolUse = current.hooks.PreToolUse.filter(h => !(h.hooks?.[0]?.command || '').includes(`${GUARDRAIL_TAG}:${presetId}`));
        if (current.hooks.PreToolUse.length === 0) delete current.hooks.PreToolUse;
        if (Object.keys(current.hooks || {}).length === 0) delete current.hooks;
        writeScope(scope, projectPath, current);
        res.json({
            ok: true
        });
    } catch (e) {
        res.status(500).json({
            error: e.message
        });
    }
});

// GET /api/hooks/log — aggregate hook_progress entries across all sessions
app.get('/api/hooks/log', async (req, res) => {
    const filterCwd = req.query.projectPath || '';
    const stats = {}; // key: hookName → { hookEvent, hookName, count, lastFired, sessions: Set }

    const dirs = getProjectDirs();
    for (const dirName of dirs) {
        const dir = path.join(PROJECTS_DIR, dirName);
        let files;
        try {
            files = fs.readdirSync(dir).filter(f => f.endsWith('.jsonl'));
        } catch {
            continue;
        }

        for (const fname of files) {
            const fpath = path.join(dir, fname);
            let rl;
            try {
                rl = readline.createInterface({
                    input: fs.createReadStream(fpath),
                    crlfDelay: Infinity
                });
            } catch {
                continue;
            }

            for await (const line of rl) {
                if (!line.trim()) continue;
                try {
                    const obj = JSON.parse(line);
                    if (obj.type !== 'progress') continue;
                    const d = obj.data;
                    if (!d || d.type !== 'hook_progress') continue;
                    if (filterCwd && obj.cwd !== filterCwd) continue;

                    const key = d.hookName || d.hookEvent;
                    if (!stats[key]) stats[key] = {
                        hookEvent: d.hookEvent,
                        hookName: d.hookName,
                        count: 0,
                        lastFired: null,
                        sessions: new Set()
                    };
                    stats[key].count++;
                    if (!stats[key].lastFired || obj.timestamp > stats[key].lastFired) stats[key].lastFired = obj.timestamp;
                    if (obj.sessionId) stats[key].sessions.add(obj.sessionId);
                } catch {}
            }
        }
    }

    const result = Object.values(stats)
        .map(s => ({
            hookEvent: s.hookEvent,
            hookName: s.hookName,
            count: s.count,
            lastFired: s.lastFired,
            sessionCount: s.sessions.size
        }))
        .sort((a, b) => b.count - a.count);

    res.json(result);
});

// PUT /api/memory/:project/:filename  — update existing memory file
app.put('/api/memory/:project/:filename', (req, res) => {
    const {
        content
    } = req.body;
    if (typeof content !== 'string') return res.status(400).json({
        error: 'content required'
    });
    const filePath = path.join(PROJECTS_DIR, req.params.project, 'memory', req.params.filename);
    if (!filePath.startsWith(PROJECTS_DIR)) return res.status(400).json({
        error: 'invalid path'
    });
    try {
        safeWrite(filePath, content);
        res.json({
            ok: true
        });
    } catch (e) {
        res.status(500).json({
            error: e.message
        });
    }
});

// POST /api/memory/:project  — create new memory file
app.post('/api/memory/:project', (req, res) => {
    const {
        filename,
        content
    } = req.body;
    if (!filename || typeof content !== 'string') return res.status(400).json({
        error: 'filename and content required'
    });
    const base = path.basename(filename);
    const filePath = path.join(PROJECTS_DIR, req.params.project, 'memory', base);
    if (!filePath.startsWith(PROJECTS_DIR)) return res.status(400).json({
        error: 'invalid path'
    });
    if (fs.existsSync(filePath)) return res.status(409).json({
        error: 'file already exists'
    });
    try {
        safeWrite(filePath, content);
        res.json({
            ok: true,
            filename: base
        });
    } catch (e) {
        res.status(500).json({
            error: e.message
        });
    }
});

// DELETE /api/memory/:project/:filename  — delete memory file
app.delete('/api/memory/:project/:filename', (req, res) => {
    const filePath = path.join(PROJECTS_DIR, req.params.project, 'memory', req.params.filename);
    if (!filePath.startsWith(PROJECTS_DIR)) return res.status(400).json({
        error: 'invalid path'
    });
    try {
        if (!fs.existsSync(filePath)) return res.status(404).json({
            error: 'not found'
        });
        backupFile(filePath);
        fs.unlinkSync(filePath);
        res.json({
            ok: true
        });
    } catch (e) {
        res.status(500).json({
            error: e.message
        });
    }
});

// POST /api/sessions/:project/:sessionId/send — send a prompt to an idle session
app.post('/api/sessions/:project/:sessionId/send', async (req, res) => {
    const {
        project,
        sessionId
    } = req.params;
    const {
        message
    } = req.body;
    if (!message || typeof message !== 'string') return res.status(400).json({
        error: 'message required'
    });

    const projectPath = await getProjectPath(project);
    if (!projectPath) return res.status(404).json({
        error: 'Project not found'
    });

    const {
        spawn
    } = require('child_process');
    try {
        const child = spawn('claude', ['--resume', sessionId, message], {
            cwd: projectPath,
            detached: true,
            stdio: 'ignore',
        });
        child.unref();
        res.json({
            ok: true,
            pid: child.pid
        });
    } catch (e) {
        res.status(500).json({
            error: e.message
        });
    }
});

// POST /api/sessions/:project/:sessionId/rollback — git revert/reset to a session commit
app.post('/api/sessions/:project/:sessionId/rollback', async (req, res) => {
    const {
        project,
        sessionId
    } = req.params;
    const {
        commitHash,
        mode = 'revert'
    } = req.body;
    if (!commitHash) return res.status(400).json({
        error: 'commitHash required'
    });

    const projectPath = await getProjectPath(project);
    if (!projectPath) return res.status(404).json({
        error: 'Project not found'
    });

    const {
        exec
    } = require('child_process');
    const run = (cmd) => new Promise((resolve, reject) => {
        exec(cmd, {
            cwd: projectPath,
            timeout: 15000
        }, (err, stdout, stderr) => {
            if (err) reject(new Error(stderr || err.message));
            else resolve(stdout.trim());
        });
    });

    try {
        // Check for uncommitted changes first
        const status = await run('git status --porcelain');
        if (status) return res.status(409).json({
            error: 'Uncommitted changes detected. Commit or stash them first.',
            status
        });

        let output;
        if (mode === 'revert') {
            output = await run(`git revert --no-edit ${commitHash}`);
        } else if (mode === 'reset-soft') {
            output = await run(`git reset --soft ${commitHash}^`);
        } else {
            return res.status(400).json({
                error: 'mode must be revert or reset-soft'
            });
        }
        res.json({
            ok: true,
            output
        });
    } catch (e) {
        res.status(500).json({
            error: e.message
        });
    }
});

// DELETE /api/sessions/:project/:sessionId
app.delete('/api/sessions/:project/:sessionId', (req, res) => {
    const {
        project,
        sessionId
    } = req.params;
    if (!project || !sessionId) return res.status(400).json({
        error: 'missing params'
    });
    const projectDir = path.join(PROJECTS_DIR, project);
    const jsonlPath = path.join(projectDir, `${sessionId}.jsonl`);
    if (!jsonlPath.startsWith(PROJECTS_DIR)) return res.status(400).json({
        error: 'invalid path'
    });
    try {
        // Remove .jsonl
        if (fs.existsSync(jsonlPath)) fs.unlinkSync(jsonlPath);
        // Remove subagents dir if present
        const subDir = path.join(projectDir, sessionId);
        if (fs.existsSync(subDir)) fs.rmSync(subDir, {
            recursive: true,
            force: true
        });
        // Clean up bookmarks
        try {
            writeBookmarks(readBookmarks().filter(b => b.sessionId !== sessionId));
        } catch {}
        // Update sessions-index.json
        const indexPath = path.join(projectDir, 'sessions-index.json');
        try {
            const idx = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
            idx.entries = (idx.entries || []).filter(e => e.sessionId !== sessionId);
            fs.writeFileSync(indexPath, JSON.stringify(idx, null, 2), 'utf8');
        } catch {}
        // Invalidate cache
        indexCache.delete(project);
        res.json({
            ok: true
        });
    } catch (e) {
        res.status(500).json({
            error: e.message
        });
    }
});

// PUT /api/plans/:filename
app.put('/api/plans/:filename', (req, res) => {
    const filename = path.basename(req.params.filename);
    if (!filename.endsWith('.md')) return res.status(400).json({
        error: 'invalid filename'
    });
    const filePath = path.join(CLAUDE_DIR, 'plans', filename);
    if (!filePath.startsWith(CLAUDE_DIR)) return res.status(400).json({
        error: 'invalid path'
    });
    const {
        content
    } = req.body;
    if (typeof content !== 'string') return res.status(400).json({
        error: 'content required'
    });
    try {
        fs.writeFileSync(filePath, content, 'utf8');
        const stat = fs.statSync(filePath);
        const titleMatch = content.match(/^#\s+(.+)$/m);
        const title = titleMatch ? titleMatch[1].replace(/^Plan:\s*/i, '').trim() : filename.replace('.md', '');
        res.json({
            filename,
            title,
            content,
            modified: new Date(stat.mtimeMs).toISOString(),
            size: stat.size
        });
    } catch (e) {
        res.status(500).json({
            error: e.message
        });
    }
});

// DELETE /api/plans/:filename
app.delete('/api/plans/:filename', (req, res) => {
    const filename = path.basename(req.params.filename);
    if (!filename.endsWith('.md')) return res.status(400).json({
        error: 'invalid filename'
    });
    const filePath = path.join(CLAUDE_DIR, 'plans', filename);
    if (!filePath.startsWith(CLAUDE_DIR)) return res.status(400).json({
        error: 'invalid path'
    });
    try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        res.json({
            ok: true
        });
    } catch (e) {
        res.status(500).json({
            error: e.message
        });
    }
});

// GET /api/sessions/:project/:sessionId/export — return session as markdown
app.get('/api/sessions/:project/:sessionId/export', async (req, res) => {
    const {
        project,
        sessionId
    } = req.params;
    const filePath = path.join(PROJECTS_DIR, project, `${sessionId}.jsonl`);
    if (!filePath.startsWith(PROJECTS_DIR)) return res.status(400).json({
        error: 'invalid path'
    });
    try {
        const messages = await parseJsonl(filePath);
        const lines = [`# Session ${sessionId}`, `**Project:** ${project}`, ''];
        for (const m of messages) {
            if (m.type === 'user') {
                const text = typeof m.message?.content === 'string' ?
                    m.message.content :
                    (m.message?.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
                if (text.trim()) lines.push(`## Human\n\n${text.trim()}`, '');
            } else if (m.type === 'assistant') {
                const text = typeof m.message?.content === 'string' ?
                    m.message.content :
                    (m.message?.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
                if (text.trim()) lines.push(`## Claude\n\n${text.trim()}`, '');
            }
        }
        const md = lines.join('\n');
        res.setHeader('Content-Type', 'text/markdown');
        res.setHeader('Content-Disposition', `attachment; filename="${sessionId}.md"`);
        res.send(md);
    } catch (e) {
        res.status(500).json({
            error: e.message
        });
    }
});

// POST /api/sessions/:project/:sessionId/snapshot — create a note with session summary
app.post('/api/sessions/:project/:sessionId/snapshot', async (req, res) => {
    const {
        project,
        sessionId
    } = req.params;
    const filePath = path.join(PROJECTS_DIR, project, `${sessionId}.jsonl`);
    if (!filePath.startsWith(PROJECTS_DIR)) return res.status(400).json({
        error: 'invalid path'
    });
    try {
        const messages = await parseJsonl(filePath);
        if (!messages.length) return res.status(404).json({
            error: 'session not found or empty'
        });

        // Extract metadata
        const first = messages[0];
        const branch = first.gitBranch || '';
        const date = first.timestamp ? first.timestamp.slice(0, 10) : new Date().toISOString().slice(0, 10);

        // Extract user prompts (skip <command-name> tool messages)
        const prompts = [];
        // Track last tool per file (Write wins over Edit)
        const fileToolMap = new Map(); // filePath → 'Write'|'Edit'
        for (const m of messages) {
            if (m.type === 'user') {
                const c = m.message?.content;
                let text = '';
                if (typeof c === 'string') text = c;
                else if (Array.isArray(c)) {
                    text = c.filter(b => b.type === 'text' && !b.text?.includes('<command-name>')).map(b => b.text).join('\n');
                }
                text = text.trim();
                if (text && text.length > 2) prompts.push(text);
            } else if (m.type === 'assistant') {
                const content = m.message?.content;
                if (!Array.isArray(content)) continue;
                for (const block of content) {
                    if (block.type !== 'tool_use') continue;
                    if ((block.name === 'Edit' || block.name === 'Write') && block.input?.file_path) {
                        fileToolMap.set(block.input.file_path, block.name);
                    }
                }
            }
        }

        const firstPrompt = prompts[0] || sessionId;
        const title = `Snapshot: ${firstPrompt.slice(0, 60)}${firstPrompt.length > 60 ? '…' : ''}`;

        const projectLabel = project.replace(/^-Users-[^-]+-/, '').replace(/-/g, '/');
        const meta = [`**Project:** ${projectLabel}`, branch ? `**Branch:** ${branch}` : '', `**Date:** ${date}`, `**Session:** ${sessionId.slice(0, 8)}…`].filter(Boolean).join(' · ');

        const promptList = prompts.map((p, i) => `${i + 1}. ${p.replace(/\n+/g, ' ').slice(0, 200)}${p.length > 200 ? '…' : ''}`).join('\n');

        const fileLines = [...fileToolMap.entries()]
            .map(([fp, tool]) => `- \`${fp}\`${tool === 'Write' ? ' *(created)*' : ''}`)
            .join('\n');
        const filesSection = fileToolMap.size > 0 ? `\n\n## Files changed\n\n${fileLines}` : '';

        const content = `${meta}\n\n## Prompts\n\n${promptList}${filesSection}\n\n## Notes\n\n`;

        ensureNotesDir();
        const slug = firstPrompt.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'snapshot';
        const datePrefix = date;
        let filename = `${datePrefix}-snapshot-${slug}.md`;
        let i = 1;
        while (fs.existsSync(path.join(NOTES_DIR, filename))) {
            filename = `${datePrefix}-snapshot-${slug}-${i++}.md`;
        }
        const tagsLine = `\ntags: [snapshot]`;
        const sessionLine = `\nsession: ${sessionId}`;
        const raw = `---\ntitle: ${title}\ndate: ${new Date().toISOString()}${sessionLine}${tagsLine}\n---\n\n${content}`;
        fs.writeFileSync(path.join(NOTES_DIR, filename), raw, 'utf8');
        res.json(parseNoteFile(filename));
    } catch (e) {
        res.status(500).json({
            error: e.message
        });
    }
});

// ─── App settings (claude-home specific, not Claude's settings.json) ─────────
const APP_SETTINGS_FILE = path.join(DATA_DIR, 'app-settings.json');

function readAppSettings() {
    try {
        return JSON.parse(fs.readFileSync(APP_SETTINGS_FILE, 'utf8'));
    } catch {
        return {};
    }
}

app.get('/api/app-settings', (req, res) => {
    const s = readAppSettings();
    const masked = s.githubToken ? s.githubToken.slice(0, 4) + '…' + s.githubToken.slice(-4) : '';
    res.json({
        githubTokenSet: !!s.githubToken,
        githubTokenMasked: masked,
        budgetMonthly: s.budgetMonthly || 0,
        budgetPerSession: s.budgetPerSession || 0,
        tokenLimitPerSession: s.tokenLimitPerSession || 0,
        contextAlertPct: s.contextAlertPct || 85,
        autoPauseOnBudget: s.autoPauseOnBudget || false,
    });
});

app.put('/api/app-settings', (req, res) => {
    try {
        const current = readAppSettings();
        const {
            githubToken,
            budgetMonthly,
            budgetPerSession,
            tokenLimitPerSession,
            contextAlertPct,
            autoPauseOnBudget
        } = req.body;
        if (githubToken !== undefined) current.githubToken = githubToken;
        if (budgetMonthly !== undefined) current.budgetMonthly = Number(budgetMonthly) || 0;
        if (budgetPerSession !== undefined) current.budgetPerSession = Number(budgetPerSession) || 0;
        if (tokenLimitPerSession !== undefined) current.tokenLimitPerSession = Number(tokenLimitPerSession) || 0;
        if (contextAlertPct !== undefined) current.contextAlertPct = Number(contextAlertPct) || 85;
        if (autoPauseOnBudget !== undefined) current.autoPauseOnBudget = !!autoPauseOnBudget;
        ensureDataDir();
        fs.writeFileSync(APP_SETTINGS_FILE, JSON.stringify(current, null, 2), 'utf8');
        res.json({
            ok: true
        });
    } catch (e) {
        res.status(500).json({
            error: e.message
        });
    }
});

// ─── Gist sharing ─────────────────────────────────────────────────────────────
function postGist(token, description, filename, content) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify({
            description,
            public: true,
            files: {
                [filename]: {
                    content
                }
            }
        });
        const opts = {
            hostname: 'api.github.com',
            path: '/gists',
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'User-Agent': 'claude-home',
                'Accept': 'application/vnd.github+json',
                'Content-Length': Buffer.byteLength(body),
            },
        };
        const req = https.request(opts, res => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (json.html_url) resolve(json.html_url);
                    else {
                        const msg = json.message || 'GitHub API error';
                        const hint = (msg === 'Not Found' || msg === 'Bad credentials') ?
                            `${msg} — check your token has the "gist" scope` :
                            msg;
                        reject(new Error(hint));
                    }
                } catch {
                    reject(new Error('Invalid response from GitHub'));
                }
            });
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

app.post('/api/share/session/:project/:sessionId', async (req, res) => {
    const {
        githubToken
    } = readAppSettings();
    if (!githubToken) return res.status(400).json({
        error: 'GitHub token not configured. Add it in Settings → Sharing.'
    });
    const {
        project,
        sessionId
    } = req.params;
    const filePath = path.join(PROJECTS_DIR, project, `${sessionId}.jsonl`);
    if (!filePath.startsWith(PROJECTS_DIR)) return res.status(400).json({
        error: 'invalid path'
    });
    try {
        const messages = await parseJsonl(filePath);
        const lines = [`# Session ${sessionId}`, `**Project:** ${project}`, ''];
        for (const m of messages) {
            if (m.type === 'user') {
                const text = typeof m.message?.content === 'string' ? m.message.content :
                    (m.message?.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
                if (text.trim()) lines.push(`## Human\n\n${text.trim()}`, '');
            } else if (m.type === 'assistant') {
                const text = typeof m.message?.content === 'string' ? m.message.content :
                    (m.message?.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
                if (text.trim()) lines.push(`## Claude\n\n${text.trim()}`, '');
            }
        }
        const url = await postGist(githubToken, `Claude session — ${project}`, `${sessionId}.md`, lines.join('\n'));
        res.json({
            url
        });
    } catch (e) {
        res.status(500).json({
            error: e.message
        });
    }
});

app.post('/api/share/note/*', async (req, res) => {
    const {
        githubToken
    } = readAppSettings();
    if (!githubToken) return res.status(400).json({
        error: 'GitHub token not configured. Add it in Settings → Sharing.'
    });
    const notepath = req.params[0];
    if (!notepath || !notepath.endsWith('.md')) return res.status(400).json({
        error: 'invalid filename'
    });
    const filePath = path.join(NOTES_DIR, notepath);
    if (!filePath.startsWith(NOTES_DIR)) return res.status(400).json({
        error: 'invalid path'
    });
    try {
        const note = parseNoteFile(notepath);
        const content = `# ${note.title}\n\n${note.content}`;
        const filename = path.basename(notepath);
        const url = await postGist(githubToken, `Note — ${note.title}`, filename, content);
        res.json({
            url
        });
    } catch (e) {
        res.status(500).json({
            error: e.message
        });
    }
});

app.post('/api/share/plan/:filename', async (req, res) => {
    const {
        githubToken
    } = readAppSettings();
    if (!githubToken) return res.status(400).json({
        error: 'GitHub token not configured. Add it in Settings → Sharing.'
    });
    const filename = path.basename(req.params.filename);
    if (!filename.endsWith('.md')) return res.status(400).json({
        error: 'invalid filename'
    });
    const filePath = path.join(CLAUDE_DIR, 'plans', filename);
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const titleMatch = content.match(/^#\s+(.+)$/m);
        const description = titleMatch ? titleMatch[1].trim() : filename;
        const url = await postGist(githubToken, `Claude plan — ${description}`, filename, content);
        res.json({
            url
        });
    } catch (e) {
        res.status(500).json({
            error: e.message
        });
    }
});

// ─── Personal Notes ───────────────────────────────────────────────────────────
const NOTES_DIR = path.join(DATA_DIR, 'notes');

function ensureNotesDir() {
    if (!fs.existsSync(NOTES_DIR)) fs.mkdirSync(NOTES_DIR, {
        recursive: true
    });
}

function parseNoteFile(notepath) {
    const filePath = path.join(NOTES_DIR, notepath);
    const stat = fs.statSync(filePath);
    const raw = fs.readFileSync(filePath, 'utf8');
    const {
        meta,
        content: body
    } = parseFrontmatter(raw);
    const tags = Array.isArray(meta.tags) ? meta.tags : (meta.tags ? [meta.tags] : []);
    const parts = notepath.replace(/\\/g, '/').split('/');
    const filename = parts[parts.length - 1];
    const folder = parts.slice(0, -1).join('/');
    return {
        filename,
        path: notepath,
        folder,
        title: meta.title || filename.replace('.md', ''),
        date: meta.date || stat.mtimeMs,
        session: meta.session || '',
        tags,
        pinned: meta.pinned === true || meta.pinned === 'true',
        content: body.trim(),
        modified: new Date(stat.mtimeMs).toISOString(),
    };
}

function scanNotes(dir, base) {
    if (dir === undefined) dir = NOTES_DIR;
    if (base === undefined) base = '';
    const results = [];
    try {
        for (const entry of fs.readdirSync(dir)) {
            const fullPath = path.join(dir, entry);
            const relPath = base ? `${base}/${entry}` : entry;
            if (fs.statSync(fullPath).isDirectory()) {
                results.push(...scanNotes(fullPath, relPath));
            } else if (entry.endsWith('.md')) {
                results.push(parseNoteFile(relPath));
            }
        }
    } catch (e) {
        /* ignore unreadable dirs */ }
    return results;
}

function notesClaudeMdSnippet() {
    const d = CLAUDE_DIR_DISPLAY;
    return `
## Personal Notes

When the user asks you to "save a note", "add to notes", "guarda esto como nota", or similar:
1. Create a markdown file in \`${d}/claude-home/notes/\` with this exact format:
   - Filename: \`YYYY-MM-DD-short-slug.md\` (e.g. \`2026-03-31-bug-fix-auth.md\`)
   - Content:
     \`\`\`
     ---
     title: <descriptive title>
     date: <current ISO date>
     session: <run: ls -t ${d}/projects/$(pwd | sed 's|/|-|g' | sed 's|^-||')/*.jsonl 2>/dev/null | head -1 | xargs basename 2>/dev/null | sed 's/\\.jsonl//'>
     ---

     <the content the user wants to save>
     \`\`\`
2. **Folder**: Save in a subfolder when appropriate:
   - Project-specific note → \`${d}/claude-home/notes/<basename-of-pwd>/\` (e.g. working in \`mono-genially\` → folder \`mono-genially\`)
   - Global/cross-project note → root \`${d}/claude-home/notes/\`
   - User-specified folder → use that folder name
3. **Note linking**: If the note references concepts in other notes, use \`#slug\` syntax (\`2026-03-31-my-slug.md\` → \`#my-slug\`). Glob \`${d}/claude-home/notes/**/*.md\` to discover existing slugs.
4. Use the Write tool to create the file (not Bash).
5. Confirm with: "Saved to Notes: http://localhost:3141/#/note/<folder/filename or filename>"

The notes directory may not exist yet — the app creates it automatically on first load.

## Daily TODOs (Today view)

When the user asks to add a task "for today", "for tomorrow", "to review later", or similar:
1. Determine the target date (today = current date, tomorrow = current date + 1 day)
2. Read the existing file if it exists: \`${d}/claude-home/todos/YYYY-MM-DD.json\`
3. Use the Write tool to save the updated file with this format:
   \`\`\`json
   {
     "date": "YYYY-MM-DD",
     "context": "",
     "tasks": [
       {
         "id": "<random 8 char alphanumeric>",
         "text": "<task description>",
         "done": false,
         "carriedOver": false,
         "createdAt": "<current ISO date>"
       }
     ]
   }
   \`\`\`
4. Confirm with: "Added to Today: http://localhost:3141 (Today section)"

The todos directory may not exist yet — the app creates it automatically on first load.
`;
}

app.get('/api/notes/claude-md-status', (req, res) => {
    const claudeMdPath = path.join(CLAUDE_DIR, 'CLAUDE.md');
    try {
        const content = fs.existsSync(claudeMdPath) ? fs.readFileSync(claudeMdPath, 'utf8') : '';
        res.json({
            installed: content.includes('Personal Notes')
        });
    } catch (e) {
        res.status(500).json({
            error: e.message
        });
    }
});

app.post('/api/notes/setup-claude', (req, res) => {
    const claudeMdPath = path.join(CLAUDE_DIR, 'CLAUDE.md');
    const settingsPath = CLAUDE_SETTINGS_PATH;
    try {
        const current = fs.existsSync(claudeMdPath) ? fs.readFileSync(claudeMdPath, 'utf8') : '';
        if (current.includes('Personal Notes')) return res.json({
            ok: true,
            alreadyInstalled: true
        });
        // Append CLAUDE.md snippet
        fs.writeFileSync(claudeMdPath, current + '\n' + notesClaudeMdSnippet(), 'utf8');
        // Add Write permission for notes dir to settings.json
        try {
            const settings = fs.existsSync(settingsPath) ? JSON.parse(fs.readFileSync(settingsPath, 'utf8')) : {};
            if (!settings.permissions) settings.permissions = {};
            if (!settings.permissions.allow) settings.permissions.allow = [];
            const rules = CLAUDE_HOME_PERMISSIONS;
            let changed = false;
            for (const rule of rules) {
                if (!settings.permissions.allow.includes(rule)) {
                    settings.permissions.allow.push(rule);
                    changed = true;
                }
            }
            if (changed) fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf8');
        } catch {}
        res.json({
            ok: true
        });
    } catch (e) {
        res.status(500).json({
            error: e.message
        });
    }
});

app.get('/api/notes/folders', (req, res) => {
    ensureNotesDir();
    try {
        const folders = fs.readdirSync(NOTES_DIR).filter(e => fs.statSync(path.join(NOTES_DIR, e)).isDirectory());
        res.json(folders.sort());
    } catch (e) {
        res.status(500).json({
            error: e.message
        });
    }
});

app.post('/api/notes/folders', (req, res) => {
    ensureNotesDir();
    const {
        name
    } = req.body;
    if (!name) return res.status(400).json({
        error: 'name required'
    });
    const safeName = name.trim().replace(/[^a-zA-Z0-9_-]/g, '-').replace(/^-+|-+$/g, '').slice(0, 50);
    if (!safeName) return res.status(400).json({
        error: 'invalid name'
    });
    const folderPath = path.join(NOTES_DIR, safeName);
    if (!folderPath.startsWith(NOTES_DIR)) return res.status(400).json({
        error: 'invalid name'
    });
    try {
        if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, {
            recursive: true
        });
        res.json({
            name: safeName
        });
    } catch (e) {
        res.status(500).json({
            error: e.message
        });
    }
});

app.patch('/api/notes/folders/:name/rename', (req, res) => {
    ensureNotesDir();
    const {
        name
    } = req.params;
    const {
        newName
    } = req.body;
    if (!name || !newName) return res.status(400).json({
        error: 'name and newName required'
    });
    const safeName = newName.trim().replace(/[^a-zA-Z0-9_-]/g, '-').replace(/^-+|-+$/g, '').slice(0, 50);
    if (!safeName) return res.status(400).json({
        error: 'invalid newName'
    });
    const srcPath = path.join(NOTES_DIR, name);
    const destPath = path.join(NOTES_DIR, safeName);
    if (!srcPath.startsWith(NOTES_DIR) || !destPath.startsWith(NOTES_DIR)) return res.status(400).json({
        error: 'invalid path'
    });
    try {
        if (!fs.existsSync(srcPath)) return res.status(404).json({
            error: 'folder not found'
        });
        if (fs.existsSync(destPath)) return res.status(409).json({
            error: 'folder already exists'
        });
        fs.renameSync(srcPath, destPath);
        res.json({
            name: safeName
        });
    } catch (e) {
        res.status(500).json({
            error: e.message
        });
    }
});

app.delete('/api/notes/folders/:name', (req, res) => {
    ensureNotesDir();
    const {
        name
    } = req.params;
    const {
        action
    } = req.query; // 'delete' | 'orphan'
    if (!name) return res.status(400).json({
        error: 'name required'
    });
    if (!['delete', 'orphan'].includes(action)) return res.status(400).json({
        error: 'action must be delete or orphan'
    });
    const folderPath = path.join(NOTES_DIR, name);
    if (!folderPath.startsWith(NOTES_DIR + path.sep) && folderPath !== NOTES_DIR) return res.status(400).json({
        error: 'invalid name'
    });
    try {
        if (!fs.existsSync(folderPath)) return res.status(404).json({
            error: 'folder not found'
        });
        const files = fs.readdirSync(folderPath).filter(f => f.endsWith('.md'));
        if (action === 'orphan') {
            for (const f of files) {
                let dest = path.join(NOTES_DIR, f);
                if (fs.existsSync(dest)) dest = path.join(NOTES_DIR, f.slice(0, -3) + '-orphaned.md');
                fs.renameSync(path.join(folderPath, f), dest);
            }
        } else {
            for (const f of files) fs.unlinkSync(path.join(folderPath, f));
        }
        try {
            fs.rmdirSync(folderPath);
        } catch {}
        res.json({
            ok: true,
            action,
            count: files.length
        });
    } catch (e) {
        res.status(500).json({
            error: e.message
        });
    }
});

function rewriteNoteTags(notepath, updatedTags) {
    const filePath = path.join(NOTES_DIR, notepath);
    const existing = parseNoteFile(notepath);
    const sessionLine = existing.session ? `\nsession: ${existing.session}` : '';
    const tagsLine = updatedTags.length > 0 ? `\ntags: [${updatedTags.join(', ')}]` : '';
    const pinnedLine = existing.pinned ? `\npinned: true` : '';
    const raw = `---\ntitle: ${existing.title}\ndate: ${existing.date}${sessionLine}${tagsLine}${pinnedLine}\n---\n\n${existing.content}`;
    fs.writeFileSync(filePath, raw, 'utf8');
}

app.patch('/api/notes/tags/:name/rename', (req, res) => {
    const {
        name
    } = req.params;
    const {
        newName
    } = req.body;
    if (!name || !newName) return res.status(400).json({
        error: 'name and newName required'
    });
    const safe = newName.trim().replace(/[^a-zA-Z0-9_-]/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
    if (!safe) return res.status(400).json({
        error: 'invalid newName'
    });
    ensureNotesDir();
    try {
        const affected = scanNotes().filter(n => (n.tags || []).includes(name));
        for (const n of affected) {
            const tags = n.tags.map(t => t === name ? safe : t);
            rewriteNoteTags(n.path, tags);
        }
        res.json({
            renamed: name,
            to: safe,
            count: affected.length
        });
    } catch (e) {
        res.status(500).json({
            error: e.message
        });
    }
});

app.delete('/api/notes/tags/:name', (req, res) => {
    const {
        name
    } = req.params;
    if (!name) return res.status(400).json({
        error: 'name required'
    });
    ensureNotesDir();
    try {
        const affected = scanNotes().filter(n => (n.tags || []).includes(name));
        for (const n of affected) {
            const tags = n.tags.filter(t => t !== name);
            rewriteNoteTags(n.path, tags);
        }
        res.json({
            deleted: name,
            count: affected.length
        });
    } catch (e) {
        res.status(500).json({
            error: e.message
        });
    }
});

app.get('/api/notes', (req, res) => {
    ensureNotesDir();
    try {
        const notes = scanNotes().sort((a, b) => b.modified.localeCompare(a.modified));
        res.json(notes);
    } catch (e) {
        res.status(500).json({
            error: e.message
        });
    }
});

app.post('/api/notes', (req, res) => {
    ensureNotesDir();
    const {
        title,
        content,
        session,
        tags,
        folder
    } = req.body;
    if (!title) return res.status(400).json({
        error: 'title required'
    });
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'note';
    const date = new Date().toISOString();
    const datePrefix = date.slice(0, 10);
    const safeFolder = folder ? folder.trim().replace(/[^a-zA-Z0-9_/-]/g, '-').replace(/^\/+|\/+$/g, '') : '';
    const noteDir = safeFolder ? path.join(NOTES_DIR, safeFolder) : NOTES_DIR;
    if (!noteDir.startsWith(NOTES_DIR)) return res.status(400).json({
        error: 'invalid folder'
    });
    if (!fs.existsSync(noteDir)) fs.mkdirSync(noteDir, {
        recursive: true
    });
    let filename = `${datePrefix}-${slug}.md`;
    let i = 1;
    while (fs.existsSync(path.join(noteDir, filename))) {
        filename = `${datePrefix}-${slug}-${i++}.md`;
    }
    const notepath = safeFolder ? `${safeFolder}/${filename}` : filename;
    const sessionLine = session ? `\nsession: ${session}` : '';
    const tagsArr = Array.isArray(tags) ? tags.filter(Boolean) : [];
    const tagsLine = tagsArr.length > 0 ? `\ntags: [${tagsArr.join(', ')}]` : '';
    const raw = `---\ntitle: ${title}\ndate: ${date}${sessionLine}${tagsLine}\n---\n\n${content || ''}`;
    fs.writeFileSync(path.join(NOTES_DIR, notepath), raw, 'utf8');
    res.json(parseNoteFile(notepath));
});

app.patch('/api/notes/*/move', (req, res) => {
    const notepath = req.params[0];
    if (!notepath || !notepath.endsWith('.md')) return res.status(400).json({
        error: 'invalid filename'
    });
    const srcPath = path.join(NOTES_DIR, notepath);
    if (!srcPath.startsWith(NOTES_DIR)) return res.status(400).json({
        error: 'invalid path'
    });
    const {
        folder
    } = req.body;
    const filename = path.basename(notepath);
    const destDir = folder ? path.join(NOTES_DIR, folder) : NOTES_DIR;
    const destPath = path.join(destDir, filename);
    if (!destPath.startsWith(NOTES_DIR)) return res.status(400).json({
        error: 'invalid destination'
    });
    try {
        if (!fs.existsSync(srcPath)) return res.status(404).json({
            error: 'note not found'
        });
        if (destPath === srcPath) return res.json(parseNoteFile(notepath));
        if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, {
            recursive: true
        });
        fs.renameSync(srcPath, destPath);
        const newRelPath = folder ? `${folder}/${filename}` : filename;
        res.json(parseNoteFile(newRelPath));
    } catch (e) {
        res.status(500).json({
            error: e.message
        });
    }
});

app.patch('/api/notes/*/rename', (req, res) => {
    const notepath = req.params[0];
    if (!notepath || !notepath.endsWith('.md')) return res.status(400).json({
        error: 'invalid filename'
    });
    const srcPath = path.join(NOTES_DIR, notepath);
    if (!srcPath.startsWith(NOTES_DIR)) return res.status(400).json({
        error: 'invalid path'
    });
    const {
        newFilename
    } = req.body;
    if (!newFilename || !newFilename.endsWith('.md') || newFilename.includes('/') || newFilename.includes('\\'))
        return res.status(400).json({
            error: 'newFilename must end in .md and contain no slashes'
        });
    const folder = path.dirname(notepath);
    const destRelPath = folder === '.' ? newFilename : `${folder}/${newFilename}`;
    const destPath = path.join(NOTES_DIR, destRelPath);
    if (!destPath.startsWith(NOTES_DIR)) return res.status(400).json({
        error: 'invalid destination'
    });
    try {
        if (!fs.existsSync(srcPath)) return res.status(404).json({
            error: 'note not found'
        });
        if (destPath === srcPath) return res.json(parseNoteFile(notepath));
        if (fs.existsSync(destPath)) return res.status(409).json({
            error: 'A file with that name already exists'
        });
        fs.renameSync(srcPath, destPath);
        res.json(parseNoteFile(destRelPath));
    } catch (e) {
        res.status(500).json({
            error: e.message
        });
    }
});

app.put('/api/notes/*', (req, res) => {
    const notepath = req.params[0];
    if (!notepath || !notepath.endsWith('.md')) return res.status(400).json({
        error: 'invalid filename'
    });
    const filePath = path.join(NOTES_DIR, notepath);
    if (!filePath.startsWith(NOTES_DIR)) return res.status(400).json({
        error: 'invalid path'
    });
    const {
        title,
        content,
        tags,
        pinned
    } = req.body;
    try {
        const existing = parseNoteFile(notepath);
        const resolvedTags = Array.isArray(tags) ? tags : existing.tags;
        const resolvedPinned = pinned !== undefined ? pinned : existing.pinned;
        const sessionLine = existing.session ? `\nsession: ${existing.session}` : '';
        const tagsLine = resolvedTags.length > 0 ? `\ntags: [${resolvedTags.join(', ')}]` : '';
        const pinnedLine = resolvedPinned ? `\npinned: true` : '';
        const raw = `---\ntitle: ${title || existing.title}\ndate: ${existing.date}${sessionLine}${tagsLine}${pinnedLine}\n---\n\n${content ?? existing.content}`;
        fs.writeFileSync(filePath, raw, 'utf8');
        res.json(parseNoteFile(notepath));
    } catch (e) {
        res.status(500).json({
            error: e.message
        });
    }
});

app.delete('/api/notes/*', (req, res) => {
    const notepath = req.params[0];
    if (!notepath || !notepath.endsWith('.md')) return res.status(400).json({
        error: 'invalid filename'
    });
    const filePath = path.join(NOTES_DIR, notepath);
    if (!filePath.startsWith(NOTES_DIR)) return res.status(400).json({
        error: 'invalid path'
    });
    try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        res.json({
            ok: true
        });
    } catch (e) {
        res.status(500).json({
            error: e.message
        });
    }
});

// ─── Today / Daily TODOs ──────────────────────────────────────────────────────
const TODOS_DIR = path.join(DATA_DIR, 'todos');

function ensureTodosDir() {
    if (!fs.existsSync(TODOS_DIR)) fs.mkdirSync(TODOS_DIR, {
        recursive: true
    });
}

function todayStr() {
    return new Date().toISOString().slice(0, 10);
}

function readTodosFile(dateStr) {
    const filePath = path.join(TODOS_DIR, `${dateStr}.json`);
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
        return null;
    }
}

function writeTodosFile(dateStr, data) {
    ensureTodosDir();
    fs.writeFileSync(path.join(TODOS_DIR, `${dateStr}.json`), JSON.stringify(data, null, 2), 'utf8');
}

app.get('/api/today', (req, res) => {
    ensureTodosDir();
    const today = todayStr();
    let data = readTodosFile(today) || {
        date: today,
        context: '',
        tasks: []
    };

    // Collect undone tasks from ALL previous days not already present in today's file.
    // We track the LATEST state of each task across all previous files (oldest→newest),
    // so a task completed on day-2 (done:true) is not re-carried from day-1 (done:false).
    const existingIds = new Set(data.tasks.map(t => t.id));
    const prevFiles = fs.readdirSync(TODOS_DIR)
        .filter(f => f.endsWith('.json') && f.slice(0, 10) < today)
        .sort(); // oldest first
    const taskMap = new Map(); // id → latest task state
    for (const f of prevFiles) {
        const prev = readTodosFile(f.slice(0, 10));
        if (!prev?.tasks) continue;
        for (const t of prev.tasks) taskMap.set(t.id, t); // overwrite with newer version
    }
    const toCarry = [];
    for (const [id, t] of taskMap) {
        if (!existingIds.has(id) && !t.done && !t.postponed) {
            toCarry.push({
                ...t,
                carriedOver: true,
                done: false
            });
        }
    }

    // Remove tasks already in today's file that were actually completed in a previous day
    // (can happen if they were incorrectly carried before this fix)
    const staleIds = new Set(
        data.tasks
        .filter(t => t.carriedOver && !t.done && taskMap.get(t.id)?.done)
        .map(t => t.id)
    );

    const dirty = toCarry.length > 0 || staleIds.size > 0;
    if (staleIds.size > 0) data.tasks = data.tasks.filter(t => !staleIds.has(t.id));
    if (toCarry.length > 0) data.tasks = [...toCarry, ...data.tasks];
    if (dirty) writeTodosFile(today, data);

    res.json(data);
});

app.put('/api/today', (req, res) => {
    const today = todayStr();
    const {
        context,
        tasks
    } = req.body;
    const current = readTodosFile(today) || {
        date: today,
        context: '',
        tasks: []
    };
    if (context !== undefined) current.context = context;
    if (tasks !== undefined) current.tasks = tasks;
    writeTodosFile(today, current);
    res.json(current);
});

app.post('/api/today/postpone', (req, res) => {
    const {
        taskId,
        targetDate
    } = req.body;
    if (!taskId || !targetDate) return res.status(400).json({
        error: 'taskId and targetDate required'
    });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) return res.status(400).json({
        error: 'invalid date'
    });
    const today = todayStr();
    if (targetDate <= today) return res.status(400).json({
        error: 'targetDate must be in the future'
    });
    const current = readTodosFile(today) || {
        date: today,
        context: '',
        tasks: []
    };
    const taskIdx = current.tasks.findIndex(t => t.id === taskId);
    if (taskIdx === -1) return res.status(404).json({
        error: 'task not found'
    });
    const [task] = current.tasks.splice(taskIdx, 1);
    writeTodosFile(today, current);
    // Mark as postponed in all previous day files so carry-over logic skips it
    const allPrev = fs.readdirSync(TODOS_DIR)
        .filter(f => f.endsWith('.json') && f.slice(0, 10) < today);
    for (const f of allPrev) {
        const d = readTodosFile(f.slice(0, 10));
        if (!d?.tasks) continue;
        const idx = d.tasks.findIndex(t => t.id === taskId);
        if (idx !== -1) {
            d.tasks[idx].postponed = true;
            writeTodosFile(f.slice(0, 10), d);
        }
    }
    // Add to target date
    const target = readTodosFile(targetDate) || {
        date: targetDate,
        context: '',
        tasks: []
    };
    if (!target.tasks.find(t => t.id === task.id)) {
        const {
            postponed: _,
            ...cleanTask
        } = task;
        target.tasks.push({
            ...cleanTask,
            carriedOver: true,
            done: false,
            postponed: false,
            postponeCount: (task.postponeCount || 0) + 1
        });
        writeTodosFile(targetDate, target);
    }
    res.json({
        ok: true
    });
});

app.get('/api/today/upcoming', (req, res) => {
    ensureTodosDir();
    const today = todayStr();
    const result = [];
    for (let i = 1; i <= 7; i++) {
        const d = new Date();
        d.setDate(d.getDate() + i);
        const dateStr = d.toISOString().slice(0, 10);
        const data = readTodosFile(dateStr);
        const tasks = (data?.tasks || []).filter(t => !t.done);
        if (tasks.length > 0) result.push({
            date: dateStr,
            tasks
        });
    }
    res.json(result);
});

app.post('/api/today/pull', (req, res) => {
    const {
        taskId,
        fromDate
    } = req.body;
    if (!taskId || !fromDate) return res.status(400).json({
        error: 'taskId and fromDate required'
    });
    const today = todayStr();
    const source = readTodosFile(fromDate);
    if (!source?.tasks) return res.status(404).json({
        error: 'source not found'
    });
    const idx = source.tasks.findIndex(t => t.id === taskId);
    if (idx === -1) return res.status(404).json({
        error: 'task not found'
    });
    const [task] = source.tasks.splice(idx, 1);
    writeTodosFile(fromDate, source);
    const current = readTodosFile(today) || {
        date: today,
        context: '',
        tasks: []
    };
    if (!current.tasks.find(t => t.id === taskId)) {
        current.tasks.push({
            ...task,
            carriedOver: false,
            done: false,
            postponed: false
        });
        writeTodosFile(today, current);
    }
    res.json({
        ok: true
    });
});

// ─── URL to Markdown ─────────────────────────────────────────────────────────
const WEBMD_DIR = path.join(DATA_DIR, 'webmd');

function ensureWebmdDir() {
    if (!fs.existsSync(WEBMD_DIR)) fs.mkdirSync(WEBMD_DIR, {
        recursive: true
    });
}

function slugify(url) {
    return url.replace(/^https?:\/\//, '').replace(/[^a-z0-9]/gi, '-').toLowerCase().slice(0, 60) +
        '-' + Date.now();
}

app.post('/api/webmd/fetch', async (req, res) => {
    try {
        const {
            url
        } = req.body;
        if (!url || !/^https?:\/\//i.test(url)) return res.status(400).json({
            error: 'URL inválida'
        });
        const jinaUrl = 'https://r.jina.ai/' + url;
        const raw = await fetchRemote(jinaUrl);
        if (raw.length > 500_000) return res.status(413).json({
            error: 'Página demasiado grande (>500KB)'
        });
        // Extract title from first markdown heading or URL
        const titleMatch = raw.match(/^#\s+(.+)$/m);
        const title = titleMatch ? titleMatch[1].trim() : url;
        res.json({
            title,
            markdown: raw
        });
    } catch (e) {
        res.status(500).json({
            error: e.message
        });
    }
});

app.get('/api/webmd', (req, res) => {
    ensureWebmdDir();
    try {
        const files = fs.readdirSync(WEBMD_DIR).filter(f => f.endsWith('.json')).sort().reverse();
        const items = files.map(f => {
            try {
                return JSON.parse(fs.readFileSync(path.join(WEBMD_DIR, f), 'utf8'));
            } catch {
                return null;
            }
        }).filter(Boolean);
        res.json(items);
    } catch (e) {
        res.status(500).json({
            error: e.message
        });
    }
});

app.post('/api/webmd/save', (req, res) => {
    ensureWebmdDir();
    try {
        const {
            url,
            title,
            markdown
        } = req.body;
        if (!url || !markdown) return res.status(400).json({
            error: 'url y markdown requeridos'
        });
        const slug = slugify(url);
        const entry = {
            slug,
            url,
            title: title || url,
            markdown,
            savedAt: new Date().toISOString()
        };
        fs.writeFileSync(path.join(WEBMD_DIR, `${slug}.json`), JSON.stringify(entry, null, 2), 'utf8');
        res.json(entry);
    } catch (e) {
        res.status(500).json({
            error: e.message
        });
    }
});

app.delete('/api/webmd/:slug', (req, res) => {
    try {
        const slug = req.params.slug.replace(/[^a-z0-9-]/gi, '');
        const filePath = path.join(WEBMD_DIR, `${slug}.json`);
        if (!filePath.startsWith(WEBMD_DIR + path.sep)) return res.status(400).json({
            error: 'Invalid slug'
        });
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        res.json({
            ok: true
        });
    } catch (e) {
        res.status(500).json({
            error: e.message
        });
    }
});

// ─── Start ────────────────────────────────────────────────────────────────────

function startServer(port) {
    const p = port || PORT;
    return app.listen(p, () => {
        console.log(`claude-home running at http://localhost:${p}`);
    });
}

// ─── Session Templates ────────────────────────────────────────────────────────
const TEMPLATES_FILE = path.join(DATA_DIR, 'templates.json');

function readTemplates() {
    try {
        return JSON.parse(fs.readFileSync(TEMPLATES_FILE, 'utf8'));
    } catch {
        return [];
    }
}

function writeTemplates(list) {
    ensureDataDir();
    fs.writeFileSync(TEMPLATES_FILE, JSON.stringify(list, null, 2), 'utf8');
}

app.get('/api/templates', (req, res) => {
    res.json(readTemplates());
});

app.post('/api/templates', (req, res) => {
    try {
        const {
            name,
            description,
            content
        } = req.body || {};
        if (!name?.trim()) return res.status(400).json({
            error: 'name required'
        });
        const list = readTemplates();
        const id = Math.random().toString(36).slice(2, 10);
        const t = {
            id,
            name: name.trim(),
            description: (description || '').trim(),
            content: content || '',
            createdAt: new Date().toISOString()
        };
        list.push(t);
        writeTemplates(list);
        res.json(t);
    } catch (e) {
        res.status(500).json({
            error: e.message
        });
    }
});

app.put('/api/templates/:id', (req, res) => {
    try {
        const list = readTemplates();
        const idx = list.findIndex(t => t.id === req.params.id);
        if (idx === -1) return res.status(404).json({
            error: 'not found'
        });
        const {
            name,
            description,
            content
        } = req.body || {};
        if (name !== undefined) list[idx].name = name.trim();
        if (description !== undefined) list[idx].description = description.trim();
        if (content !== undefined) list[idx].content = content;
        writeTemplates(list);
        res.json(list[idx]);
    } catch (e) {
        res.status(500).json({
            error: e.message
        });
    }
});

app.delete('/api/templates/:id', (req, res) => {
    try {
        const list = readTemplates().filter(t => t.id !== req.params.id);
        writeTemplates(list);
        res.json({
            ok: true
        });
    } catch (e) {
        res.status(500).json({
            error: e.message
        });
    }
});

// ─── Bookmarks ───────────────────────────────────────────────────────────────
const BOOKMARKS_FILE = path.join(DATA_DIR, 'bookmarks.json');

function readBookmarks() {
    try {
        return JSON.parse(fs.readFileSync(BOOKMARKS_FILE, 'utf8'));
    } catch {
        return [];
    }
}

function writeBookmarks(list) {
    fs.writeFileSync(BOOKMARKS_FILE, JSON.stringify(list, null, 2), 'utf8');
}

// GET /api/bookmarks — all bookmarks (optionally enriched)
app.get('/api/bookmarks', (req, res) => {
    res.json(readBookmarks());
});

// GET /api/sessions/:project/:sessionId/bookmarks
app.get('/api/sessions/:project/:sessionId/bookmarks', (req, res) => {
    const {
        sessionId
    } = req.params;
    res.json(readBookmarks().filter(b => b.sessionId === sessionId));
});

// POST /api/sessions/:project/:sessionId/bookmarks
app.post('/api/sessions/:project/:sessionId/bookmarks', (req, res) => {
    const {
        project,
        sessionId
    } = req.params;
    const {
        messageUuid,
        messageTimestamp,
        label
    } = req.body;
    if (!messageUuid) return res.status(400).json({
        error: 'messageUuid required'
    });
    const list = readBookmarks();
    // Prevent duplicates
    if (list.find(b => b.sessionId === sessionId && b.messageUuid === messageUuid))
        return res.status(409).json({
            error: 'already bookmarked'
        });
    const bookmark = {
        id: Math.random().toString(36).slice(2, 10),
        sessionId,
        projectDir: project,
        messageUuid,
        messageTimestamp: messageTimestamp || null,
        label: label || '',
        createdAt: new Date().toISOString(),
    };
    list.push(bookmark);
    writeBookmarks(list);
    res.json(bookmark);
});

// DELETE /api/sessions/:project/:sessionId/bookmarks/:bookmarkId
app.delete('/api/sessions/:project/:sessionId/bookmarks/:bookmarkId', (req, res) => {
    const {
        sessionId,
        bookmarkId
    } = req.params;
    const list = readBookmarks();
    const next = list.filter(b => !(b.sessionId === sessionId && b.id === bookmarkId));
    if (next.length === list.length) return res.status(404).json({
        error: 'not found'
    });
    writeBookmarks(next);
    res.json({
        ok: true
    });
});

// PATCH /api/sessions/:project/:sessionId/bookmarks/:bookmarkId
app.patch('/api/sessions/:project/:sessionId/bookmarks/:bookmarkId', (req, res) => {
    const {
        sessionId,
        bookmarkId
    } = req.params;
    const list = readBookmarks();
    const bm = list.find(b => b.sessionId === sessionId && b.id === bookmarkId);
    if (!bm) return res.status(404).json({
        error: 'not found'
    });
    if (req.body.label !== undefined) bm.label = req.body.label;
    writeBookmarks(list);
    res.json(bm);
});

// ─── Agents marketplace ───────────────────────────────────────────────────────

const AGENTS_MARKETPLACE_PATH = path.join(DATA_DIR, 'agents-marketplace.json');
const COMMANDS_MARKETPLACE_PATH = path.join(DATA_DIR, 'commands-marketplace.json');
const toolMarketplaceCache = new Map(); // key → { items, fetchedAt }

function ensureMarketplaceConfig(filePath) {
    if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, JSON.stringify({
        sources: []
    }, null, 2));
}
ensureMarketplaceConfig(AGENTS_MARKETPLACE_PATH);
ensureMarketplaceConfig(COMMANDS_MARKETPLACE_PATH);

function getToolMarketplaceSources(filePath) {
    try {
        const s = JSON.parse(fs.readFileSync(filePath, 'utf8')).sources || [];
        return s.map(src => ({
            ...src,
            token: src.token || (src.tokenEnv ? process.env[src.tokenEnv] || '' : '')
        }));
    } catch {
        return [];
    }
}

// Discover flat .md files in a GitHub repo dir (agents/ or commands/)
async function discoverSourceToolItems(source, itemsPath) {
    const {
        owner,
        repo,
        branch,
        token
    } = source;
    if (!owner || !repo) return [];
    const url = `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch || 'main'}?recursive=1`;
    const raw = await fetchRemote(url, token);
    const tree = JSON.parse(raw).tree || [];
    const prefix = itemsPath ? itemsPath + '/' : '';
    return tree
        .filter(item => item.path.startsWith(prefix) && item.path.endsWith('.md') && !item.path.slice(prefix.length).includes('/'))
        .map(item => ({
            slug: item.path.slice(prefix.length).replace(/\.md$/, ''),
            treePath: item.path
        }));
}

async function fetchToolItemContent(source, treePath) {
    const {
        owner,
        repo,
        branch,
        token
    } = source;
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${treePath}?ref=${branch || 'main'}`;
    const raw = await fetchRemote(url, token);
    const json = JSON.parse(raw);
    return Buffer.from(json.content, 'base64').toString('utf8');
}

// Scan local plugin marketplace dirs for .md files in a given subdir
function getPluginToolItems(subdir) {
    const marketplacesDir = path.join(CLAUDE_DIR, 'plugins', 'marketplaces');
    const items = [];
    try {
        for (const mkt of fs.readdirSync(marketplacesDir)) {
            for (const pluginGroup of ['plugins', 'external_plugins']) {
                const pluginsDir = path.join(marketplacesDir, mkt, pluginGroup);
                try {
                    for (const plugin of fs.readdirSync(pluginsDir)) {
                        const itemsDir = path.join(pluginsDir, plugin, subdir);
                        try {
                            for (const f of fs.readdirSync(itemsDir).filter(f => f.endsWith('.md'))) {
                                const raw = fs.readFileSync(path.join(itemsDir, f), 'utf8');
                                const {
                                    meta,
                                    content
                                } = parseFrontmatter(raw);
                                const slug = f.replace(/\.md$/, '');
                                items.push({
                                    slug,
                                    name: meta.name || slug,
                                    description: meta.description || '',
                                    content,
                                    _source: `${mkt}`,
                                    _plugin: plugin,
                                    _sourceName: `${plugin} (${mkt})`,
                                    _localPath: path.join(itemsDir, f),
                                });
                            }
                        } catch {}
                    }
                } catch {}
            }
        }
    } catch {}
    return items;
}

function makeToolMarketplaceRoutes(prefix, configPath, itemsPathKey, localSubdir) {
    // GET sources
    app.get(`/api/${prefix}/sources`, (req, res) => {
        const s = getToolMarketplaceSources(configPath)
            .map(({
                id,
                name,
                owner,
                repo,
                branch,
                itemsPath
            }) => ({
                id,
                name,
                owner,
                repo,
                branch,
                itemsPath
            }));
        res.json(s);
    });

    // POST sources
    app.post(`/api/${prefix}/sources`, (req, res) => {
        const {
            name,
            owner,
            repo,
            branch,
            itemsPath,
            token,
            tokenEnv
        } = req.body || {};
        if (!name || !owner || !repo) return res.status(400).json({
            error: 'name, owner y repo son requeridos'
        });
        ensureMarketplaceConfig(configPath);
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        const id = owner.toLowerCase() + '-' + repo.toLowerCase().replace(/[^a-z0-9]/g, '-');
        if (config.sources.some(s => s.id === id)) return res.status(409).json({
            error: 'La fuente ya existe'
        });
        config.sources.push({
            id,
            name,
            owner,
            repo,
            branch: branch || 'main',
            itemsPath: itemsPath || localSubdir,
            token: token || '',
            tokenEnv: tokenEnv || ''
        });
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        toolMarketplaceCache.delete(prefix + ':' + id);
        res.json({
            id
        });
    });

    // DELETE sources/:id
    app.delete(`/api/${prefix}/sources/:id`, (req, res) => {
        const {
            id
        } = req.params;
        ensureMarketplaceConfig(configPath);
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        const idx = config.sources.findIndex(s => s.id === id);
        if (idx === -1) return res.status(404).json({
            error: 'Fuente no encontrada'
        });
        config.sources.splice(idx, 1);
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        toolMarketplaceCache.delete(prefix + ':' + id);
        res.json({
            ok: true
        });
    });

    // GET registry — plugin dirs + custom GitHub sources
    app.get(`/api/${prefix}/registry`, async (req, res) => {
        const pluginItems = getPluginToolItems(localSubdir);
        const sources = getToolMarketplaceSources(configPath).filter(s => s.owner && s.repo);
        const now = Date.now();
        const sourceResults = await Promise.allSettled(sources.map(async source => {
            const cacheKey = prefix + ':' + source.id;
            const cached = toolMarketplaceCache.get(cacheKey);
            if (cached && (now - cached.fetchedAt) < MARKETPLACE_TTL) return cached.items;
            const entries = await discoverSourceToolItems(source, source.itemsPath || localSubdir);
            const items = await Promise.all(entries.map(async ({
                slug,
                treePath
            }) => {
                try {
                    const raw = await fetchToolItemContent(source, treePath);
                    const {
                        meta,
                        content
                    } = parseFrontmatter(raw);
                    return {
                        slug,
                        name: meta.name || slug,
                        description: meta.description || '',
                        content,
                        _source: source.id,
                        _sourceName: source.name
                    };
                } catch {
                    return {
                        slug,
                        name: slug,
                        description: '',
                        content: '',
                        _source: source.id,
                        _sourceName: source.name
                    };
                }
            }));
            toolMarketplaceCache.set(cacheKey, {
                items,
                fetchedAt: now
            });
            return items;
        }));
        const githubItems = sourceResults.filter(r => r.status === 'fulfilled').flatMap(r => r.value);
        const errors = sourceResults.filter(r => r.status === 'rejected').map((r, i) => `${sources[i]?.name}: ${r.reason?.message}`);
        const all = [...pluginItems, ...githubItems].sort((a, b) => a.name.localeCompare(b.name));
        res.json({
            items: all,
            errors
        });
    });

    // POST install — copy to local dir
    app.post(`/api/${prefix}/install`, (req, res) => {
        const {
            slug,
            name,
            description,
            content,
            scope,
            projectPath
        } = req.body || {};
        if (!slug || !/^[a-zA-Z0-9_-]+$/.test(slug)) return res.status(400).json({
            error: 'slug inválido'
        });
        if (!content || content.length > 200_000) return res.status(400).json({
            error: 'Contenido inválido o demasiado grande'
        });
        let baseDir;
        if (scope === 'project') {
            if (!projectPath) return res.status(400).json({
                error: 'projectPath requerido'
            });
            const pp = path.resolve(projectPath);
            if (!pp.startsWith(os.homedir())) return res.status(403).json({
                error: 'Forbidden'
            });
            baseDir = path.join(pp, '.claude', localSubdir);
        } else {
            baseDir = path.join(CLAUDE_DIR, localSubdir);
        }
        const dest = path.join(baseDir, slug + '.md');
        if (fs.existsSync(dest)) return res.status(409).json({
            error: `"${slug}" ya está instalado`
        });
        try {
            fs.mkdirSync(baseDir, {
                recursive: true
            });
            const fm = `---\nname: ${name || slug}\ndescription: ${description || ''}\n---\n\n${content}`;
            fs.writeFileSync(dest, fm, 'utf8');
            res.json({
                ok: true
            });
        } catch (e) {
            res.status(500).json({
                error: e.message
            });
        }
    });

    // GET check-installed
    app.get(`/api/${prefix}/check-installed`, (req, res) => {
        const {
            slugs,
            projectPath
        } = req.query;
        if (!slugs) return res.json({});
        const dirs = [path.join(CLAUDE_DIR, localSubdir)];
        if (projectPath) dirs.push(path.join(path.resolve(projectPath), '.claude', localSubdir));
        const result = {};
        for (const slug of slugs.split(',')) {
            result[slug] = dirs.some(d => fs.existsSync(path.join(d, slug + '.md')));
        }
        res.json(result);
    });
}

makeToolMarketplaceRoutes('agents-marketplace', AGENTS_MARKETPLACE_PATH, 'agentsPath', 'agents');
makeToolMarketplaceRoutes('commands-marketplace', COMMANDS_MARKETPLACE_PATH, 'commandsPath', 'commands');

// ─── Plugin management ────────────────────────────────────────────────────────

const {
    execSync,
    execFileSync
} = require('child_process');

// GET /api/plugins — list plugins (installed always, query: available=true includes marketplace)
app.get('/api/plugins', (req, res) => {
    try {
        const args = req.query.available === 'true' ?
            ['plugin', 'list', '--available', '--json'] :
            ['plugin', 'list', '--json'];
        const out = execFileSync('claude', args, {
            timeout: 30000
        }).toString();
        const parsed = JSON.parse(out);
        // Normalize: CLI may return array (installed only) or {installed, available}
        if (Array.isArray(parsed)) {
            res.json({
                installed: parsed,
                available: []
            });
        } else {
            res.json({
                installed: parsed.installed || [],
                available: parsed.available || []
            });
        }
    } catch (e) {
        res.status(500).json({
            error: e.message
        });
    }
});

// GET /api/plugins/detail — README + manifest + component counts from local marketplace cache
app.get('/api/plugins/detail', (req, res) => {
    const {
        pluginId
    } = req.query;
    if (!pluginId) return res.status(400).json({
        error: 'pluginId requerido'
    });

    // pluginId format: name@marketplace  (e.g. code-review@claude-plugins-official)
    const atIdx = pluginId.lastIndexOf('@');
    const name = atIdx >= 0 ? pluginId.slice(0, atIdx) : pluginId;
    const marketplace = atIdx >= 0 ? pluginId.slice(atIdx + 1) : null;

    const pluginsBase = path.join(CLAUDE_DIR, 'plugins', 'marketplaces');
    const candidates = [];

    if (marketplace) {
        candidates.push(
            path.join(pluginsBase, marketplace, 'plugins', name),
            path.join(pluginsBase, marketplace, 'external_plugins', name),
        );
    }
    // Also search all marketplaces
    try {
        for (const mkt of fs.readdirSync(pluginsBase)) {
            candidates.push(
                path.join(pluginsBase, mkt, 'plugins', name),
                path.join(pluginsBase, mkt, 'external_plugins', name),
            );
        }
    } catch {}

    // Also check install cache from installed_plugins.json
    try {
        const installedJson = path.join(CLAUDE_DIR, 'plugins', 'installed_plugins.json');
        if (fs.existsSync(installedJson)) {
            const installed = JSON.parse(fs.readFileSync(installedJson, 'utf8'));
            const entries = installed.plugins?.[pluginId] || [];
            if (entries.length > 0 && entries[0].installPath) {
                candidates.unshift(entries[0].installPath);
            }
        }
    } catch {}

    let pluginDir = null;
    for (const c of candidates) {
        if (fs.existsSync(c)) {
            pluginDir = c;
            break;
        }
    }

    if (!pluginDir) return res.json({
        readme: null,
        manifest: null,
        components: null
    });

    // Read README
    let readme = null;
    for (const f of ['README.md', 'readme.md', 'Readme.md']) {
        const p = path.join(pluginDir, f);
        if (fs.existsSync(p)) {
            readme = fs.readFileSync(p, 'utf8');
            break;
        }
    }

    // Read manifest
    let manifest = null;
    try {
        const mPath = path.join(pluginDir, '.claude-plugin', 'plugin.json');
        if (fs.existsSync(mPath)) manifest = JSON.parse(fs.readFileSync(mPath, 'utf8'));
    } catch {}

    // Count components
    const countDir = (dir) => {
        try {
            return fs.readdirSync(dir).filter(f => !f.startsWith('.')).length;
        } catch {
            return 0;
        }
    };
    const components = {
        commands: countDir(path.join(pluginDir, 'commands')),
        agents: countDir(path.join(pluginDir, 'agents')),
        skills: countDir(path.join(pluginDir, 'skills')),
        hooks: (() => {
            try {
                return fs.existsSync(path.join(pluginDir, 'hooks', 'hooks.json')) ? 1 : 0;
            } catch {
                return 0;
            }
        })(),
        mcp: (() => {
            try {
                return fs.existsSync(path.join(pluginDir, '.mcp.json')) ? 1 : 0;
            } catch {
                return 0;
            }
        })(),
    };

    res.json({
        readme,
        manifest,
        components
    });
});

// GET /api/plugins/items — list skills/agents/commands from a plugin's cache
app.get('/api/plugins/items', (req, res) => {
    const {
        pluginId
    } = req.query;
    if (!pluginId) return res.status(400).json({
        error: 'pluginId requerido'
    });

    const atIdx = pluginId.lastIndexOf('@');
    const pName = atIdx >= 0 ? pluginId.slice(0, atIdx) : pluginId;
    const marketplace = atIdx >= 0 ? pluginId.slice(atIdx + 1) : null;

    const cacheBase = path.join(CLAUDE_DIR, 'plugins', 'cache');
    let pluginDir = null;

    // Find from versioned cache: cache/<marketplace>/<plugin>/<latest-version>
    const mktDirs = marketplace ? [marketplace] : (() => {
        try {
            return fs.readdirSync(cacheBase);
        } catch {
            return [];
        }
    })();
    for (const mkt of mktDirs) {
        const cacheDir = path.join(cacheBase, mkt, pName);
        try {
            const versions = fs.readdirSync(cacheDir).filter(v => {
                try {
                    return fs.statSync(path.join(cacheDir, v)).isDirectory();
                } catch {
                    return false;
                }
            });
            if (versions.length > 0) {
                versions.sort((a, b) => b.localeCompare(a, undefined, {
                    numeric: true
                }));
                pluginDir = path.join(cacheDir, versions[0]);
                break;
            }
        } catch {}
    }

    if (!pluginDir) return res.json({
        skills: [],
        agents: [],
        commands: []
    });

    const result = {
        skills: [],
        agents: [],
        commands: []
    };

    // Skills: dirs with SKILL.md
    try {
        const skillsDir = path.join(pluginDir, 'skills');
        fs.readdirSync(skillsDir).filter(f => {
            try {
                return fs.statSync(path.join(skillsDir, f)).isDirectory();
            } catch {
                return false;
            }
        }).forEach(d => {
            const skillMd = path.join(skillsDir, d, 'SKILL.md');
            try {
                const {
                    meta
                } = parseFrontmatter(fs.readFileSync(skillMd, 'utf8'));
                result.skills.push({
                    slug: d,
                    name: meta.name || d,
                    description: meta.description || ''
                });
            } catch {
                result.skills.push({
                    slug: d,
                    name: d,
                    description: ''
                });
            }
        });
    } catch {}

    // Agents: .md files in agents/
    try {
        const agentsDir = path.join(pluginDir, 'agents');
        fs.readdirSync(agentsDir).filter(f => f.endsWith('.md')).forEach(f => {
            try {
                const {
                    meta
                } = parseFrontmatter(fs.readFileSync(path.join(agentsDir, f), 'utf8'));
                const slug = f.replace('.md', '');
                result.agents.push({
                    slug,
                    name: meta.name || slug,
                    description: meta.description || ''
                });
            } catch {
                result.agents.push({
                    slug: f.replace('.md', ''),
                    name: f.replace('.md', ''),
                    description: ''
                });
            }
        });
    } catch {}

    // Commands: .claude/commands/*.md
    try {
        const cmdsDir = path.join(pluginDir, '.claude', 'commands');
        fs.readdirSync(cmdsDir).filter(f => f.endsWith('.md')).forEach(f => {
            try {
                const {
                    meta
                } = parseFrontmatter(fs.readFileSync(path.join(cmdsDir, f), 'utf8'));
                const slug = f.replace('.md', '');
                result.commands.push({
                    slug,
                    name: meta.name || slug,
                    description: meta.description || ''
                });
            } catch {
                result.commands.push({
                    slug: f.replace('.md', ''),
                    name: f.replace('.md', ''),
                    description: ''
                });
            }
        });
    } catch {}

    result.skills.sort((a, b) => a.name.localeCompare(b.name));
    result.agents.sort((a, b) => a.name.localeCompare(b.name));
    result.commands.sort((a, b) => a.name.localeCompare(b.name));

    res.json(result);
});

// POST /api/plugins/action — install/uninstall/enable/disable/update
app.post('/api/plugins/action', (req, res) => {
    const {
        action,
        pluginId,
        scope
    } = req.body || {};
    const validActions = ['install', 'uninstall', 'enable', 'disable', 'update'];
    if (!validActions.includes(action)) return res.status(400).json({
        error: 'acción inválida'
    });
    if (!pluginId || !/^[a-zA-Z0-9@._-]+$/.test(pluginId)) return res.status(400).json({
        error: 'pluginId inválido'
    });
    const validScopes = ['user', 'project', 'local'];
    const args = ['plugin', action, pluginId];
    if (scope && validScopes.includes(scope)) args.push('--scope', scope);
    const gitHttpsEnv = {
        ...process.env,
        GIT_CONFIG_COUNT: '1',
        GIT_CONFIG_KEY_0: 'url.https://github.com/.insteadOf',
        GIT_CONFIG_VALUE_0: 'git@github.com:',
    };
    try {
        const out = execFileSync('claude', args, {
            timeout: 120000,
            env: gitHttpsEnv
        }).toString();
        res.json({
            ok: true,
            output: out
        });
    } catch (e) {
        const output = e.stdout?.toString() || '';
        const errMsg = e.stderr?.toString() || e.message;
        res.status(500).json({
            error: errMsg,
            output
        });
    }
});

// GET /api/plugins/marketplaces — list configured marketplaces
app.get('/api/plugins/marketplaces', (req, res) => {
    try {
        const out = execFileSync('claude', ['plugin', 'marketplace', 'list', '--json'], {
            timeout: 10000
        }).toString();
        res.json(JSON.parse(out));
    } catch (e) {
        res.status(500).json({
            error: e.message
        });
    }
});

// POST /api/plugins/marketplaces — add a marketplace
app.post('/api/plugins/marketplaces', (req, res) => {
    const {
        source
    } = req.body || {};
    if (!source || typeof source !== 'string') return res.status(400).json({
        error: 'source requerido'
    });
    // Allow GitHub repos (owner/repo) and https URLs only
    if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(source) && !/^https:\/\//.test(source)) {
        return res.status(400).json({
            error: 'source debe ser owner/repo de GitHub o URL https'
        });
    }
    const gitHttpsEnv = {
        ...process.env,
        GIT_CONFIG_COUNT: '1',
        GIT_CONFIG_KEY_0: 'url.https://github.com/.insteadOf',
        GIT_CONFIG_VALUE_0: 'git@github.com:',
    };
    try {
        const out = execFileSync('claude', ['plugin', 'marketplace', 'add', source], {
            timeout: 30000,
            env: gitHttpsEnv
        }).toString();
        res.json({
            ok: true,
            output: out
        });
    } catch (e) {
        res.status(500).json({
            error: e.stderr?.toString() || e.message
        });
    }
});

// DELETE /api/plugins/marketplaces/:name — remove a marketplace
app.delete('/api/plugins/marketplaces/:name', (req, res) => {
    const {
        name
    } = req.params;
    if (!name || !/^[a-zA-Z0-9_.-]+$/.test(name)) return res.status(400).json({
        error: 'nombre inválido'
    });
    try {
        const out = execFileSync('claude', ['plugin', 'marketplace', 'remove', name], {
            timeout: 10000
        }).toString();
        res.json({
            ok: true,
            output: out
        });
    } catch (e) {
        res.status(500).json({
            error: e.stderr?.toString() || e.message
        });
    }
});

if (require.main === module) startServer();
module.exports = {
    app,
    startServer,
    PORT
};