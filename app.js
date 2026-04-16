marked.setOptions({
    gfm: true,
    breaks: true
});
marked.use({
    renderer: {
        code(token) {
            const lang = token.lang || '';
            const valid = hljs.getLanguage(lang) ? lang : 'plaintext';
            try {
                const highlighted = hljs.highlight(token.text, {
                    language: valid
                }).value;
                return `<pre><code class="hljs language-${valid}">${highlighted}</code></pre>`;
            } catch {
                return `<pre><code>${token.text}</code></pre>`;
            }
        },
        codespan(token) {
            try {
                const highlighted = hljs.highlightAuto(token.text).value;
                return `<code class="inline-code hljs">${highlighted}</code>`;
            } catch {
                return `<code class="inline-code">${token.text}</code>`;
            }
        }
    }
});

function hljsInline(text) {
    try {
        return hljs.highlightAuto(text).value;
    } catch {
        return text;
    }
}

function app() {
    return {
        view: 'dashboard',
        status: null,
        projects: [],
        sessions: [],
        selectedSession: null,
        sessionDetail: null,
        loadingSessions: false,
        loadingDetail: false,
        filterText: '',
        filterBranch: '',
        filterProject: '',
        filterFrom: '',
        filterTo: '',
        branches: [],
        totalSessions: 0,
        searchQuery: '',
        searchProject: '',
        searchResults: [],
        searchLoading: false,
        stats: null,
        statsLoading: false,
        subagentCache: {},
        memoryFiles: [],
        memoryLoading: false,
        selectedMemory: null,
        plans: [],
        plansLoading: false,
        selectedPlan: null,
        plansSearch: '',
        deletingSession: false,
        snapshottingSession: false,
        exportDropOpen: false,
        noteDropOpen: false,
        planDropOpen: false,
        planEditing: false,
        planBodyDraft: '',
        planSaving: false,
        planMsg: '',
        memoryDropOpen: false,
        exportMsg: '',
        cleanMode: true,

        planExportMsg: '',
        planExportOpen: false,
        planShareMsg: '',
        noteShareMsg: '',
        todayData: null,
        todayLoading: false,
        todayNewTask: '',
        todaySaveTimer: null,
        todayCopied: false,
        personalNotes: [],
        personalNotesLoading: false,
        selectedNote: null,
        noteEditing: false,
        noteTitleDraft: '',
        noteBodyDraft: '',
        noteMsg: '',
        noteExportMsg: '',
        noteSaving: false,
        noteRenamingFile: false,
        noteFilenameDraft: '',
        noteSearch: '',
        postponeMenuTask: '',
        editingTaskId: '',
        taskEditText: '',
        showCliRef: false,
        cliRefTab: 'slash',
        upcomingTasks: [],
        noteCreating: false,
        noteNewTitle: '',
        noteNewBody: '',
        noteClaudeInstalled: null,
        noteSetupMsg: '',
        noteAutocomplete: {
            visible: false,
            query: '',
            results: [],
            pos: 0
        },
        noteFromClipboard: false,
        scratchContent: sessionStorage.getItem('cs:scratch') || '',
        scratchActive: false,
        noteTagFilter: [],
        noteTagsDraft: '',
        noteNewTags: '',
        noteFolderPath: '',
        noteNewFolder: '',
        noteCreatingFolder: false,
        newFolderName: '',
        noteFolders: [],
        noteRenamingFolder: null,
        noteRenameFolderDraft: '',
        deletingFolder: null,
        noteTagMenu: null,
        noteTagRenaming: false,
        noteTagRenameDraft: '',
        sidebarW: parseInt(localStorage.getItem('cm:sidebarW') || '260'),
        navWidth: parseInt(localStorage.getItem('cs:navWidth') || '224'),
        _navDragging: false,
        historyEntries: [],
        historyLoading: false,
        historySearch: '',
        historyProject: '',
        config: null,
        configLoading: false,
        claudeMdEdit: {
            active: false,
            filename: '',
            draft: '',
            saving: false,
            msg: '',
            _path: '',
            _scope: 'user'
        },
        instrNew: {
            open: false,
            scope: 'user',
            preset: 'CLAUDE.md',
            customName: '',
            content: '',
            saving: false,
            msg: ''
        },
        hookBuilder: {
            open: false,
            event: 'PreToolUse',
            matcher: '',
            type: 'command',
            command: '',
            url: '',
            prompt: '',
            scope: 'user',
            saving: false,
            msg: '',
            _tpl: ''
        },
        skillNew: {
            open: false,
            slug: '',
            name: '',
            description: '',
            content: '',
            scope: 'user',
            saving: false,
            msg: ''
        },
        skillEdit: {
            active: false,
            draft: '',
            draftName: '',
            draftDesc: '',
            saving: false,
            msg: ''
        },
        skillsTab: 'marketplace',
        marketplace: [],
        marketplaceSources: [],
        marketplaceSourceFilter: 'all',
        agentsMarketplaceSourceFilter: 'all',
        pluginsMarketplaceFilter: 'all',
        skillsSourcesMgmt: false,
        agentsSourcesMgmt: false,
        pluginsSourcesMgmt: false,
        marketplaceSourceForm: {
            open: false,
            name: '',
            owner: '',
            repo: '',
            branch: 'main',
            skillsPath: '',
            token: '',
            tokenEnv: '',
            saving: false,
            msg: ''
        },
        marketplaceLoading: false,
        marketplaceErrors: [],
        marketplaceSearch: '',
        marketplaceSelected: null,
        marketplacePreview: null,
        marketplacePreviewLoading: false,
        marketplaceInstalling: false,
        marketplaceInstallScope: 'user',
        marketplaceInstallMsg: '',
        marketplaceInstalled: {},
        urlInstall: {
            url: '',
            loading: false,
            preview: null,
            slug: '',
            scope: 'user',
            msg: ''
        },
        agents: [],
        agentsLoading: false,
        selectedAgent: null,
        agentsTab: 'marketplace',
        agentsMarketplace: [],
        agentsMarketplaceLoading: false,
        agentsMarketplaceErrors: [],
        agentsMarketplaceSearch: '',
        agentsMarketplaceSelected: null,
        agentsMarketplaceInstalled: {},
        agentsMarketplaceInstalling: false,
        agentsMarketplaceInstallMsg: '',
        agentsMarketplaceSources: [],
        agentsMarketplaceSourceForm: {
            open: false,
            name: '',
            owner: '',
            repo: '',
            branch: '',
            itemsPath: '',
            msg: ''
        },
        agentsMarketplaceInstallScope: 'user',
        agentsUrlInstall: {
            url: '',
            loading: false,
            preview: null,
            slug: '',
            scope: 'user',
            msg: ''
        },
        commandsTab: 'list',
        commandsMarketplace: [],
        commandsMarketplaceLoading: false,
        commandsMarketplaceErrors: [],
        commandsMarketplaceSearch: '',
        commandsMarketplaceSelected: null,
        commandsMarketplaceInstalled: {},
        commandsMarketplaceInstalling: false,
        commandsMarketplaceInstallMsg: '',
        commandsMarketplaceSources: [],
        commandsMarketplaceSourceForm: {
            open: false,
            name: '',
            owner: '',
            repo: '',
            branch: '',
            itemsPath: '',
            msg: ''
        },
        commandsMarketplaceInstallScope: 'user',
        agentNew: {
            open: false,
            slug: '',
            name: '',
            description: '',
            tools: '',
            color: '',
            content: '',
            scope: 'user',
            saving: false,
            msg: ''
        },
        agentEdit: {
            active: false,
            draft: '',
            draftName: '',
            draftDesc: '',
            draftTools: '',
            draftColor: '',
            saving: false,
            msg: ''
        },
        hookEdit: {
            active: false,
            event: '',
            matcherIndex: -1,
            type: 'command',
            draft: '',
            saving: false,
            msg: '',
            _scope: 'user'
        },
        configProject: '',
        hooksLog: null,
        hooksLogLoading: false,
        hooksLogOpen: false,
        hookTest: {
            active: false,
            event: '',
            matcherIndex: -1,
            running: false,
            result: null
        },
        cliTab: 'marketplace',
        settingsDraft: {
            model: '',
            language: '',
            voiceEnabled: false,
            outputStyle: '',
            effortLevel: '',
            defaultMode: ''
        },
        settingsSaving: false,
        settingsMsg: '',
        githubTokenDraft: '',
        githubTokenSet: false,
        githubTokenMasked: '',
        githubTokenSaving: false,
        githubTokenMsg: '',
        shareMsg: '',
        shareUrl: '',
        permsDraft: {
            allow: [],
            deny: [],
            ask: []
        },
        permsNewRule: {
            allow: '',
            deny: '',
            ask: ''
        },
        ruleBuilder: {
            type: 'deny',
            tool: 'Bash',
            specifier: '',
            pathType: './'
        },
        permsSaving: false,
        permsMsg: '',
        memoryEditing: false,
        memoryDraft: '',
        memorySaving: false,
        memoryMsg: '',
        memoryNewModal: false,
        memoryNew: {
            type: 'feedback',
            name: '',
            description: '',
            body: ''
        },
        templates: [],
        templatesLoading: false,
        templateNew: {
            open: false,
            name: '',
            description: '',
            content: '',
            msg: '',
            saving: false
        },
        templateCopied: null,
        insights: null,
        insightsLoading: false,
        budgetMonthly: 0,
        budgetMonthlyDraft: '',
        budgetMsg: '',
        budgetAlertDismissed: localStorage.getItem('cs:budgetAlertDismissed') || '',
        sessionCosts: {},
        sessionCarbon: {},
        costsLoading: false,
        toolCommands: [],
        toolSkills: [],
        toolsLoading: false,
        selectedTool: null,
        pluginsInstalled: [],
        pluginsAvailable: [],
        pluginsLoading: false,
        pluginsAvailableLoading: false,
        pluginsTab: 'discover',
        pluginsSearch: '',
        pluginsSelected: null,
        pluginsDetail: null,
        pluginsDetailLoading: false,
        pluginsItems: null,
        pluginsItemsLoading: false,
        agentsFilter: null,
        skillsFilter: null,
        commandsFilter: null,
        pluginsMarketplaces: [],
        pluginsMarketplacesLoading: false,
        pluginAction: {
            loading: false,
            id: null,
            msg: ''
        },
        pluginMarketplaceNew: {
            open: false,
            source: '',
            msg: '',
            saving: false
        },
        pinnedCommands: JSON.parse(localStorage.getItem('cm:pinnedCommands') || '[]'),
        pinnedSlashCmds: JSON.parse(localStorage.getItem('cm:pinnedSlashCmds') || '[]'),
        slashCmds: [{
                cmd: '/add-dir <path>',
                desc: 'Add working directory to session'
            },
            {
                cmd: '/agents',
                desc: 'Manage subagent configurations'
            },
            {
                cmd: '/btw <question>',
                desc: 'Quick question without adding to context'
            },
            {
                cmd: '/branch [name]',
                desc: 'Create conversation branch. Alias: /fork'
            },
            {
                cmd: '/clear',
                desc: 'Clear history and free context. Alias: /reset, /new'
            },
            {
                cmd: '/color [color|default]',
                desc: 'Prompt color: red, blue, green, yellow, purple, orange, pink, cyan'
            },
            {
                cmd: '/compact [instructions]',
                desc: 'Compact conversation with optional instructions'
            },
            {
                cmd: '/config',
                desc: 'Open Settings. Alias: /settings'
            },
            {
                cmd: '/context',
                desc: 'Visualize context usage as a color grid'
            },
            {
                cmd: '/copy [N]',
                desc: 'Copy last response to clipboard'
            },
            {
                cmd: '/cost',
                desc: 'Token usage and cost statistics'
            },
            {
                cmd: '/diff',
                desc: 'Interactive per-turn diff viewer'
            },
            {
                cmd: '/doctor',
                desc: 'Diagnose installation and configuration'
            },
            {
                cmd: '/effort [low|medium|high|max|auto]',
                desc: 'Set model effort level'
            },
            {
                cmd: '/exit',
                desc: 'Exit the CLI. Alias: /quit'
            },
            {
                cmd: '/export [filename]',
                desc: 'Export current conversation as text'
            },
            {
                cmd: '/fast [on|off]',
                desc: 'Toggle fast mode'
            },
            {
                cmd: '/feedback',
                desc: 'Send feedback. Alias: /bug'
            },
            {
                cmd: '/help',
                desc: 'Show help and available commands'
            },
            {
                cmd: '/hooks',
                desc: 'View hook configurations'
            },
            {
                cmd: '/ide',
                desc: 'Manage IDE integrations'
            },
            {
                cmd: '/init',
                desc: 'Initialize project with CLAUDE.md guide'
            },
            {
                cmd: '/insights',
                desc: 'Session analytics report'
            },
            {
                cmd: '/keybindings',
                desc: 'Open keybindings file'
            },
            {
                cmd: '/login',
                desc: 'Sign in to Anthropic'
            },
            {
                cmd: '/logout',
                desc: 'Sign out from Anthropic'
            },
            {
                cmd: '/mcp',
                desc: 'Manage MCP connections and OAuth'
            },
            {
                cmd: '/memory',
                desc: 'Edit CLAUDE.md and manage auto-memory'
            },
            {
                cmd: '/model [model]',
                desc: 'Select or change AI model'
            },
            {
                cmd: '/permissions',
                desc: 'View/update permissions. Alias: /allowed-tools'
            },
            {
                cmd: '/plan [description]',
                desc: 'Enter plan mode (analyzes only, no execution)'
            },
            {
                cmd: '/plugin',
                desc: 'Manage Claude Code plugins'
            },
            {
                cmd: '/pr-comments [PR]',
                desc: 'Fetch comments from a GitHub PR'
            },
            {
                cmd: '/release-notes',
                desc: 'View full changelog'
            },
            {
                cmd: '/rename [name]',
                desc: 'Rename current session'
            },
            {
                cmd: '/resume [session]',
                desc: 'Resume conversation. Alias: /continue'
            },
            {
                cmd: '/rewind',
                desc: 'Rewind to a previous point. Alias: /checkpoint'
            },
            {
                cmd: '/sandbox',
                desc: 'Toggle sandbox mode'
            },
            {
                cmd: '/security-review',
                desc: 'Analyze changes for security vulnerabilities'
            },
            {
                cmd: '/skills',
                desc: 'List available skills'
            },
            {
                cmd: '/stats',
                desc: 'Visualize daily usage and streaks'
            },
            {
                cmd: '/status',
                desc: 'View version, model, account and connectivity'
            },
            {
                cmd: '/statusline',
                desc: 'Configure the terminal status line'
            },
            {
                cmd: '/tasks',
                desc: 'List and manage background tasks'
            },
            {
                cmd: '/theme',
                desc: 'Change color theme'
            },
            {
                cmd: '/usage',
                desc: 'Plan usage limits and rate limit'
            },
            {
                cmd: '/vim',
                desc: 'Toggle Vim and Normal modes'
            },
            {
                cmd: '/voice',
                desc: 'Enable voice dictation (push to talk)'
            },
        ],
        selectedProject: null,
        projectSessions: [],
        projectSessionsLoading: false,
        projectMemory: [],
        projectMemorySelected: null,
        projectMemoryLoading: false,
        projectClaudeMd: null,
        projectClaudeMdLoading: false,
        projectClaudeMdEdit: {
            active: false,
            fileIdx: 0,
            draft: '',
            saving: false,
            msg: ''
        },
        projectGitStatus: null,
        projectGitLoading: false,
        projectTab: 'sessions',
        sessionsTab: 'list',
        knowledgeTab: 'memory',
        setupTab: 'commands',
        showToday: localStorage.getItem('cs:showToday') !== 'false',
        showInsights: localStorage.getItem('cs:showInsights') !== 'false',
        widgetsOpen: localStorage.getItem('cs:widgetsOpen') !== 'false',
        showNotes: localStorage.getItem('cs:showNotes') !== 'false',
        showTemplates: localStorage.getItem('cs:showTemplates') !== 'false',
        showWebmd: localStorage.getItem('cs:showWebmd') !== 'false',
        webmdUrl: '',
        webmdResult: null,
        webmdLoading: false,
        webmdError: '',
        webmdShowRaw: true,
        webmdOptTitle: localStorage.getItem('cs:webmdOptTitle') !== 'false',
        webmdOptLinks: localStorage.getItem('cs:webmdOptLinks') === 'true',
        webmdOptClean: localStorage.getItem('cs:webmdOptClean') === 'true',
        webmdItems: [],
        webmdItemsLoading: false,
        defaultView: localStorage.getItem('cs:defaultView') || '',

        // ── Live session monitor ──────────────────────────────
        activeSessions: [],
        liveSource: null,
        liveSessionId: null,
        liveBurnRate: 0,
        liveTools: [],
        _liveLastCtxTotal: 0,
        _liveBurnStart: null,
        _liveBurnNewToks: 0,
        _livePollingTimer: null,
        _liveRefreshTimer: null,
        liveNotifyEnabled: localStorage.getItem('cs:liveNotify') === 'true',
        osNotifPermission: ('Notification' in window) ? Notification.permission : 'unsupported',
        // Session Archaeology
        sessionDetailTab: 'chat',
        timelineMode: localStorage.getItem('cs:timelineMode') !== '0',
        tlMarker: 0.38,
        activeDiffTs: null,
        expandedSessions: {},
        sessionSummaries: {},
        sessionDiffs: {},
        sessionDiffsLoading: false,
        sessionCommits: {},
        sessionCommitsLoading: false,
        sessionBookmarks: {},
        collapsedFolders: {},
        ftFilter: '',
        ftTreeVisible: localStorage.getItem('cs:ftTreeVisible') !== '0',
        ftTreeWidth: Number(localStorage.getItem('cs:ftTreeWidth')) || 220,
        fcLayout: localStorage.getItem('cs:fcLayout') || 'unified',
        fcLayoutOpen: false,
        _scrollListener: null,
        _syncLock: false,
        diffsPanelWidth: Number(localStorage.getItem('cs:diffsPanelWidth')) || 340,
        filesQuery: '',
        filesResults: [],
        filesLoading: false,
        recentFiles: [],
        recentFilesLoading: false,
        filesSuggestions: [],
        filesSuggestIdx: -1,
        _liveIdleTimer: null,
        _liveAudioCtx: null,

        async init() {
            const savedView = sessionStorage.getItem('cs:view');
            const savedProject = localStorage.getItem('cs:project');
            const savedBranch = localStorage.getItem('cs:branch');
            const savedText = localStorage.getItem('cs:filterText');
            const savedFrom = localStorage.getItem('cs:filterFrom');
            const savedTo = localStorage.getItem('cs:filterTo');
            const startView = savedView || this.defaultView;
            const hiddenViews = [
                !this.showToday && 'today',
                !this.showNotes && 'notes',
                !this.showInsights && 'dashboard',
            ].filter(Boolean);
            if (startView && !hiddenViews.includes(startView)) this.view = startView;
            else if (hiddenViews.includes(startView)) this.view = 'sessions';
            if (savedText) this.filterText = savedText;
            if (savedFrom) this.filterFrom = savedFrom;
            if (savedTo) this.filterTo = savedTo;

            this.$watch('view', v => {
                sessionStorage.setItem('cs:view', v);
                if (v !== 'notes' && window.location.hash.startsWith('#/note/')) window.location.hash = '';
                if (v !== 'sessions' && window.location.hash.startsWith('#/session/')) window.location.hash = '';
            });
            this.$watch('filterProject', v => localStorage.setItem('cs:project', v));
            this.$watch('filterBranch', v => localStorage.setItem('cs:branch', v));
            this.$watch('filterText', v => localStorage.setItem('cs:filterText', v));
            this.$watch('filterFrom', v => localStorage.setItem('cs:filterFrom', v));
            this.$watch('filterTo', v => localStorage.setItem('cs:filterTo', v));
            this.$watch('configProject', () => {
                this.config = null;
                this.loadConfig();
                this.hooksLog = null;
                this.toolCommands = [];
                this.toolSkills = [];
                this.agents = [];
                if (this.view === 'commands' || this.view === 'skills') this.loadTools();
                if (this.view === 'agents') this.loadAgents();
            });

            await this.loadProjects();
            if (savedProject) this.filterProject = savedProject;
            await this.loadBranches();
            if (savedBranch) this.filterBranch = savedBranch;
            await this.loadSessions();
            this.initView(this.view);
            this.loadCosts();
            this.loadStatus();
            this.loadInsights();
            // Load counts for nav badges without blocking
            this.loadToday();
            this.loadPlans();
            this.loadAgents();
            this.loadTools();
            this.loadMemory();
            this.loadPersonalNotes();
            this.startActivePolling();
            // Parse URL hash for direct links
            const hash = window.location.hash;
            const mSession = hash.match(/^#\/session\/([^/]+)\/([^/]+)$/);
            const mNote = hash.match(/^#\/note\/(.+)$/);
            const mFolder = hash.match(/^#\/notes\/folder\/(.+)$/);
            if (mSession) {
                this.view = 'sessions';
                await this.openSessionById(mSession[2], mSession[1]);
            }
            if (mFolder) {
                this.view = 'notes';
                this.noteFolderPath = decodeURIComponent(mFolder[1]);
            }
            if (mNote) {
                const notes = await fetch('/api/notes').then(r => r.json()).catch(() => []);
                this.personalNotes = notes;
                const note = this.personalNotes.find(n => n.path === mNote[1]);
                if (note) {
                    this.view = 'notes';
                    this.selectedNote = note;
                    this.noteFolderPath = note.folder ?? '';
                }
            }
            // Clear hash when closing
            this.$watch('selectedSession', v => {
                if (!v) {
                    if (window.location.hash.startsWith('#/session/')) window.location.hash = '';
                    this.closeLiveStream();
                }
            });
            this.$watch('selectedNote', v => {
                if (!v) {
                    if (window.location.hash.startsWith('#/note/')) window.location.hash = '';
                }
            });
        },

        initView(v) {
            if (v === 'today') {
                this.loadToday();
            }
            if (v === 'dashboard') {
                this.loadStats();
                this.loadInsights();
            }
            if (v === 'projects') {
                this.loadProjects();
            }
            if (v === 'memory') {
                this.loadMemory();
            }
            if (v === 'notes') {
                this.loadPersonalNotes();
            }
            if (v === 'plans') {
                this.loadPlans();
            }
            if (v === 'commands' || v === 'skills') {
                this.loadTools();
            }
            if (v === 'skills') {
                if (this.skillsTab === 'marketplace') this.loadMarketplace();
            }
            if (v === 'commands') {
                if (this.cliTab === 'marketplace') {
                    this.loadCommandsMarketplace();
                    this.loadCommandsMarketplaceSources();
                }
            }
            if (v === 'agents') {
                this.loadAgents();
                if (this.agentsTab === 'marketplace') {
                    this.loadAgentsMarketplace();
                    this.loadAgentsMarketplaceSources();
                }
            }
            if (v === 'plugins') {
                this.loadPlugins();
                if (this.pluginsTab === 'discover') {
                    this.loadPluginsAvailable();
                    this.loadPluginsMarketplaces();
                }
            }
            if (v === 'config' || v === 'instructions' || v === 'permissions' || v === 'hooks') {
                this.loadConfig();
                this.checkNoteClaudeStatus();
            }
        },

        // ── Live session monitor ────────────────────────────────────────────────

        startActivePolling() {
            this.pollActiveSessions();
            this._livePollingTimer = setInterval(() => this.pollActiveSessions(), 5000);
        },

        async pollActiveSessions() {
            try {
                const data = await fetch('/api/sessions/active').then(r => r.json());
                this.activeSessions = data;
                if (this.liveSource) {
                    // Close stream if the session it's tracking is no longer active
                    const still = data.find(s => s.sessionId === this.liveSessionId);
                    if (!still) this.closeLiveStream();
                } else if (data.length > 0) {
                    // Prefer the currently selected session if it's active;
                    // otherwise open a background stream for the first active session (for sound notifications)
                    const selected = this.selectedSession && data.find(s => s.sessionId === this.selectedSession.sessionId);
                    const target = selected ? this.selectedSession : (this.liveNotifyEnabled ? data[0] : null);
                    if (target) this.openLiveStream(target);
                }
            } catch {}
        },

        openLiveStream(session) {
            this.closeLiveStream();
            const url = `/api/sessions/${session.projectDir}/${session.sessionId}/stream`;
            const es = new EventSource(url);
            this.liveSource = es;
            this.liveSessionId = session.sessionId;
            this.liveBurnRate = 0;
            this.liveTools = [];
            this._liveBurnStart = null;
            this._liveBurnNewToks = 0;
            // Seed context % from already-loaded sessionDetail (last message's context)
            this._liveLastCtxTotal = this._ctxFromSessionDetail();

            // Refresh sessionDetail every 4s while live (keeps tokens/cost in header accurate)
            this._liveRefreshTimer = setInterval(async () => {
                if (!this.selectedSession || this.selectedSession.sessionId !== session.sessionId) return;
                try {
                    const d = await fetch(`/api/sessions/${session.projectDir}/${session.sessionId}`).then(r => r.json());
                    this.sessionDetail = d;
                    this._liveLastCtxTotal = this._ctxFromSessionDetail();
                } catch {}
                // Also refresh commits if that tab is open
                if (this.sessionDetailTab === 'commits') this.loadSessionCommits();
            }, 4000);

            es.onmessage = (e) => {
                let msg;
                try {
                    msg = JSON.parse(e.data);
                } catch {
                    return;
                }
                if (msg.type === 'assistant' && msg.message?.usage) {
                    const u = msg.message.usage;
                    // Context gauge: use THIS message's total input (not accumulated sum)
                    // input_tokens + cache_read + cache_creation = full context sent to model
                    this._liveLastCtxTotal =
                        (u.input_tokens || 0) +
                        (u.cache_read_input_tokens || 0) +
                        (u.cache_creation_input_tokens || 0);

                    // Burn rate: accumulate only NEW tokens (SSE skips history)
                    const newToks = (u.input_tokens || 0) + (u.output_tokens || 0);
                    this._liveBurnNewToks += newToks;
                    const now = Date.now();
                    if (!this._liveBurnStart) {
                        this._liveBurnStart = now;
                    } else {
                        const elapsed = (now - this._liveBurnStart) / 60000;
                        if (elapsed > 0.05) this.liveBurnRate = Math.round(this._liveBurnNewToks / elapsed);
                    }

                    // Tool feed
                    if (Array.isArray(msg.message?.content)) {
                        for (const block of msg.message.content) {
                            if (block.type === 'tool_use') {
                                this.liveTools = [block.name, ...this.liveTools].slice(0, 5);
                            }
                        }
                    }

                    // Idle timer: si no llega nada en 4s → Claude esperando input
                    this._resetIdleTimer();
                }
            };
            es.onerror = () => {};
        },

        closeLiveStream() {
            if (this.liveSource) {
                try {
                    this.liveSource.close();
                } catch {}
                this.liveSource = null;
            }
            if (this._liveRefreshTimer) {
                clearInterval(this._liveRefreshTimer);
                this._liveRefreshTimer = null;
            }
            clearTimeout(this._liveIdleTimer);
            this._liveIdleTimer = null;
            this.liveSessionId = null;
            this.liveBurnRate = 0;
            this.liveTools = [];
            this._liveLastCtxTotal = 0;
            this._liveBurnNewToks = 0;
        },

        isActiveSession(sessionId) {
            return this.activeSessions.some(s => s.sessionId === sessionId);
        },

        // Context %: from the last assistant message's total input context
        // (not a running sum — each message's input = full conversation context sent to model)
        liveContextPct() {
            if (!this._liveLastCtxTotal) return 0;
            return Math.min(100, Math.round(this._liveLastCtxTotal / 200000 * 100));
        },

        // Seed initial context from already-loaded sessionDetail
        _ctxFromSessionDetail() {
            if (!this.sessionDetail?.tokens) return 0;
            // The last turn's context ≈ total input - sum of prior outputs
            // Best proxy without re-parsing: use the most recent input tokens directly
            // from the raw last assistant message if available
            const msgs = this.sessionDetail.messages || [];
            for (let i = msgs.length - 1; i >= 0; i--) {
                const m = msgs[i];
                if (m.type === 'assistant' && m.message?.usage) {
                    const u = m.message.usage;
                    return (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
                }
            }
            return 0;
        },

        // ── Done notification ───────────────────────────────────────────────────

        toggleLiveNotify() {
            this.liveNotifyEnabled = !this.liveNotifyEnabled;
            localStorage.setItem('cs:liveNotify', this.liveNotifyEnabled);
            if (this.liveNotifyEnabled) {
                this._unlockAudio();
                if ('Notification' in window && Notification.permission === 'default') {
                    Notification.requestPermission();
                }
            }
        },

        _unlockAudio() {
            if (!this._liveAudioCtx) {
                try {
                    this._liveAudioCtx = new(window.AudioContext || window.webkitAudioContext)();
                } catch {}
            }
        },

        _playDone() {
            try {
                const ctx = this._liveAudioCtx || new(window.AudioContext || window.webkitAudioContext)();
                this._liveAudioCtx = ctx;
                // Two-tone soft ding: 880 Hz → 660 Hz
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.type = 'sine';
                osc.frequency.setValueAtTime(880, ctx.currentTime);
                osc.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.12);
                gain.gain.setValueAtTime(0.25, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.55);
                osc.start(ctx.currentTime);
                osc.stop(ctx.currentTime + 0.55);
            } catch {}
        },

        _notifyClaudeDone() {
            if (!this.liveNotifyEnabled) return;
            this._playDone();
            // Browser notification only if tab is not focused
            if ('Notification' in window && Notification.permission === 'granted' && !document.hasFocus()) {
                const s = this.activeSessions[0];
                new Notification('Claude is waiting ↩', {
                    body: s?.firstPrompt ? s.firstPrompt.slice(0, 80) : (s?.projectDir || 'Session ready'),
                });
            }
        },

        _testOsNotification() {
            if (!('Notification' in window)) {
                this.osNotifPermission = 'unsupported';
                return;
            }
            if (Notification.permission !== 'granted') {
                Notification.requestPermission().then(p => {
                    this.osNotifPermission = p;
                    if (p === 'granted') this._testOsNotification();
                });
                return;
            }
            this.osNotifPermission = 'granted';
            // Force notification regardless of focus — for testing purposes
            new Notification('Claude is waiting ↩', {
                body: 'Test — si ves esto, OS notifications funcionan ✓'
            });
        },

        _resetIdleTimer() {
            clearTimeout(this._liveIdleTimer);
            // 4 s sin mensajes nuevos → Claude terminó y espera input
            this._liveIdleTimer = setTimeout(() => this._notifyClaudeDone(), 4000);
        },

        async loadProjects() {
            const data = await fetch('/api/projects').then(r => r.json());
            this.projects = data;
            this.totalSessions = data.reduce((s, p) => s + p.sessionCount, 0);
        },

        async openProject(proj) {
            this.view = 'projects';
            this.selectedProject = proj;
            this.projectTab = 'sessions';
            this.projectMemorySelected = null;
            this.projectClaudeMd = null;
            this.projectClaudeMdEdit = {
                active: false,
                fileIdx: 0,
                draft: '',
                saving: false,
                msg: ''
            };
            this.loadProjectSessions();
            this.loadProjectMemory();
            this.loadProjectClaudeMd();
        },

        async loadProjectSessions() {
            if (!this.selectedProject) return;
            this.projectSessionsLoading = true;
            this.projectSessions = await fetch(`/api/sessions?project=${this.selectedProject.dirName}`).then(r => r.json());
            this.projectSessionsLoading = false;
        },

        async loadProjectMemory() {
            if (!this.selectedProject) return;
            this.projectMemoryLoading = true;
            this.projectMemory = await fetch(`/api/memory?project=${this.selectedProject.dirName}`).then(r => r.json());
            this.projectMemoryLoading = false;
        },

        async loadProjectClaudeMd() {
            if (!this.selectedProject) return;
            this.projectClaudeMdLoading = true;
            this.projectClaudeMd = await fetch(`/api/projects/${this.selectedProject.dirName}/claude-md`).then(r => r.json());
            this.projectClaudeMdLoading = false;
        },

        async loadProjectGitStatus() {
            if (!this.selectedProject) return;
            this.projectGitLoading = true;
            this.projectGitStatus = await fetch(`/api/projects/${this.selectedProject.dirName}/git-status`).then(r => r.json());
            this.projectGitLoading = false;
        },

        async saveProjectClaudeMd() {
            if (!this.selectedProject || !this.projectClaudeMd) return;
            const file = this.projectClaudeMd.files[this.projectClaudeMdEdit.fileIdx];
            if (!file) return;
            this.projectClaudeMdEdit.saving = true;
            this.projectClaudeMdEdit.msg = '';
            try {
                const res = await fetch(`/api/projects/${this.selectedProject.dirName}/claude-md`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        filePath: file.filePath,
                        content: this.projectClaudeMdEdit.draft
                    }),
                });
                if (!res.ok) throw new Error((await res.json()).error || 'Error');
                file.content = this.projectClaudeMdEdit.draft;
                this.projectClaudeMdEdit.active = false;
                this.projectClaudeMdEdit.msg = 'Saved';
            } catch (e) {
                this.projectClaudeMdEdit.msg = e.message;
            }
            this.projectClaudeMdEdit.saving = false;
        },

        projectCost(dirName) {
            if (!this.insights) return null;
            const entry = this.insights.byProject?.find(p => p.dir === dirName);
            return entry ? entry.cost : null;
        },

        async loadBranches() {
            const params = this.filterProject ? `?project=${this.filterProject}` : '';
            this.branches = await fetch(`/api/branches${params}`).then(r => r.json());
        },

        async loadSessions() {
            this.loadingSessions = true;
            const params = new URLSearchParams();
            if (this.filterProject) params.set('project', this.filterProject);
            if (this.filterBranch) params.set('branch', this.filterBranch);
            if (this.filterText) params.set('search', this.filterText);
            if (this.filterFrom) params.set('from', this.filterFrom);
            if (this.filterTo) params.set('to', this.filterTo);
            this.sessions = await fetch(`/api/sessions?${params}`).then(r => r.json());
            this.loadingSessions = false;
        },

        // ── Session Archaeology ────────────────────────────────────────────────

        get filesChangedDiffs() {
            const diffs = this.sessionDiffs[this.selectedSession?.sessionId];
            if (!diffs?.length) return [];
            const fileMap = new Map();
            const order = [];
            for (const d of diffs) {
                if (!fileMap.has(d.filePath)) {
                    order.push(d.filePath);
                }
                // Siempre sobreescribir con el último cambio del fichero
                fileMap.set(d.filePath, {
                    filePath: d.filePath,
                    tool: d.tool,
                    totalAdded: d.added,
                    totalRemoved: d.removed,
                    changes: [d],
                });
            }
            return order.map(k => fileMap.get(k));
        },

        get fileTreeFlat() {
            const files = this.filesChangedDiffs;
            if (!files.length) return [];
            const q = this.ftFilter.trim().toLowerCase();

            if (q) {
                // Filtered mode: matching files + their immediate parent folder only
                const result = [];
                const seenFolders = new Set();
                files.forEach((f, fi) => {
                    const parts = f.filePath.replace(/^\//, '').split('/');
                    const filename = parts[parts.length - 1];
                    if (!filename.toLowerCase().includes(q)) return;
                    if (parts.length > 1) {
                        const folderKey = parts.slice(0, -1).join('/');
                        if (!seenFolders.has(folderKey)) {
                            seenFolders.add(folderKey);
                            result.push({
                                type: 'folder',
                                name: parts[parts.length - 2],
                                path: folderKey,
                                depth: 0
                            });
                        }
                    }
                    result.push({
                        type: 'file',
                        name: filename,
                        fi,
                        filePath: f.filePath,
                        depth: parts.length > 1 ? 1 : 0
                    });
                });
                return result;
            }

            // Full tree mode
            const root = {};
            const addFile = (node, parts, fi, filePath) => {
                if (parts.length === 1) {
                    (node._files = node._files || []).push({
                        name: parts[0],
                        fi,
                        filePath
                    });
                } else {
                    const dir = parts[0];
                    node[dir] = node[dir] || {};
                    addFile(node[dir], parts.slice(1), fi, filePath);
                }
            };
            files.forEach((f, fi) => addFile(root, f.filePath.replace(/^\//, '').split('/'), fi, f.filePath));
            const result = [];
            const collapsed = this.collapsedFolders;
            const walk = (node, depth, prefix) => {
                const dirs = Object.keys(node).filter(k => k !== '_files').sort();
                for (const name of dirs) {
                    const path = prefix ? prefix + '/' + name : name;
                    result.push({
                        type: 'folder',
                        name,
                        path,
                        depth
                    });
                    if (!collapsed[path]) walk(node[name], depth + 1, path);
                }
                for (const f of (node._files || [])) {
                    result.push({
                        type: 'file',
                        name: f.name,
                        fi: f.fi,
                        filePath: f.filePath,
                        depth
                    });
                }
            };
            walk(root, 0, '');
            return result;
        },

        toggleFolder(path) {
            this.collapsedFolders = {
                ...this.collapsedFolders,
                [path]: !this.collapsedFolders[path]
            };
        },

        scrollToFile(fi) {
            const el = document.querySelector(`[data-fc-fi="${fi}"]`);
            if (el) el.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        },

        get splitDiffs() {
            const diffs = this.sessionDiffs[this.selectedSession?.sessionId];
            if (!diffs?.length) return [];
            const groups = [];
            const seen = new Map();
            for (const d of diffs) {
                const ts = d.timestamp || '';
                if (!seen.has(ts)) {
                    seen.set(ts, []);
                    groups.push({
                        timestamp: ts,
                        changes: seen.get(ts)
                    });
                }
                seen.get(ts).push(d);
            }
            return groups;
        },

        async loadSessionBookmarks() {
            const s = this.selectedSession;
            if (!s) return;
            try {
                const data = await fetch(`/api/sessions/${s.projectDir}/${s.sessionId}/bookmarks`).then(r => r.json());
                this.sessionBookmarks = {
                    ...this.sessionBookmarks,
                    [s.sessionId]: data
                };
            } catch {}
        },

        isBookmarked(uuid) {
            if (!uuid || !this.selectedSession) return false;
            return (this.sessionBookmarks[this.selectedSession.sessionId] || []).some(b => b.messageUuid === uuid);
        },

        async toggleBookmark(msg) {
            const s = this.selectedSession;
            if (!s || !msg?.uuid) return;
            const bms = this.sessionBookmarks[s.sessionId] || [];
            const existing = bms.find(b => b.messageUuid === msg.uuid);
            if (existing) {
                await fetch(`/api/sessions/${s.projectDir}/${s.sessionId}/bookmarks/${existing.id}`, {
                    method: 'DELETE'
                });
                this.sessionBookmarks = {
                    ...this.sessionBookmarks,
                    [s.sessionId]: bms.filter(b => b.id !== existing.id)
                };
            } else {
                const bm = await fetch(`/api/sessions/${s.projectDir}/${s.sessionId}/bookmarks`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        messageUuid: msg.uuid,
                        messageTimestamp: msg.timestamp
                    }),
                }).then(r => r.json());
                if (bm.id) this.sessionBookmarks = {
                    ...this.sessionBookmarks,
                    [s.sessionId]: [...bms, bm]
                };
            }
        },

        _bmIdx: 0,
        prevBookmark() {
            const bms = this.sessionBookmarks[this.selectedSession?.sessionId] || [];
            if (!bms.length) return;
            this._bmIdx = (this._bmIdx - 1 + bms.length) % bms.length;
            const el = document.querySelector(`[data-uuid="${bms[this._bmIdx].messageUuid}"]`);
            el?.scrollIntoView({
                behavior: 'smooth',
                block: 'center'
            });
        },
        nextBookmark() {
            const bms = this.sessionBookmarks[this.selectedSession?.sessionId] || [];
            if (!bms.length) return;
            this._bmIdx = (this._bmIdx + 1) % bms.length;
            const el = document.querySelector(`[data-uuid="${bms[this._bmIdx].messageUuid}"]`);
            el?.scrollIntoView({
                behavior: 'smooth',
                block: 'center'
            });
        },

        async loadSessionCommits() {
            const s = this.selectedSession;
            if (!s) return;
            // For active sessions bypass cache so we always see the latest commits
            if (this.sessionCommits[s.sessionId] && !this.isActiveSession(s.sessionId)) return;
            this.sessionCommitsLoading = true;
            try {
                const data = await fetch(`/api/sessions/${s.projectDir}/${s.sessionId}/commits`).then(r => r.json());
                this.sessionCommits = {
                    ...this.sessionCommits,
                    [s.sessionId]: data
                };
            } catch {}
            this.sessionCommitsLoading = false;
        },

        _langFromExt(filePath) {
            const ext = (filePath || '').split('.').pop().toLowerCase();
            return {
                js: 'javascript',
                mjs: 'javascript',
                cjs: 'javascript',
                jsx: 'javascript',
                ts: 'typescript',
                tsx: 'typescript',
                html: 'html',
                htm: 'html',
                svelte: 'html',
                vue: 'html',
                css: 'css',
                scss: 'css',
                less: 'css',
                json: 'json',
                jsonc: 'json',
                rs: 'rust',
                py: 'python',
                rb: 'ruby',
                go: 'go',
                java: 'java',
                sh: 'bash',
                bash: 'bash',
                zsh: 'bash',
                md: 'markdown',
                mdx: 'markdown',
                yaml: 'yaml',
                yml: 'yaml',
                toml: 'toml',
                sql: 'sql',
                xml: 'xml',
                svg: 'xml',
                kt: 'kotlin',
                kts: 'kotlin',
                swift: 'swift',
                c: 'c',
                h: 'c',
                cpp: 'cpp',
                cc: 'cpp',
                cxx: 'cpp',
                hpp: 'cpp',
                cs: 'csharp',
                php: 'php',
                r: 'r',
            } [ext] || null;
        },

        _escHtml(s) {
            return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        },

        _splitHlHtml(html) {
            // Split hljs output by newlines while properly closing/reopening <span> tags
            const lines = [];
            let cur = '';
            let open = [];
            let i = 0;
            while (i < html.length) {
                if (html[i] === '<') {
                    const end = html.indexOf('>', i);
                    if (end === -1) {
                        cur += html.slice(i);
                        break;
                    }
                    const tag = html.slice(i, end + 1);
                    if (tag.startsWith('<span')) {
                        open.push(tag);
                        cur += tag;
                    } else if (tag === '</span>') {
                        open.pop();
                        cur += tag;
                    } else cur += tag;
                    i = end + 1;
                } else if (html[i] === '\n') {
                    cur += '</span>'.repeat(open.length);
                    lines.push(cur);
                    cur = open.join('');
                    i++;
                } else {
                    cur += html[i++];
                }
            }
            if (cur) lines.push(cur);
            return lines;
        },

        _hlGroup(lines, lang) {
            if (!window.hljs || !lines.length) return;
            const text = lines.map(l => l.line).join('\n');
            let htmlLines;
            try {
                let r;
                if (lang === 'html' && !text.includes('<')) {
                    // Hunk inside <script> or <style> — auto-detect the sub-language
                    r = hljs.highlightAuto(text, ['javascript', 'typescript', 'css', 'scss']);
                } else if (lang) {
                    r = hljs.highlight(text, {
                        language: lang,
                        ignoreIllegals: true
                    });
                } else {
                    r = {
                        value: this._escHtml(text)
                    };
                }
                htmlLines = this._splitHlHtml(r.value);
            } catch {
                htmlLines = lines.map(l => this._escHtml(l.line));
            }
            lines.forEach((l, i) => {
                l._html = htmlLines[i] ?? this._escHtml(l.line);
            });
        },

        splitRows(hunk) {
            const rows = [];
            let i = 0;
            while (i < hunk.length) {
                if (hunk[i].type === 'context') {
                    rows.push({
                        lt: 'ctx',
                        rt: 'ctx',
                        l: hunk[i],
                        r: hunk[i]
                    });
                    i++;
                } else {
                    const rem = [],
                        add = [];
                    while (i < hunk.length && hunk[i].type === 'remove') rem.push(hunk[i++]);
                    while (i < hunk.length && hunk[i].type === 'add') add.push(hunk[i++]);
                    for (let j = 0; j < Math.max(rem.length, add.length); j++)
                        rows.push({
                            lt: rem[j] ? 'remove' : 'empty',
                            rt: add[j] ? 'add' : 'empty',
                            l: rem[j] || null,
                            r: add[j] || null
                        });
                }
            }
            return rows;
        },

        _highlightDiffs(diffs) {
            for (const d of diffs) {
                const lang = this._langFromExt(d.filePath);
                for (const hunk of (d.hunks || [])) this._hlGroup(hunk, lang);
                if (d.allLines) this._hlGroup(d.allLines, lang);
            }
        },

        async loadSessionDiffs() {
            const s = this.selectedSession;
            if (!s || this.sessionDiffs[s.sessionId]) return;
            this.sessionDiffsLoading = true;
            try {
                const data = await fetch(`/api/sessions/${s.projectDir}/${s.sessionId}/diffs`).then(r => r.json());
                // Tag each change with a stable index and restore viewed state from localStorage
                const sid = s.sessionId;
                for (let i = 0; i < data.length; i++) {
                    data[i]._idx = i;
                    if (localStorage.getItem(`viewed:${sid}:${i}`) === '1') {
                        data[i]._viewed = true;
                        data[i]._open = false;
                    }
                }
                this._highlightDiffs(data);
                this.sessionDiffs = {
                    ...this.sessionDiffs,
                    [s.sessionId]: data
                };
            } catch {}
            this.sessionDiffsLoading = false;
            // Init scroll sync after diffs are available
            this.$nextTick(() => this.initScrollSync());
        },

        toggleTimeline() {
            this.timelineMode = !this.timelineMode;
            localStorage.setItem('cs:timelineMode', this.timelineMode ? '1' : '0');
            if (this.timelineMode) {
                this.$nextTick(() => this.initScrollSync());
            } else {
                if (this._scrollListener) {
                    this._scrollListener.el.removeEventListener('scroll', this._scrollListener.fn);
                    this._scrollListener = null;
                }
            }
        },

        initScrollSync() {
            // Clean up previous listeners
            if (this._scrollListener) {
                this._scrollListener.el.removeEventListener('scroll', this._scrollListener.fn);
                this._scrollListener = null;
            }
            const chatEl = document.getElementById('chat-col');
            const panel = document.getElementById('split-diffs-panel');
            if (!chatEl) return;
            const self = this;
            let lockTimer = null;
            const lock = () => {
                self._syncLock = true;
                clearTimeout(lockTimer);
                lockTimer = setTimeout(() => {
                    self._syncLock = false;
                }, 500);
            };

            let _lastChatTs = null;

            // Left → Right: chat scroll drives diffs panel
            const onChatScroll = () => {
                if (self._syncLock) return;
                const messages = Array.from(chatEl.querySelectorAll('[data-ts]'));
                if (!messages.length) return;
                const chatRect = chatEl.getBoundingClientRect();
                const markerY = chatRect.top + chatRect.height * self.tlMarker;
                let topMsg = null;
                for (const el of messages) {
                    if (el.getBoundingClientRect().bottom > markerY) {
                        topMsg = el;
                        break;
                    }
                }
                if (!topMsg) return;
                const ts = topMsg.dataset.ts;
                if (!ts) return;
                const groups = self.splitDiffs;
                if (!groups.length) return;
                let target = groups[0];
                for (const g of groups) {
                    if (g.timestamp <= ts) target = g;
                }
                if (_lastChatTs === target.timestamp) return;
                _lastChatTs = target.timestamp;
                self.activeDiffTs = target.timestamp;
                if (!panel) return;
                for (const el of panel.querySelectorAll('[data-diff-ts]')) {
                    if (el.dataset.diffTs === target.timestamp) {
                        lock();
                        const pRect = panel.getBoundingClientRect();
                        const gRect = el.getBoundingClientRect();
                        panel.scrollBy({
                            top: gRect.top - (pRect.top + pRect.height * self.tlMarker),
                            behavior: 'smooth'
                        });
                        break;
                    }
                }
            };

            chatEl.addEventListener('scroll', onChatScroll, {
                passive: true
            });
            this._scrollListener = {
                el: chatEl,
                fn: onChatScroll
            };
            onChatScroll();
        },

        async loadSessionDetailFiles() {
            const s = this.selectedSession;
            if (!s || this.sessionSummaries[s.sessionId]) return;
            try {
                const data = await fetch(`/api/sessions/${s.projectDir}/${s.sessionId}/summary`).then(r => r.json());
                this.sessionSummaries = {
                    ...this.sessionSummaries,
                    [s.sessionId]: data
                };
            } catch {}
        },

        goToFileSearch(filePath) {
            this.selectedSession = null;
            this.view = 'sessions';
            this.sessionsTab = 'files';
            this.filesQuery = filePath;
            this.$nextTick(() => {
                this.searchFiles();
                // Load recent files only if not already loaded
                if (this.recentFiles.length === 0) this.loadRecentFiles();
            });
        },

        async toggleSessionSummary(session) {
            const id = session.sessionId;
            if (this.expandedSessions[id]) {
                this.expandedSessions = {
                    ...this.expandedSessions,
                    [id]: false
                };
                return;
            }
            this.expandedSessions = {
                ...this.expandedSessions,
                [id]: true
            };
            if (this.sessionSummaries[id]) return; // already loaded
            try {
                const data = await fetch(`/api/sessions/${session.projectDir}/${id}/summary`).then(r => r.json());
                this.sessionSummaries = {
                    ...this.sessionSummaries,
                    [id]: data
                };
            } catch {}
        },

        async loadRecentFiles() {
            if (this.recentFiles.length > 0) return; // already loaded
            this.recentFilesLoading = true;
            try {
                this.recentFiles = await fetch('/api/files/recent?limit=40').then(r => r.json());
            } catch {
                this.recentFiles = [];
            }
            this.recentFilesLoading = false;
        },

        filesAutocomplete() {
            const q = this.filesQuery.trim();
            this.filesSuggestIdx = -1;
            if (!q || this.recentFiles.length === 0) {
                this.filesSuggestions = [];
                return;
            }
            let re;
            try {
                re = new RegExp(q, 'i');
            } catch {
                re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
            }
            this.filesSuggestions = this.recentFiles.filter(f => re.test(f.filePath)).slice(0, 10);
            // Also trigger search after debounce
            clearTimeout(this._filesSearchTimer);
            this._filesSearchTimer = setTimeout(() => this.searchFiles(), 400);
        },

        selectFilesSuggestion(sug) {
            this.filesQuery = sug.filePath;
            this.filesSuggestions = [];
            this.searchFiles();
        },

        async searchFiles() {
            const q = this.filesQuery.trim();
            if (!q) {
                this.filesResults = [];
                return;
            }
            this.filesLoading = true;
            try {
                this.filesResults = await fetch(`/api/files/touched?q=${encodeURIComponent(q)}`).then(r => r.json());
            } catch {
                this.filesResults = [];
            }
            this.filesLoading = false;
        },

        filesGrouped() {
            // Group results by file path
            const groups = {};
            for (const r of this.filesResults) {
                if (!groups[r.filePath]) groups[r.filePath] = [];
                groups[r.filePath].push(r);
            }
            return groups;
        },

        timelineBranches() {
            const seen = new Set();
            const branches = [];
            for (const s of this.sessions) {
                const b = s.gitBranch || '';
                if (!seen.has(b)) {
                    seen.add(b);
                    branches.push(b);
                }
            }
            return branches.slice(0, 12);
        },

        fmtDuration(secs) {
            if (secs < 60) return secs + 's';
            if (secs < 3600) return Math.round(secs / 60) + 'm';
            return Math.floor(secs / 3600) + 'h ' + Math.round((secs % 3600) / 60) + 'm';
        },

        async openSession(session) {
            this.closeLiveStream();
            this.selectedSession = session;
            this.sessionDetailTab = 'chat';
            this.loadingDetail = true;
            this.sessionDetail = null;
            this.activeDiffTs = null;
            this._bmIdx = 0;

            window.location.hash = `#/session/${session.projectDir}/${session.sessionId}`;
            const data = await fetch(`/api/sessions/${session.projectDir}/${session.sessionId}`).then(r => r.json());
            this.sessionDetail = data;
            this.loadingDetail = false;
            this.$nextTick(() => {
                const el = document.getElementById('chat-col');
                if (el) el.scrollTop = 0;
                this.initScrollSync();
            });
            this.loadSessionDiffs();
            this.loadSessionBookmarks();
            if (this.isActiveSession(session.sessionId)) this.openLiveStream(session);
        },

        async openSessionById(sessionId, projectDir) {
            const s = this.sessions.find(x => x.sessionId === sessionId) || {
                sessionId,
                projectDir,
                firstPrompt: '',
                gitBranch: '',
                modified: ''
            };
            if (!s.projectDir) s.projectDir = projectDir;
            this.view = 'sessions';
            await this.openSession(s);
        },


        async resumeSession(sessionId, btnId, projectPath) {
            const cmd = projectPath ?
                `cd "${projectPath}" && claude --resume ${sessionId} "continue"` :
                `claude --resume ${sessionId} "continue"`;
            const btn = document.getElementById(btnId);
            try {
                await navigator.clipboard.writeText(cmd);
                if (btn) {
                    const orig = btn.textContent;
                    btn.textContent = 'Copied!';
                    btn.classList.add('btn-copied', 'copied');
                    setTimeout(() => {
                        btn.textContent = orig;
                        btn.classList.remove('btn-copied', 'copied');
                    }, 2000);
                }
            } catch {
                prompt('Copy this command:', cmd);
            }
        },

        startResize(e) {
            const startX = e.clientX;
            const startW = this.sidebarW;
            const handle = e.currentTarget;
            handle.classList.add('is-dragging');
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
            const onMove = (e) => {
                this.sidebarW = Math.max(160, Math.min(520, startW + (e.clientX - startX)));
            };
            const onUp = () => {
                handle.classList.remove('is-dragging');
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
                localStorage.setItem('cm:sidebarW', this.sidebarW);
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
            };
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        },

        toggleNav() {
            const el = document.querySelector('.sidebar');
            el.classList.add('nav-animating');
            if (this.navWidth <= 56) {
                this.navWidth = parseInt(localStorage.getItem('cs:navWidthFull') || '224');
            } else {
                localStorage.setItem('cs:navWidthFull', this.navWidth);
                this.navWidth = 44;
            }
            localStorage.setItem('cs:navWidth', this.navWidth);
            setTimeout(() => el.classList.remove('nav-animating'), 220);
        },
        startNavResize(e) {
            const startX = e.clientX;
            const startW = this.navWidth;
            this._navDragging = true;
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
            const ICON_W = 44,
                SNAP_IN = 80,
                MIN_FULL = 160,
                MAX_W = 400;
            const onMove = (ev) => {
                const w = startW + (ev.clientX - startX);
                if (w < SNAP_IN) {
                    this.navWidth = ICON_W;
                } else {
                    this.navWidth = Math.max(MIN_FULL, Math.min(MAX_W, w));
                }
            };
            const onUp = () => {
                this._navDragging = false;
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
                if (this.navWidth > ICON_W) localStorage.setItem('cs:navWidthFull', this.navWidth);
                localStorage.setItem('cs:navWidth', this.navWidth);
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
            };
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        },

        async deleteSession() {
            if (!this.selectedSession) return;
            if (!confirm(`Delete session "${this.selectedSession.firstPrompt || this.selectedSession.sessionId}"? This cannot be undone.`)) return;
            this.deletingSession = true;
            const {
                project,
                sessionId
            } = this.selectedSession;
            const res = await fetch(`/api/sessions/${encodeURIComponent(project)}/${sessionId}`, {
                method: 'DELETE'
            });
            this.deletingSession = false;
            if (res.ok) {
                this.sessions = this.sessions.filter(s => s.sessionId !== sessionId);
                this.projectSessions = (this.projectSessions || []).filter(s => s.sessionId !== sessionId);
                this.selectedSession = null;
                this.sessionDetail = null;
            } else {
                alert('Error deleting session');
            }
        },

        async exportSession(download) {
            if (!this.selectedSession) return;
            const {
                project,
                sessionId
            } = this.selectedSession;
            const url = `/api/sessions/${encodeURIComponent(project)}/${sessionId}/export`;
            if (download) {
                const a = document.createElement('a');
                a.href = url;
                a.download = `${sessionId}.md`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            }
        },

        async copySessionMd() {
            if (!this.selectedSession) return;
            const {
                project,
                sessionId
            } = this.selectedSession;
            const url = `/api/sessions/${encodeURIComponent(project)}/${sessionId}/export`;
            const md = await fetch(url).then(r => r.text());
            await navigator.clipboard.writeText(md);
            this.exportMsg = 'Copied!';
            setTimeout(() => {
                this.exportMsg = '';
            }, 2500);
        },

        async deletePlan() {
            if (!this.selectedPlan) return;
            if (!confirm(`Delete plan "${this.selectedPlan.title}"? This cannot be undone.`)) return;
            const res = await fetch(`/api/plans/${encodeURIComponent(this.selectedPlan.filename)}`, {
                method: 'DELETE'
            });
            if (res.ok) {
                this.plans = this.plans.filter(p => p.filename !== this.selectedPlan.filename);
                this.selectedPlan = null;
            } else {
                alert('Error deleting plan');
            }
        },

        async savePlanEdit() {
            if (!this.selectedPlan) return;
            const content = this.planBodyDraft;
            this.planSaving = true;
            this.planMsg = '';
            try {
                const res = await fetch('/api/plans/' + encodeURIComponent(this.selectedPlan.filename), {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        content
                    })
                });
                if (!res.ok) throw new Error((await res.json()).error || 'Error');
                const updated = await res.json();
                this.selectedPlan.content = updated.content;
                this.selectedPlan.title = updated.title;
                this.selectedPlan.modified = updated.modified;
                const idx = this.plans.findIndex(p => p.filename === updated.filename);
                if (idx >= 0) this.plans[idx] = {
                    ...this.plans[idx],
                    ...updated
                };
                this.planEditing = false;
                this.planMsg = 'Saved';
                setTimeout(() => {
                    this.planMsg = '';
                }, 2000);
            } catch (e) {
                this.planMsg = e.message;
            } finally {
                this.planSaving = false;
            }
        },

        downloadPlan() {
            if (!this.selectedPlan) return;
            const blob = new Blob([this.selectedPlan.content], {
                type: 'text/markdown'
            });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = this.selectedPlan.filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(a.href);
        },

        async copyPlanMd() {
            if (!this.selectedPlan) return;
            await navigator.clipboard.writeText(this.selectedPlan.content);
            this.planExportMsg = 'Copied!';
            setTimeout(() => {
                this.planExportMsg = '';
            }, 2500);
        },

        async renameNoteFile() {
            if (!this.selectedNote) return;
            let name = this.noteFilenameDraft.trim();
            if (!name) return;
            if (!name.endsWith('.md')) name += '.md';
            if (name === this.selectedNote.filename) {
                this.noteRenamingFile = false;
                return;
            }
            const res = await fetch(`/api/notes/${this.selectedNote.path}/rename`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    newFilename: name
                })
            }).then(r => r.json());
            if (res.error) {
                alert(res.error);
                return;
            }
            const idx = this.personalNotes.findIndex(n => n.path === this.selectedNote.path);
            if (idx !== -1) this.personalNotes.splice(idx, 1, res);
            this.selectedNote = res;
            this.noteRenamingFile = false;
            window.location.hash = '#/note/' + res.path;
        },

        async copyNoteMd() {
            if (!this.selectedNote) return;
            const md = `# ${this.selectedNote.title}\n\n${this.selectedNote.content}`;
            await navigator.clipboard.writeText(md);
            this.noteExportMsg = 'Copied!';
            setTimeout(() => {
                this.noteExportMsg = '';
            }, 2500);
        },

        async doSearch() {
            if (this.searchQuery.length < 2) {
                this.searchResults = [];
                return;
            }
            this.searchLoading = true;
            const params = new URLSearchParams({
                q: this.searchQuery
            });
            if (this.searchProject) params.set('project', this.searchProject);
            this.searchResults = await fetch(`/api/search?${params}`).then(r => r.json());
            this.searchLoading = false;
        },

        async loadMemory() {
            if (this.memoryFiles.length > 0) return;
            this.memoryLoading = true;
            this.memoryFiles = await fetch('/api/memory').then(r => r.json());
            this.memoryLoading = false;
            const first = this.memoryFiles.find(f => f.type !== 'index') || this.memoryFiles[0];
            if (first) this.selectedMemory = first;
        },

        memoryGrouped() {
            const order = ['index', 'user', 'feedback', 'project', 'reference', 'unknown'];
            const groups = {};
            for (const f of this.memoryFiles) {
                const t = f.type || 'unknown';
                if (!groups[t]) groups[t] = [];
                groups[t].push(f);
            }
            return order.filter(t => groups[t]).map(t => [t, groups[t]]);
        },

        memoryProjects() {
            return [...new Set(this.memoryFiles.map(f => f.projectDir))];
        },

        memoryTypeIcon(type) {
            const icons = {
                index: `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="10" height="10"/><line x1="4" y1="5" x2="10" y2="5"/><line x1="4" y1="7.5" x2="10" y2="7.5"/><line x1="4" y1="10" x2="7" y2="10"/></svg>`,
                user: `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="7" cy="5" r="2.5"/><path d="M2 12c0-2.76 2.24-5 5-5s5 2.24 5 5"/></svg>`,
                feedback: `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="10" height="8"/><path d="M5 10l-2 2V10"/></svg>`,
                project: `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 5h10v7H2z"/><path d="M2 5V4a1 1 0 011-1h2.5l1.5 2"/></svg>`,
                reference: `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 3H3a1 1 0 00-1 1v7a1 1 0 001 1h8a1 1 0 001-1V8"/><path d="M9 2h3v3"/><line x1="12" y1="2" x2="7" y2="7"/></svg>`,
                unknown: `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="10" height="10"/></svg>`,
            };
            return icons[type] || icons.unknown;
        },

        async loadStats() {
            if (this.stats) return;
            this.statsLoading = true;
            this.stats = await fetch('/api/stats').then(r => r.json());
            this.statsLoading = false;
        },

        async toggleSubagent(block, projectDir, sessionId) {
            if (block._subagentOpen) {
                block._subagentOpen = false;
                return;
            }
            if (block._subagentMessages) {
                block._subagentOpen = true;
                return;
            }
            block._subagentLoading = true;
            const cacheKey = `${projectDir}/${sessionId}`;
            let agentList = this.subagentCache[cacheKey];
            if (!agentList) {
                agentList = await fetch(`/api/sessions/${projectDir}/${sessionId}/subagents`).then(r => r.json());
                this.subagentCache[cacheKey] = agentList;
            }
            const match = agentList.find(a => a.agentType === block.input?.subagent_type) || agentList[0];
            if (match) {
                const data = await fetch(`/api/sessions/${projectDir}/${sessionId}/subagents/${match.agentId}`).then(r => r.json());
                block._subagentMessages = data.messages;
            } else {
                block._subagentMessages = [];
            }
            block._subagentLoading = false;
            block._subagentOpen = true;
        },

        groupedByDate() {
            const groups = {};
            const now = new Date();
            const today = now.toISOString().slice(0, 10);
            const yesterday = new Date(now - 86400000).toISOString().slice(0, 10);
            const weekAgo = new Date(now - 7 * 86400000).toISOString().slice(0, 10);
            const monthAgo = new Date(now - 30 * 86400000).toISOString().slice(0, 10);
            for (const s of this.sessions) {
                if (!s.modified) {
                    if (!groups['Older']) groups['Older'] = [];
                    groups['Older'].push(s);
                    continue;
                }
                const d = s.modified.slice(0, 10);
                let label;
                if (d === today) label = 'Today';
                else if (d === yesterday) label = 'Yesterday';
                else if (d >= weekAgo) label = 'This week';
                else if (d >= monthAgo) label = 'This month';
                else label = 'Older';
                if (!groups[label]) groups[label] = [];
                groups[label].push(s);
            }
            const order = ['Today', 'Yesterday', 'This week', 'This month', 'Older'];
            const ordered = {};
            for (const k of order)
                if (groups[k]) ordered[k] = groups[k];
            return ordered;
        },

        branchColor(branch) {
            if (!branch) return '#C8C2BA';
            let h = 0;
            for (let i = 0; i < branch.length; i++) h = (h * 31 + branch.charCodeAt(i)) >>> 0;
            return `hsl(${h % 360}, 45%, 42%)`;
        },

        getUserBlocks(msg) {
            const content = msg.message?.content;
            const blocks = typeof content === 'string' ? [{
                type: 'text',
                text: content
            }] : Array.isArray(content) ? content : [];
            return blocks.map(b => {
                if (b.type !== 'text') return b;
                const m = b.text?.match(/<command-name>([^<]+)<\/command-name>/);
                if (m) return {
                    type: 'slash-command',
                    command: m[1].startsWith('/') ? m[1] : '/' + m[1]
                };
                return b;
            });
        },

        getAssistantBlocks(msg) {
            const content = msg.message?.content;
            if (Array.isArray(content)) return content;
            return [];
        },

        msgHasText(msg) {
            if (msg.type === 'user') {
                return this.getUserBlocks(msg).some(b => b.type === 'text' && b.text?.trim());
            }
            if (msg.type === 'assistant') {
                return this.getAssistantBlocks(msg).some(b => b.type === 'text' && b.text?.trim());
            }
            return true;
        },

        getSubagentText(msg) {
            const content = msg.message?.content;
            if (typeof content === 'string') return content;
            if (Array.isArray(content)) return content.map(c => c.text || c.thinking || '').join(' ');
            return '';
        },

        getToolSummary(block) {
            const input = block.input || {};
            if (block.name === 'Bash') return (input.command || '').slice(0, 60);
            if (block.name === 'Read') return input.file_path?.split('/').slice(-2).join('/') || '';
            if (block.name === 'Write') return input.file_path?.split('/').slice(-2).join('/') || '';
            if (block.name === 'Edit') return input.file_path?.split('/').slice(-2).join('/') || '';
            if (block.name === 'Glob') return input.pattern || '';
            if (block.name === 'Grep') return input.pattern || '';
            if (block.name === 'Agent') return (input.description || '').slice(0, 50);
            return '';
        },

        renderMd(text) {
            try {
                return marked.parse(text);
            } catch {
                return text;
            }
        },

        renderNotesMd(text) {
            const processed = text.replace(/(^|[^&\w])#([a-zA-Z][\w-]+)/g, (match, pre, slug) => {
                const note = this.personalNotes.find(n => {
                    const base = n.filename.replace(/\.md$/, '');
                    const slugPart = base.replace(/^\d{4}-\d{2}-\d{2}-/, '');
                    return slugPart === slug || base === slug;
                });
                if (!note) return match;
                return `${pre}[#${slug}](#/note/${note.path})`;
            });
            let html;
            try {
                html = marked.parse(processed);
            } catch {
                html = processed;
            }
            // Mark note-ref links so we can style/intercept them
            html = html.replace(/href="#\/note\//g, 'class="note-ref-link" href="#/note/');
            // Inject + buttons into paragraphs and list items
            const btn = '<button class="para-add-task-btn" data-tooltip="Add to Today">+</button>';
            html = html.replace(/<p>/g, `<p>${btn}`);
            html = html.replace(/<li>/g, `<li>${btn}`);
            // Highlight search matches in text nodes only (between > and <)
            if (this.noteSearch) {
                const q = this.noteSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const re = new RegExp(q, 'gi');
                html = html.replace(/>([^<]+)</g, (_, text) => '>' + text.replace(re, '<mark>$&</mark>') + '<');
            }
            return html;
        },

        handleNoteLinkClick(e) {
            const btn = e.target.closest('.para-add-task-btn');
            if (btn) {
                e.preventDefault();
                const block = btn.closest('p,li');
                const text = block ? block.innerText.replace('+', '').trim() : '';
                if (text) this.addNoteTask(text, this.selectedNote || this.noteHovered);
                return;
            }
            const a = e.target.closest('a.note-ref-link');
            if (!a) return;
            e.preventDefault();
            const notepath = a.getAttribute('href').replace('#/note/', '');
            const note = this.personalNotes.find(n => n.path === notepath);
            if (note) {
                this.selectedNote = note;
                this.noteEditing = false;
                window.location.hash = '#/note/' + note.path;
            }
        },

        noteAllFolders() {
            const fromNotes = this.personalNotes.map(n => n.folder ?? '').filter(Boolean);
            return [...new Set([...this.noteFolders, ...fromNotes])].sort();
        },

        noteFolderNotes() {
            const q = this.noteSearch.toLowerCase();
            const filtered = this.personalNotes.filter(n => {
                // When searching, skip folder filter to search across all notes
                if (!q && (n.folder ?? '') !== this.noteFolderPath) return false;
                if (this.noteTagFilter.length > 0 && !this.noteTagFilter.some(t => (n.tags || []).includes(t))) return false;
                if (!q) return true;
                return n.title.toLowerCase().includes(q) || (n.content || '').toLowerCase().includes(q);
            });
            return filtered.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
        },

        async createFolder() {
            if (!this.newFolderName.trim()) return;
            const res = await fetch('/api/notes/folders', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    name: this.newFolderName.trim()
                }),
            }).then(r => r.json()).catch(() => null);
            if (res?.name && !this.noteFolders.includes(res.name)) {
                this.noteFolders.push(res.name);
                this.noteFolders.sort();
            }
            this.noteCreatingFolder = false;
            this.newFolderName = '';
        },

        async renameFolderConfirm(oldName) {
            const newName = this.noteRenameFolderDraft.trim();
            if (!newName || newName === oldName) {
                this.noteRenamingFolder = null;
                return;
            }
            const res = await fetch(`/api/notes/folders/${encodeURIComponent(oldName)}/rename`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    newName
                }),
            }).then(r => r.json()).catch(() => null);
            if (!res?.name) {
                alert(res?.error || 'Rename failed');
                return;
            }
            // Update noteFolders list
            const idx = this.noteFolders.indexOf(oldName);
            if (idx !== -1) this.noteFolders.splice(idx, 1, res.name);
            else {
                this.noteFolders.push(res.name);
            }
            this.noteFolders.sort();
            // Update folder field in all affected notes
            for (const n of this.personalNotes) {
                if ((n.folder ?? '') === oldName) {
                    n.folder = res.name;
                    n.path = res.name + '/' + n.filename;
                }
            }
            if (this.noteFolderPath === oldName) this.noteFolderPath = res.name;
            if (this.selectedNote?.folder === oldName) {
                this.selectedNote.folder = res.name;
                this.selectedNote.path = res.name + '/' + this.selectedNote.filename;
            }
            this.noteRenamingFolder = null;
            this.noteRenameFolderDraft = '';
        },

        async deleteFolderConfirm(action) {
            const folder = this.deletingFolder;
            if (!folder) return;
            const res = await fetch(`/api/notes/folders/${encodeURIComponent(folder)}?action=${action}`, {
                method: 'DELETE',
            }).then(r => r.json()).catch(() => null);
            if (!res?.ok) {
                alert(res?.error || 'Error al borrar la carpeta');
                return;
            }
            this.noteFolders = this.noteFolders.filter(f => f !== folder);
            if (action === 'orphan') {
                for (const n of this.personalNotes) {
                    if ((n.folder ?? '') === folder) {
                        n.folder = '';
                        n.path = n.filename;
                    }
                }
                if (this.selectedNote?.folder === folder) {
                    this.selectedNote.folder = '';
                    this.selectedNote.path = this.selectedNote.filename;
                }
            } else {
                this.personalNotes = this.personalNotes.filter(n => (n.folder ?? '') !== folder);
                if (this.selectedNote?.folder === folder) {
                    this.selectedNote = null;
                    this.noteEditing = false;
                }
            }
            if (this.noteFolderPath === folder) {
                this.noteFolderPath = '';
                this.selectedNote = null;
            }
            this.deletingFolder = null;
        },

        noteAllTags() {
            const counts = {};
            const scoped = this.personalNotes.filter(n => (n.folder ?? '') === this.noteFolderPath);
            for (const n of scoped) {
                for (const t of (n.tags || [])) counts[t] = (counts[t] || 0) + 1;
            }
            return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([tag, count]) => ({
                tag,
                count
            }));
        },

        async renameTag(oldName, newName) {
            newName = newName.trim();
            if (!newName || newName === oldName) {
                this.noteTagMenu = null;
                this.noteTagRenaming = false;
                return;
            }
            const res = await fetch(`/api/notes/tags/${encodeURIComponent(oldName)}/rename`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    newName
                }),
            }).then(r => r.json()).catch(() => null);
            if (!res || res.error) {
                alert(res?.error || 'Rename failed');
                return;
            }
            for (const n of this.personalNotes) {
                if ((n.tags || []).includes(oldName)) {
                    n.tags = n.tags.map(t => t === oldName ? res.to : t);
                }
            }
            if (this.noteTagFilter.includes(oldName)) {
                this.noteTagFilter.splice(this.noteTagFilter.indexOf(oldName), 1, res.to);
            }
            if (this.selectedNote?.tags?.includes(oldName)) {
                this.selectedNote.tags = this.selectedNote.tags.map(t => t === oldName ? res.to : t);
            }
            this.noteTagMenu = null;
            this.noteTagRenaming = false;
        },

        async deleteTag(name) {
            if (!confirm(`Remove tag "${name}" from all notes?`)) return;
            const res = await fetch(`/api/notes/tags/${encodeURIComponent(name)}`, {
                    method: 'DELETE'
                })
                .then(r => r.json()).catch(() => null);
            if (!res || res.error) {
                alert(res?.error || 'Delete failed');
                return;
            }
            for (const n of this.personalNotes) {
                if ((n.tags || []).includes(name)) n.tags = n.tags.filter(t => t !== name);
            }
            const fi = this.noteTagFilter.indexOf(name);
            if (fi !== -1) this.noteTagFilter.splice(fi, 1);
            if (this.selectedNote?.tags?.includes(name)) {
                this.selectedNote.tags = this.selectedNote.tags.filter(t => t !== name);
            }
            this.noteTagMenu = null;
        },

        noteTokens(note) {
            const STOP = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'that', 'this', 'it', 'its', 'as', 'if', 'not', 'no', 'so', 'up', 'out', 'de', 'la', 'el', 'en', 'que', 'se', 'los', 'las', 'un', 'una', 'con', 'por', 'para', 'como', 'más', 'una', 'sus', 'del', 'al', 'lo', 'le', 'les', 'nos', 'pero', 'fue', 'si', 'ya', 'también', 'este', 'esta', 'estos', 'estas', 'hay', 'una']);
            const text = (note.title + ' ' + (note.content || '')).toLowerCase();
            return new Set(text.match(/[a-záéíóúüñ]{3,}/g)?.filter(w => !STOP.has(w)) || []);
        },

        noteRelated(note, limit = 4) {
            if (!note) return [];
            const ta = this.noteTokens(note);
            if (ta.size === 0) return [];
            const backlinked = new Set(this.noteBacklinks(note).map(n => n.filename));
            return this.personalNotes
                .filter(n => n.filename !== note.filename && !backlinked.has(n.filename))
                .map(n => {
                    const tb = this.noteTokens(n);
                    const shared = [...ta].filter(w => tb.has(w)).length;
                    const score = shared / Math.sqrt(ta.size * tb.size);
                    return {
                        note: n,
                        score
                    };
                })
                .filter(x => x.score > 0.08)
                .sort((a, b) => b.score - a.score)
                .slice(0, limit)
                .map(x => x.note);
        },

        noteBacklinks(note) {
            if (!note) return [];
            const slug = note.filename.replace(/\.md$/, '').replace(/^\d{4}-\d{2}-\d{2}-/, '');
            const fullBase = note.filename.replace(/\.md$/, '');
            return this.personalNotes.filter(n => {
                if (n.filename === note.filename) return false;
                return n.content && (n.content.includes('#' + slug) || n.content.includes('#' + fullBase));
            });
        },

        noteEditorInput(e) {
            const ta = e.target;
            const val = ta.value;
            const pos = ta.selectionStart;
            // Find # trigger: look back from cursor for #word (no spaces)
            const before = val.slice(0, pos);
            const m = before.match(/#([a-zA-Z][\w-]*)$/);
            if (m) {
                const query = m[1].toLowerCase();
                const results = this.personalNotes.filter(n => {
                    const base = n.filename.replace(/\.md$/, '').replace(/^\d{4}-\d{2}-\d{2}-/, '');
                    return base.includes(query) || n.title.toLowerCase().includes(query);
                }).slice(0, 6);
                this.noteAutocomplete = {
                    visible: results.length > 0,
                    query: m[1],
                    results,
                    pos: 0
                };
            } else {
                this.noteAutocomplete.visible = false;
            }
        },

        noteEditorKeydown(e) {
            const ac = this.noteAutocomplete;
            if (!ac.visible) return;
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                ac.pos = Math.min(ac.pos + 1, ac.results.length - 1);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                ac.pos = Math.max(ac.pos - 1, 0);
            } else if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault();
                this.noteAutocompleteSelect(ac.results[ac.pos]);
            } else if (e.key === 'Escape') {
                ac.visible = false;
            }
        },

        noteAutocompleteSelect(note) {
            const slug = note.filename.replace(/\.md$/, '').replace(/^\d{4}-\d{2}-\d{2}-/, '');
            const ta = document.querySelector('textarea.note-body-ta');
            if (!ta) return;
            const pos = ta.selectionStart;
            const before = ta.value.slice(0, pos);
            const after = ta.value.slice(pos);
            const replaced = before.replace(/#([a-zA-Z][\w-]*)$/, '#' + slug);
            this.noteBodyDraft = replaced + after;
            this.noteAutocomplete.visible = false;
            this.$nextTick(() => {
                ta.focus();
                ta.selectionStart = ta.selectionEnd = replaced.length;
            });
        },

        renderInlineCode(text) {
            const esc = text
                .replace(/&/g, '&amp;').replace(/</g, '&lt;')
                .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
            return esc.replace(/`([^`\n]+)`/g, (_, code) => {
                const decoded = code.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"');
                return `<code class="inline-code hljs">${hljsInline(decoded)}</code>`;
            });
        },

        shortProjectName(p) {
            if (!p) return 'unknown';
            const parts = p.replace(/\\/g, '/').split('/');
            return parts[parts.length - 1] || parts[parts.length - 2] || p;
        },

        shortModelName(m) {
            if (!m) return '';
            if (m.includes('opus')) return 'Opus';
            if (m.includes('sonnet')) return 'Sonnet';
            if (m.includes('haiku')) return 'Haiku';
            return m.split('-').slice(1, 3).join('-');
        },

        formatDate(iso) {
            if (!iso) return '';
            const d = new Date(iso);
            const diff = new Date() - d;
            if (diff < 86400000) return d.toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit'
            });
            if (diff < 604800000) {
                const days = Math.floor(diff / 86400000);
                return days === 1 ? 'Yesterday' : `${days}d ago`;
            }
            return d.toLocaleDateString([], {
                month: 'short',
                day: 'numeric'
            });
        },

        formatTime(iso) {
            if (!iso) return '';
            return new Date(iso).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit'
            });
        },

        fmtNum(n) {
            if (!n) return '0';
            if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
            if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
            return String(n);
        },

        highlightMatch(m) {
            const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            return esc(m.snippet.slice(0, m.matchStart)) +
                `<span class="search-match">${esc(m.snippet.slice(m.matchStart, m.matchStart + m.matchLen))}</span>` +
                esc(m.snippet.slice(m.matchStart + m.matchLen));
        },

        highlightText(text, query) {
            if (!query || query.length < 2) return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const re = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
            return esc(text).replace(re, m => `<span class="search-match">${m}</span>`);
        },

        topBranch() {
            if (!this.stats?.sessionsByBranch) return '—';
            const e = Object.entries(this.stats.sessionsByBranch);
            if (!e.length) return '—';
            return e.sort((a, b) => b[1] - a[1])[0][0].split('/').pop();
        },

        topBranches() {
            if (!this.stats?.sessionsByBranch) return [];
            return Object.entries(this.stats.sessionsByBranch).sort((a, b) => b[1] - a[1]).slice(0, 10);
        },

        topBranchCount() {
            const b = this.topBranches();
            return b.length ? b[0][1] : 1;
        },

        async loadCosts() {
            if (Object.keys(this.sessionCosts).length > 0) return;
            this.costsLoading = true;
            const data = await fetch('/api/costs').then(r => r.json());
            const costs = {},
                carbon = {};
            for (const [id, v] of Object.entries(data)) {
                if (v && typeof v === 'object') {
                    costs[id] = v.cost;
                    carbon[id] = v.carbon;
                } else costs[id] = v;
            }
            this.sessionCosts = costs;
            this.sessionCarbon = carbon;
            this.costsLoading = false;
        },

        budgetStatus() {
            if (!this.budgetMonthly || !this.insights?.byDate) return null;
            const monthPrefix = new Date().toISOString().slice(0, 7);
            const monthCost = Object.entries(this.insights.byDate)
                .filter(([d]) => d.startsWith(monthPrefix))
                .reduce((sum, [, v]) => sum + v, 0);
            const pct = monthCost / this.budgetMonthly;
            return {
                monthCost,
                pct,
                status: pct >= 1 ? 'over' : pct >= 0.8 ? 'warn' : 'ok'
            };
        },

        async saveBudget() {
            this.budgetMsg = '';
            try {
                const v = parseFloat(this.budgetMonthlyDraft) || 0;
                await fetch('/api/app-settings', {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        budgetMonthly: v
                    })
                });
                this.budgetMonthly = v;
                this.budgetMsg = 'Saved';
                setTimeout(() => {
                    this.budgetMsg = '';
                }, 2000);
            } catch (e) {
                this.budgetMsg = 'Error: ' + e.message;
            }
        },

        async loadTemplates() {
            if (this.templates.length > 0) return;
            this.templatesLoading = true;
            this.templates = await fetch('/api/templates').then(r => r.json()).catch(() => []);
            this.templatesLoading = false;
        },

        async loadWebmd() {
            if (this.webmdItems.length > 0) return;
            this.webmdItemsLoading = true;
            this.webmdItems = await fetch('/api/webmd').then(r => r.json()).catch(() => []);
            this.webmdItemsLoading = false;
        },

        async fetchWebmd() {
            if (!this.webmdUrl.trim()) return;
            this.webmdLoading = true;
            this.webmdError = '';
            this.webmdResult = null;
            try {
                const r = await fetch('/api/webmd/fetch', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        url: this.webmdUrl.trim()
                    })
                });
                const data = await r.json();
                if (!r.ok) throw new Error(data.error || 'Error desconocido');
                this.webmdResult = data;
            } catch (e) {
                this.webmdError = e.message;
            }
            this.webmdLoading = false;
        },

        async saveWebmd() {
            if (!this.webmdResult) return;
            this.webmdError = '';
            try {
                const r = await fetch('/api/webmd/save', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        url: this.webmdUrl.trim(),
                        title: this.webmdResult.title,
                        markdown: this.processedWebmd()
                    })
                });
                const entry = await r.json();
                if (!r.ok) throw new Error(entry.error || 'Error desconocido');
                this.webmdItems.unshift(entry);
            } catch (e) {
                this.webmdError = e.message;
            }
        },

        async deleteWebmd(slug) {
            await fetch('/api/webmd/' + slug, {
                method: 'DELETE'
            });
            this.webmdItems = this.webmdItems.filter(i => i.slug !== slug);
        },

        processedWebmd() {
            if (!this.webmdResult) return '';
            let md = this.webmdResult.markdown;
            if (!this.webmdOptTitle) md = md.replace(/^#[^\n]*\n+/, '');
            if (this.webmdOptLinks) md = md.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
            if (this.webmdOptClean) {
                md = md.replace(/!\[[^\]]*\]\([^)]*\)/g, ''); // remove images
                md = md.replace(/^(Title:|URL:|Published:|Source:)[^\n]*\n?/gm, ''); // Jina metadata lines
                md = md.replace(/\n{3,}/g, '\n\n').trim(); // collapse blank lines
            }
            return md;
        },

        copyWebmd() {
            navigator.clipboard.writeText(this.processedWebmd()).catch(() => {});
        },

        async createTemplate() {
            this.templateNew.saving = true;
            this.templateNew.msg = '';
            try {
                const r = await fetch('/api/templates', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        name: this.templateNew.name,
                        description: this.templateNew.description,
                        content: this.templateNew.content
                    })
                });
                if (!r.ok) throw new Error((await r.json()).error);
                const t = await r.json();
                this.templates.push(t);
                this.templateNew.open = false;
            } catch (e) {
                this.templateNew.msg = e.message;
            }
            this.templateNew.saving = false;
        },

        async updateTemplate(id, name, description, content) {
            try {
                const r = await fetch('/api/templates/' + id, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        name,
                        description,
                        content
                    })
                });
                if (!r.ok) throw new Error((await r.json()).error);
                const updated = await r.json();
                const idx = this.templates.findIndex(t => t.id === id);
                if (idx !== -1) this.templates[idx] = updated;
            } catch (e) {
                alert('Error: ' + e.message);
            }
        },

        async deleteTemplate(id) {
            if (!confirm('Delete this template?')) return;
            await fetch('/api/templates/' + id, {
                method: 'DELETE'
            });
            this.templates = this.templates.filter(t => t.id !== id);
        },

        copyTemplate(t) {
            navigator.clipboard.writeText(t.content).catch(() => {
                const el = document.createElement('textarea');
                el.value = t.content;
                document.body.appendChild(el);
                el.select();
                document.execCommand('copy');
                document.body.removeChild(el);
            });
            this.templateCopied = t.id;
            setTimeout(() => {
                this.templateCopied = null;
            }, 2000);
        },

        async loadInsights(force = false) {
            if (this.insights && !force) return;
            this.insightsLoading = true;
            this.insights = await fetch('/api/insights' + (force ? '?refresh=1' : '')).then(r => r.json());
            this.insightsLoading = false;
        },

        async loadStatus() {
            this.status = await fetch('/api/status').then(r => r.json()).catch(() => null);
        },

        // ── Write actions ──────────────────────────────────────────────────

        instrNewFilePath() {
            const n = this.instrNew;
            const proj = this.projects?.find(p => p.dirName === this.configProject)?.projectPath || '';
            if (n.scope === 'user') {
                const name = (n.customName || 'CLAUDE.md').replace(/[^a-zA-Z0-9._-]/g, '');
                return {
                    filePath: null,
                    filename: name.endsWith('.md') ? name : name + '.md'
                };
            }
            const map = {
                'CLAUDE.md': proj + '/CLAUDE.md',
                '.claude/CLAUDE.md': proj + '/.claude/CLAUDE.md',
                '.claude/CLAUDE.local.md': proj + '/.claude/CLAUDE.local.md',
                'custom': proj + '/' + (n.customName || 'CLAUDE.md'),
            };
            return {
                filePath: map[n.preset] || map['CLAUDE.md'],
                filename: null
            };
        },

        async createClaudeMd() {
            const n = this.instrNew;
            n.saving = true;
            n.msg = '';
            try {
                const {
                    filePath,
                    filename
                } = this.instrNewFilePath();
                const body = {
                    content: n.content
                };
                if (filePath) body.filePath = filePath;
                else body.filename = filename;
                const r = await fetch('/api/config/claude-md', {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(body)
                });
                if (!r.ok) throw new Error((await r.json()).error);
                n.open = false;
                n.content = '';
                n.customName = '';
                this.config = null;
                await this.loadConfig();
            } catch (e) {
                n.msg = 'Error: ' + e.message;
            }
            n.saving = false;
        },

        async deleteClaudeMd(f) {
            if (!confirm(`Delete ${f.filename}?`)) return;
            try {
                const body = f._path ? {
                    filePath: f._path
                } : {
                    filename: f.filename
                };
                const r = await fetch('/api/config/claude-md', {
                    method: 'DELETE',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(body)
                });
                if (!r.ok) throw new Error((await r.json()).error);
                this.config = null;
                await this.loadConfig();
            } catch (e) {
                alert('Error: ' + e.message);
            }
        },

        async saveClaudeMd() {
            this.claudeMdEdit.saving = true;
            this.claudeMdEdit.msg = '';
            try {
                const body = {
                    content: this.claudeMdEdit.draft
                };
                if (this.claudeMdEdit._path) body.filePath = this.claudeMdEdit._path;
                else body.filename = this.claudeMdEdit.filename;
                const r = await fetch('/api/config/claude-md', {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(body),
                });
                if (!r.ok) throw new Error((await r.json()).error);
                // Update in-memory config
                const f = this.config.claudeMdFiles.find(f => f.filename === this.claudeMdEdit.filename && (f._scope || 'user') === (this.claudeMdEdit._scope || 'user'));
                if (f) f.content = this.claudeMdEdit.draft;
                this.claudeMdEdit.active = false;
                this.claudeMdEdit.msg = 'Saved';
            } catch (e) {
                this.claudeMdEdit.msg = 'Error: ' + e.message;
            }
            this.claudeMdEdit.saving = false;
        },

        async loadAgents() {
            if (this.agents.length > 0) return;
            this.agentsLoading = true;
            const projectPath = this.projects?.find(p => p.dirName === this.configProject)?.projectPath || '';
            const pp = projectPath ? '?projectPath=' + encodeURIComponent(projectPath) : '';
            this.agents = await fetch('/api/tools/agents' + pp).then(r => r.json());
            this.agentsLoading = false;
            if (this.agents.length > 0 && !this.selectedAgent) this.selectedAgent = this.agents[0];
        },

        async loadAgentsMarketplace() {
            if (this.agentsMarketplace.length > 0) return;
            this.agentsMarketplaceLoading = true;
            try {
                const d = await fetch('/api/agents-marketplace/registry').then(r => r.json());
                this.agentsMarketplace = d.items || [];
                this.agentsMarketplaceErrors = d.errors || [];
                if (this.agentsMarketplace.length > 0) {
                    const slugs = this.agentsMarketplace.map(a => a.slug).join(',');
                    const projectPath = this.projects?.find(p => p.dirName === this.configProject)?.projectPath || '';
                    const pp = projectPath ? '&projectPath=' + encodeURIComponent(projectPath) : '';
                    this.agentsMarketplaceInstalled = await fetch('/api/agents-marketplace/check-installed?slugs=' + encodeURIComponent(slugs) + pp).then(r => r.json());
                }
            } catch {}
            this.agentsMarketplaceLoading = false;
        },

        async loadAgentsMarketplaceSources() {
            this.agentsMarketplaceSources = await fetch('/api/agents-marketplace/sources').then(r => r.json()).catch(() => []);
        },

        async installAgentFromMarketplace() {
            const sel = this.agentsMarketplaceSelected;
            if (!sel) return;
            this.agentsMarketplaceInstalling = true;
            this.agentsMarketplaceInstallMsg = '';
            const projectPath = this.projects?.find(p => p.dirName === this.configProject)?.projectPath || '';
            try {
                const r = await fetch('/api/agents-marketplace/install', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        slug: sel.slug,
                        name: sel.name,
                        description: sel.description,
                        content: sel.content,
                        scope: this.agentsMarketplaceInstallScope,
                        projectPath
                    }),
                });
                const d = await r.json();
                if (!r.ok) throw new Error(d.error);
                this.agentsMarketplaceInstallMsg = '✓ Instalado';
                this.agentsMarketplaceInstalled[sel.slug] = true;
                this.agents = [];
                await this.loadAgents();
            } catch (e) {
                this.agentsMarketplaceInstallMsg = 'Error: ' + e.message;
            }
            this.agentsMarketplaceInstalling = false;
        },

        async loadCommandsMarketplace() {
            if (this.commandsMarketplace.length > 0) return;
            this.commandsMarketplaceLoading = true;
            try {
                const d = await fetch('/api/commands-marketplace/registry').then(r => r.json());
                this.commandsMarketplace = d.items || [];
                this.commandsMarketplaceErrors = d.errors || [];
                if (this.commandsMarketplace.length > 0) {
                    const slugs = this.commandsMarketplace.map(c => c.slug).join(',');
                    const projectPath = this.projects?.find(p => p.dirName === this.configProject)?.projectPath || '';
                    const pp = projectPath ? '&projectPath=' + encodeURIComponent(projectPath) : '';
                    this.commandsMarketplaceInstalled = await fetch('/api/commands-marketplace/check-installed?slugs=' + encodeURIComponent(slugs) + pp).then(r => r.json());
                }
            } catch {}
            this.commandsMarketplaceLoading = false;
        },

        async installCommandFromMarketplace() {
            const sel = this.commandsMarketplaceSelected;
            if (!sel) return;
            this.commandsMarketplaceInstalling = true;
            this.commandsMarketplaceInstallMsg = '';
            const projectPath = this.projects?.find(p => p.dirName === this.configProject)?.projectPath || '';
            try {
                const r = await fetch('/api/commands-marketplace/install', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        slug: sel.slug,
                        name: sel.name,
                        description: sel.description,
                        content: sel.content,
                        scope: this.commandsMarketplaceInstallScope,
                        projectPath
                    }),
                });
                const d = await r.json();
                if (!r.ok) throw new Error(d.error);
                this.commandsMarketplaceInstallMsg = '✓ Instalado';
                this.commandsMarketplaceInstalled[sel.slug] = true;
                this.toolCommands = [];
                this.toolSkills = [];
                await this.loadTools();
            } catch (e) {
                this.commandsMarketplaceInstallMsg = 'Error: ' + e.message;
            }
            this.commandsMarketplaceInstalling = false;
        },

        filteredAgentsMarketplace() {
            let list = this.agentsMarketplace;
            if (this.agentsMarketplaceSourceFilter !== 'all') list = list.filter(s => s._source === this.agentsMarketplaceSourceFilter);
            const q = this.agentsMarketplaceSearch.trim().toLowerCase();
            if (!q) return list;
            return list.filter(s => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q));
        },

        async addAgentsMarketplaceSource() {
            const f = this.agentsMarketplaceSourceForm;
            f.saving = true;
            f.msg = '';
            try {
                const r = await fetch('/api/agents-marketplace/sources', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        name: f.name,
                        owner: f.owner,
                        repo: f.repo,
                        branch: f.branch || 'main',
                        itemsPath: f.itemsPath || ''
                    }),
                });
                const d = await r.json();
                if (!r.ok) throw new Error(d.error);
                f.msg = '✓ Added';
                f.open = false;
                Object.assign(f, {
                    name: '',
                    owner: '',
                    repo: '',
                    branch: 'main',
                    itemsPath: ''
                });
                this.agentsMarketplace = [];
                await this.loadAgentsMarketplaceSources();
                await this.loadAgentsMarketplace();
            } catch (e) {
                f.msg = 'Error: ' + e.message;
            } finally {
                f.saving = false;
            }
        },

        async removeAgentsMarketplaceSource(id) {
            await fetch(`/api/agents-marketplace/sources/${encodeURIComponent(id)}`, {
                method: 'DELETE'
            });
            this.agentsMarketplace = [];
            await this.loadAgentsMarketplaceSources();
            await this.loadAgentsMarketplace();
        },

        filteredCommandsMarketplace() {
            const q = this.commandsMarketplaceSearch.trim().toLowerCase();
            if (!q) return this.commandsMarketplace;
            return this.commandsMarketplace.filter(s =>
                s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)
            );
        },

        async addCommandsMarketplaceSource() {
            const f = this.commandsMarketplaceSourceForm;
            f.saving = true;
            f.msg = '';
            try {
                const r = await fetch('/api/commands-marketplace/sources', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        name: f.name,
                        owner: f.owner,
                        repo: f.repo,
                        branch: f.branch || 'main',
                        itemsPath: f.itemsPath || ''
                    }),
                });
                const d = await r.json();
                if (!r.ok) throw new Error(d.error);
                f.msg = '✓ Added';
                f.open = false;
                Object.assign(f, {
                    name: '',
                    owner: '',
                    repo: '',
                    branch: 'main',
                    itemsPath: ''
                });
                this.commandsMarketplace = [];
                await this.loadCommandsMarketplaceSources();
                await this.loadCommandsMarketplace();
            } catch (e) {
                f.msg = 'Error: ' + e.message;
            } finally {
                f.saving = false;
            }
        },

        async removeCommandsMarketplaceSource(id) {
            await fetch(`/api/commands-marketplace/sources/${encodeURIComponent(id)}`, {
                method: 'DELETE'
            });
            this.commandsMarketplace = [];
            await this.loadCommandsMarketplaceSources();
            await this.loadCommandsMarketplace();
        },

        async loadCommandsMarketplaceSources() {
            this.commandsMarketplaceSources = await fetch('/api/commands-marketplace/sources').then(r => r.json()).catch(() => []);
        },

        async createAgent() {
            const n = this.agentNew;
            n.saving = true;
            n.msg = '';
            if (!n.slug) {
                n.msg = 'El slug es obligatorio';
                n.saving = false;
                return;
            }
            try {
                const projectPath = this.projects?.find(p => p.dirName === this.configProject)?.projectPath || '';
                const r = await fetch('/api/tools/agents', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        slug: n.slug,
                        name: n.name || n.slug,
                        description: n.description,
                        tools: n.tools,
                        color: n.color,
                        content: n.content,
                        scope: n.scope,
                        projectPath
                    }),
                });
                const d = await r.json();
                if (!r.ok) throw new Error(d.error);
                n.open = false;
                this.agents = [];
                await this.loadAgents();
                this.selectedAgent = this.agents.find(a => a.slug === n.slug) || this.agents[0] || null;
            } catch (e) {
                n.msg = 'Error: ' + e.message;
            }
            n.saving = false;
        },

        async saveAgent() {
            const e = this.agentEdit;
            e.saving = true;
            e.msg = '';
            try {
                const projectPath = this.projects?.find(p => p.dirName === this.configProject)?.projectPath || '';
                const r = await fetch('/api/tools/agents/' + encodeURIComponent(this.selectedAgent.slug), {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        name: e.draftName,
                        description: e.draftDesc,
                        tools: e.draftTools,
                        color: e.draftColor,
                        content: e.draft,
                        scope: this.selectedAgent._scope,
                        projectPath
                    }),
                });
                const d = await r.json();
                if (!r.ok) throw new Error(d.error);
                Object.assign(this.selectedAgent, {
                    name: e.draftName,
                    description: e.draftDesc,
                    tools: e.draftTools.split(',').map(t => t.trim()).filter(Boolean),
                    color: e.draftColor,
                    content: e.draft
                });
                const idx = this.agents.findIndex(a => a.slug === this.selectedAgent.slug && a._scope === this.selectedAgent._scope);
                if (idx !== -1) Object.assign(this.agents[idx], this.selectedAgent);
                e.active = false;
                e.msg = 'Guardado';
            } catch (err) {
                e.msg = 'Error: ' + err.message;
            }
            e.saving = false;
        },

        async deleteAgent(a) {
            if (!confirm(`Delete el agente "${a.name}"?`)) return;
            try {
                const projectPath = this.projects?.find(p => p.dirName === this.configProject)?.projectPath || '';
                const r = await fetch('/api/tools/agents/' + encodeURIComponent(a.slug), {
                    method: 'DELETE',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        scope: a._scope,
                        projectPath
                    }),
                });
                if (!r.ok) throw new Error((await r.json()).error);
                this.agents = this.agents.filter(x => !(x.slug === a.slug && x._scope === a._scope));
                if (this.selectedAgent?.slug === a.slug && this.selectedAgent?._scope === a._scope) {
                    this.selectedAgent = this.agents[0] || null;
                    this.agentEdit.active = false;
                }
            } catch (e) {
                alert('Error: ' + e.message);
            }
        },

        async createSkill() {
            const n = this.skillNew;
            n.saving = true;
            n.msg = '';
            if (!n.slug) {
                n.msg = 'El slug es obligatorio';
                n.saving = false;
                return;
            }
            try {
                const projectPath = this.projects?.find(p => p.dirName === this.configProject)?.projectPath || '';
                const r = await fetch('/api/tools/skills', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        slug: n.slug,
                        name: n.name || n.slug,
                        description: n.description,
                        content: n.content,
                        scope: n.scope,
                        projectPath
                    }),
                });
                const d = await r.json();
                if (!r.ok) throw new Error(d.error);
                n.open = false;
                this.toolCommands = [];
                this.toolSkills = [];
                await this.loadTools();
                this.selectedTool = this.toolSkills.find(s => s.slug === n.slug) || this.toolSkills[0] || null;
            } catch (e) {
                n.msg = 'Error: ' + e.message;
            }
            n.saving = false;
        },

        async saveSkill() {
            const e = this.skillEdit;
            e.saving = true;
            e.msg = '';
            try {
                const projectPath = this.projects?.find(p => p.dirName === this.configProject)?.projectPath || '';
                const r = await fetch('/api/tools/skills/' + encodeURIComponent(this.selectedTool.slug), {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        name: e.draftName,
                        description: e.draftDesc,
                        content: e.draft,
                        scope: this.selectedTool._scope,
                        projectPath
                    }),
                });
                const d = await r.json();
                if (!r.ok) throw new Error(d.error);
                // Update in-memory
                this.selectedTool.name = e.draftName;
                this.selectedTool.description = e.draftDesc;
                this.selectedTool.content = e.draft;
                const idx = this.toolSkills.findIndex(s => s.slug === this.selectedTool.slug && s._scope === this.selectedTool._scope);
                if (idx !== -1) Object.assign(this.toolSkills[idx], {
                    name: e.draftName,
                    description: e.draftDesc,
                    content: e.draft
                });
                e.active = false;
                e.msg = 'Guardado';
            } catch (err) {
                e.msg = 'Error: ' + err.message;
            }
            e.saving = false;
        },

        async deleteCommand(t) {
            if (!confirm(`Delete el comando "${t.name}"?`)) return;
            try {
                const projectPath = this.projects?.find(p => p.dirName === this.configProject)?.projectPath || '';
                const r = await fetch('/api/tools/commands/' + encodeURIComponent(t.slug), {
                    method: 'DELETE',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        scope: t._scope,
                        namespace: t.namespace === 'user' || t.namespace === 'project' ? null : t.namespace,
                        projectPath
                    }),
                });
                if (!r.ok) throw new Error((await r.json()).error);
                this.toolCommands = this.toolCommands.filter(c => !(c.slug === t.slug && c._scope === t._scope && c.namespace === t.namespace));
                if (this.selectedTool?.slug === t.slug && this.selectedTool?._scope === t._scope) {
                    this.selectedTool = this.toolCommands[0] || null;
                }
            } catch (e) {
                alert('Error: ' + e.message);
            }
        },

        async deleteSkill(t) {
            if (!confirm(`Delete la skill "${t.name}"?`)) return;
            try {
                const projectPath = this.projects?.find(p => p.dirName === this.configProject)?.projectPath || '';
                const r = await fetch('/api/tools/skills/' + encodeURIComponent(t.slug), {
                    method: 'DELETE',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        scope: t._scope,
                        projectPath
                    }),
                });
                if (!r.ok) throw new Error((await r.json()).error);
                this.toolSkills = this.toolSkills.filter(s => !(s.slug === t.slug && s._scope === t._scope));
                if (this.selectedTool?.slug === t.slug && this.selectedTool?._scope === t._scope) {
                    this.selectedTool = this.toolSkills[0] || null;
                    this.skillEdit.active = false;
                }
            } catch (e) {
                alert('Error: ' + e.message);
            }
        },

        async addHook() {
            const b = this.hookBuilder;
            b.saving = true;
            b.msg = '';
            try {
                const projectPath = this.projects?.find(p => p.dirName === this.configProject)?.projectPath || '';
                const scope = this.configProject ? (b.scope || 'project') : 'user';
                const r = await fetch('/api/config/hooks', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        event: b.event,
                        matcher: b.matcher,
                        type: b.type,
                        command: b.command,
                        url: b.url,
                        prompt: b.prompt,
                        scope,
                        projectPath
                    }),
                });
                const d = await r.json();
                if (!r.ok) throw new Error(d.error);
                b.open = false;
                b.matcher = '';
                b.command = '';
                b.url = '';
                b.prompt = '';
                this.config = null;
                await this.loadConfig();
            } catch (e) {
                b.msg = 'Error: ' + e.message;
            }
            b.saving = false;
        },

        hookTemplates() {
            return [{
                    name: 'Notify on finish',
                    desc: 'macOS notification when Claude stops responding',
                    event: 'Stop',
                    matcher: '',
                    type: 'command',
                    command: `osascript -e 'display notification "Claude finished" with title "Claude Code" sound name "Glass"'`
                },
                {
                    name: 'Log session start',
                    desc: 'Append session start + working dir to hooks.log',
                    event: 'SessionStart',
                    matcher: '',
                    type: 'command',
                    command: `echo "[$(date -Iseconds)] Session started in $PWD" >> ${this.status?.claudeDir || '~/.claude'}/hooks.log`
                },
                {
                    name: 'Git status on start',
                    desc: 'Print git status when a session begins',
                    event: 'SessionStart',
                    matcher: '',
                    type: 'command',
                    command: `git status --short 2>/dev/null || true`
                },
                {
                    name: 'Block rm -rf',
                    desc: 'Cancel any Bash command containing rm -rf (exit 2)',
                    event: 'PreToolUse',
                    matcher: 'Bash',
                    type: 'command',
                    command: `python3 -c "import json,sys; d=json.load(sys.stdin); c=d.get('tool_input',{}).get('command',''); (sys.stderr.write('BLOCKED: rm -rf\\n'), sys.exit(2)) if 'rm -rf' in c else None"`
                },
                {
                    name: 'Block force push',
                    desc: 'Cancel git push --force commands (exit 2)',
                    event: 'PreToolUse',
                    matcher: 'Bash',
                    type: 'command',
                    command: `python3 -c "import json,sys; d=json.load(sys.stdin); c=d.get('tool_input',{}).get('command',''); (sys.stderr.write('BLOCKED: force push\\n'), sys.exit(2)) if 'git push' in c and ('--force' in c or ' -f ' in c) else None"`
                },
                {
                    name: 'Audit Bash commands',
                    desc: 'Append every shell command run to bash-audit.log',
                    event: 'PostToolUse',
                    matcher: 'Bash',
                    type: 'command',
                    command: `python3 -c "import json,sys,os,datetime; d=json.load(sys.stdin); c=d.get('tool_input',{}).get('command','')[:200]; open(os.path.expanduser('${this.status?.claudeDir || '~/.claude'}/bash-audit.log'),'a').write(datetime.datetime.now().isoformat()+' '+c+'\\n')"`
                },
                {
                    name: 'Audit file edits',
                    desc: 'Log every edited file path to edit-audit.log',
                    event: 'PostToolUse',
                    matcher: 'Edit',
                    type: 'command',
                    command: `python3 -c "import json,sys,os,datetime; d=json.load(sys.stdin); p=d.get('tool_input',{}).get('file_path','?'); open(os.path.expanduser('${this.status?.claudeDir || '~/.claude'}/edit-audit.log'),'a').write(datetime.datetime.now().isoformat()+' '+p+'\\n')"`
                },
                {
                    name: 'HTTP webhook on stop',
                    desc: 'POST to a webhook URL when Claude finishes',
                    event: 'Stop',
                    matcher: '',
                    type: 'http',
                    url: 'https://your-webhook.example.com/claude-stop'
                },
            ];
        },

        applyHookTemplate(t) {
            this.hookBuilder.event = t.event;
            this.hookBuilder.matcher = t.matcher || '';
            this.hookBuilder.type = t.type;
            this.hookBuilder.command = t.command || '';
            this.hookBuilder.url = t.url || '';
            this.hookBuilder.prompt = t.prompt || '';
            this.hookBuilder._tpl = t.name;
            this.hookBuilder.open = true;
        },

        async installHookTemplate(t) {
            const b = this.hookBuilder;
            b.saving = true;
            b.msg = '';
            try {
                const scope = this.configProject ? (b.scope || 'user') : 'user';
                const projectPath = this.configProject || null;
                const r = await fetch('/api/config/hooks', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        event: t.event,
                        matcher: t.matcher || '',
                        type: t.type,
                        command: t.command || '',
                        url: t.url || '',
                        prompt: t.prompt || '',
                        scope,
                        projectPath
                    }),
                });
                const d = await r.json();
                if (!r.ok) throw new Error(d.error);
                this.config = null;
                await this.loadConfig();
            } catch (e) {
                b.msg = 'Error: ' + e.message;
            }
            b.saving = false;
        },

        configDisabledHooks() {
            if (!this.config?.settings?._hiddenHooks) return [];
            return this.config.settings._hiddenHooks.map((h, i) => ({
                hiddenIndex: i,
                event: h.event,
                matcher: h.matcherEntry?.matcher || '',
                type: h.matcherEntry?.hooks?.[0]?.type || 'command',
                command: h.matcherEntry?.hooks?.[0]?.command || '',
                url: h.matcherEntry?.hooks?.[0]?.url || '',
                prompt: h.matcherEntry?.hooks?.[0]?.prompt || '',
            }));
        },

        findTemplate(h) {
            const val = h.command || h.url || h.prompt;
            return this.hookTemplates().find(t => (t.command || t.url || t.prompt) === val) || null;
        },

        async runHookTest(h) {
            this.hookTest = {
                active: true,
                event: h.event,
                matcherIndex: h.matcherIndex,
                running: true,
                result: null
            };
            try {
                const r = await fetch('/api/config/hooks/test', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        type: h.type,
                        command: h.command,
                        url: h.url,
                        event: h.event
                    }),
                });
                this.hookTest.result = await r.json();
            } catch (e) {
                this.hookTest.result = {
                    exitCode: -1,
                    stdout: '',
                    stderr: e.message,
                    duration: 0
                };
            }
            this.hookTest.running = false;
        },

        async toggleHook(h) {
            const projectPath = this.projects?.find(p => p.dirName === this.configProject)?.projectPath || '';
            try {
                const r = await fetch('/api/config/hooks/toggle', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        event: h.event,
                        matcherIndex: h.matcherIndex,
                        scope: h._scope || 'user',
                        projectPath
                    }),
                });
                const d = await r.json();
                if (!r.ok) throw new Error(d.error);
                if (this.hookEdit.active && this.hookEdit.event === h.event && this.hookEdit.matcherIndex === h.matcherIndex) this.hookEdit.active = false;
                this.config = null;
                await this.loadConfig();
            } catch (e) {
                alert('Error: ' + e.message);
            }
        },

        async enableHook(hiddenIndex) {
            try {
                const r = await fetch('/api/config/hooks/enable', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        hiddenIndex
                    }),
                });
                const d = await r.json();
                if (!r.ok) throw new Error(d.error);
                this.config.settings = d.settings;
            } catch (e) {
                alert('Error: ' + e.message);
            }
        },

        startHookEdit(h) {
            this.hookEdit = {
                active: true,
                event: h.event,
                matcherIndex: h.matcherIndex,
                type: h.type,
                draft: h.command || h.url || h.prompt,
                saving: false,
                msg: '',
                _scope: h._scope || 'user'
            };
        },

        async saveHookEdit() {
            const e = this.hookEdit;
            e.saving = true;
            e.msg = '';
            try {
                const projectPath = this.projects?.find(p => p.dirName === this.configProject)?.projectPath || '';
                const body = {
                    event: e.event,
                    matcherIndex: e.matcherIndex,
                    scope: e._scope || 'user',
                    projectPath
                };
                if (e.type === 'http') body.url = e.draft;
                else if (e.type === 'prompt' || e.type === 'agent') body.prompt = e.draft;
                else body.command = e.draft;
                const r = await fetch('/api/config/hooks', {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(body),
                });
                const d = await r.json();
                if (!r.ok) throw new Error(d.error);
                e.active = false;
                this.config = null;
                await this.loadConfig();
            } catch (err) {
                e.msg = 'Error: ' + err.message;
            }
            e.saving = false;
        },

        async deleteHook(h) {
            if (!confirm(`Delete this ${h.event} hook?`)) return;
            const projectPath = this.projects?.find(p => p.dirName === this.configProject)?.projectPath || '';
            try {
                const r = await fetch('/api/config/hooks', {
                    method: 'DELETE',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        event: h.event,
                        matcherIndex: h.matcherIndex,
                        scope: h._scope || 'user',
                        projectPath
                    }),
                });
                const d = await r.json();
                if (!r.ok) throw new Error(d.error);
                this.config = null;
                await this.loadConfig();
            } catch (e) {
                alert('Error: ' + e.message);
            }
        },

        async loadHooksLog() {
            this.hooksLogLoading = true;
            const projectPath = this.projects?.find(p => p.dirName === this.configProject)?.projectPath || '';
            const pp = projectPath ? '?projectPath=' + encodeURIComponent(projectPath) : '';
            this.hooksLog = await fetch('/api/hooks/log' + pp).then(r => r.json());
            this.hooksLogLoading = false;
        },

        async moveHook(h, targetScope) {
            if (!targetScope) return;
            const projectPath = this.projects?.find(p => p.dirName === this.configProject)?.projectPath || '';
            try {
                const r = await fetch('/api/config/hooks/move', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        fromScope: h._scope || 'user',
                        toScope: targetScope,
                        event: h.event,
                        matcherIndex: h.matcherIndex,
                        projectPath
                    }),
                });
                const d = await r.json();
                if (!r.ok) throw new Error(d.error || 'Error moving hook');
                this.config = null;
                await this.loadConfig();
            } catch (e) {
                alert('Error: ' + e.message);
            }
        },

        async saveGithubToken() {
            this.githubTokenSaving = true;
            this.githubTokenMsg = '';
            try {
                const r = await fetch('/api/app-settings', {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        githubToken: this.githubTokenDraft
                    })
                });
                if (!r.ok) throw new Error((await r.json()).error);
                this.githubTokenSet = !!this.githubTokenDraft;
                this.githubTokenMasked = this.githubTokenDraft ? this.githubTokenDraft.slice(0, 4) + '…' + this.githubTokenDraft.slice(-4) : '';
                this.githubTokenDraft = '';
                this.githubTokenMsg = 'Saved';
                setTimeout(() => this.githubTokenMsg = '', 2000);
            } catch (e) {
                this.githubTokenMsg = 'Error: ' + e.message;
            }
            this.githubTokenSaving = false;
        },

        async shareSession() {
            this.shareMsg = 'Sharing…';
            this.shareUrl = '';
            try {
                const r = await fetch(`/api/share/session/${this.selectedSession.projectDir}/${this.selectedSession.sessionId}`, {
                    method: 'POST'
                });
                const data = await r.json();
                if (!r.ok) throw new Error(data.error);
                this.shareUrl = data.url;
                await navigator.clipboard.writeText(data.url);
                this.shareMsg = 'Link copied!';
            } catch (e) {
                this.shareMsg = e.message;
            }
            setTimeout(() => {
                this.shareMsg = '';
                this.shareUrl = '';
            }, 5000);
        },

        async shareNote() {
            if (!this.selectedNote) return;
            this.noteShareMsg = 'Sharing…';
            try {
                const r = await fetch(`/api/share/note/${this.selectedNote.path}`, {
                    method: 'POST'
                });
                const data = await r.json();
                if (!r.ok) throw new Error(data.error);
                await navigator.clipboard.writeText(data.url);
                this.noteShareMsg = 'Link copied!';
            } catch (e) {
                this.noteShareMsg = e.message;
            }
            setTimeout(() => this.noteShareMsg = '', 5000);
        },

        async sharePlan(filename) {
            this.planShareMsg = 'Sharing…';
            try {
                const r = await fetch(`/api/share/plan/${filename}`, {
                    method: 'POST'
                });
                const data = await r.json();
                if (!r.ok) throw new Error(data.error);
                await navigator.clipboard.writeText(data.url);
                this.planShareMsg = 'Link copied!';
            } catch (e) {
                this.planShareMsg = e.message;
            }
            setTimeout(() => this.planShareMsg = '', 5000);
        },

        async openNewNote() {
            this.noteNewTitle = '';
            this.noteNewBody = '';
            this.noteNewTags = '';
            this.noteNewFolder = this.noteFolderPath;
            this.noteFromClipboard = false;
            this.noteCreating = true;
            try {
                const text = await navigator.clipboard.readText();
                if (text && text.trim().length > 0) {
                    this.noteNewBody = text.trim();
                    this.noteFromClipboard = true;
                }
            } catch (e) {
                /* clipboard access denied or empty */ }
        },

        promoteScratch() {
            this.noteNewTitle = '';
            this.noteNewBody = this.scratchContent;
            this.noteFromClipboard = false;
            this.scratchActive = false;
            this.noteCreating = true;
        },

        async loadPersonalNotes() {
            if (this.personalNotesLoading) return;
            this.personalNotesLoading = true;
            const [notes, status, folders] = await Promise.all([
                fetch('/api/notes').then(r => r.json()).catch(() => []),
                fetch('/api/notes/claude-md-status').then(r => r.json()).catch(() => ({})),
                fetch('/api/notes/folders').then(r => r.json()).catch(() => []),
            ]);
            this.personalNotes = notes;
            this.noteClaudeInstalled = status.installed ?? null;
            this.noteFolders = Array.isArray(folders) ? folders : [];
            this.personalNotesLoading = false;
        },

        async checkNoteClaudeStatus() {
            const s = await fetch('/api/notes/claude-md-status').then(r => r.json()).catch(() => ({}));
            this.noteClaudeInstalled = s.installed ?? null;
        },

        async setupClaudeNotes() {
            this.noteSetupMsg = 'Installing…';
            try {
                const r = await fetch('/api/notes/setup-claude', {
                    method: 'POST'
                });
                const d = await r.json();
                this.noteClaudeInstalled = true;
                this.noteSetupMsg = d.alreadyInstalled ? 'Already installed' : 'Installed!';
            } catch (e) {
                this.noteSetupMsg = 'Error: ' + e.message;
            }
            setTimeout(() => this.noteSetupMsg = '', 3000);
        },

        async createPersonalNote() {
            if (!this.noteNewTitle.trim()) return;
            this.noteSaving = true;
            try {
                const note = await fetch('/api/notes', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        title: this.noteNewTitle,
                        content: this.noteNewBody,
                        tags: this.noteNewTags ? this.noteNewTags.split(',').map(t => t.trim()).filter(Boolean) : [],
                        folder: this.noteNewFolder
                    }),
                }).then(r => r.json());
                this.personalNotes.unshift(note);
                this.selectedNote = note;
                this.noteCreating = false;
                this.noteNewTitle = '';
                this.noteNewBody = '';
                this.noteNewTags = '';
                this.noteEditing = false;
            } catch (e) {
                this.noteMsg = 'Error: ' + e.message;
            }
            this.noteSaving = false;
        },

        async savePersonalNote() {
            if (!this.selectedNote) return;
            this.noteSaving = true;
            this.noteMsg = '';
            try {
                const updated = await fetch(`/api/notes/${this.selectedNote.path}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        title: this.noteTitleDraft,
                        content: this.noteBodyDraft,
                        tags: this.noteTagsDraft.split(',').map(t => t.trim()).filter(Boolean)
                    }),
                }).then(r => r.json());
                const idx = this.personalNotes.findIndex(n => n.filename === this.selectedNote.filename);
                if (idx !== -1) this.personalNotes[idx] = updated;
                this.selectedNote = updated;
                this.noteEditing = false;
                this.noteMsg = 'Saved';
                setTimeout(() => this.noteMsg = '', 2000);
            } catch (e) {
                this.noteMsg = 'Error: ' + e.message;
            }
            this.noteSaving = false;
        },

        async deletePersonalNote() {
            if (!this.selectedNote || !confirm(`Delete "${this.selectedNote.title}"?`)) return;
            await fetch(`/api/notes/${this.selectedNote.path}`, {
                method: 'DELETE'
            });
            this.personalNotes = this.personalNotes.filter(n => n.filename !== this.selectedNote.filename);
            this.selectedNote = null;
            this.noteEditing = false;
        },

        async togglePinNote() {
            if (!this.selectedNote) return;
            const newPinned = !this.selectedNote.pinned;
            const updated = await fetch(`/api/notes/${this.selectedNote.path}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    pinned: newPinned
                }),
            }).then(r => r.json());
            if (updated.error) {
                alert(updated.error);
                return;
            }
            const idx = this.personalNotes.findIndex(n => n.path === this.selectedNote.path);
            if (idx !== -1) this.personalNotes.splice(idx, 1, updated);
            this.selectedNote = updated;
        },


        async movePersonalNote(targetFolder) {
            if (!this.selectedNote || targetFolder === '__current__') return;
            const currentFolder = this.selectedNote.folder ?? '';
            if (targetFolder === currentFolder) return;
            const updated = await fetch(`/api/notes/${this.selectedNote.path}/move`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    folder: targetFolder
                }),
            }).then(r => r.json());
            if (updated.error) {
                alert(updated.error);
                return;
            }
            const idx = this.personalNotes.findIndex(n => n.path === this.selectedNote.path);
            if (idx !== -1) this.personalNotes.splice(idx, 1, updated);
            this.selectedNote = updated;
            this.noteFolderPath = targetFolder;
            window.location.hash = `#/note/${updated.path}`;
        },

        async snapshotSession() {
            if (!this.selectedSession || this.snapshottingSession) return;
            this.snapshottingSession = true;
            try {
                const {
                    projectDir,
                    sessionId
                } = this.selectedSession;
                const note = await fetch(`/api/sessions/${projectDir}/${sessionId}/snapshot`, {
                    method: 'POST',
                }).then(r => r.json());
                if (note.error) {
                    alert(note.error);
                    return;
                }
                if (!this.personalNotes.find(n => n.path === note.path)) this.personalNotes.unshift(note);
                this.selectedNote = note;
                this.noteEditing = false;
                this.view = 'notes';
                this.selectedSession = null;
            } finally {
                this.snapshottingSession = false;
            }
        },

        async loadToday() {
            this.todayLoading = true;
            this.todayData = await fetch('/api/today').then(r => r.json()).catch(() => null);
            this.upcomingTasks = await fetch('/api/today/upcoming').then(r => r.json()).catch(() => []);
            this.todayLoading = false;
        },

        saveToday() {
            clearTimeout(this.todaySaveTimer);
            this.todaySaveTimer = setTimeout(async () => {
                if (!this.todayData) return;
                await fetch('/api/today', {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        context: this.todayData.context,
                        tasks: this.todayData.tasks
                    }),
                });
            }, 400);
        },

        addTodayTask() {
            const text = this.todayNewTask.trim();
            if (!text) return;
            if (!this.todayData) return;
            this.todayData.tasks.push({
                id: Math.random().toString(36).slice(2),
                text,
                done: false,
                carriedOver: false,
                createdAt: new Date().toISOString(),
            });
            this.todayNewTask = '';
            this.saveToday();
        },

        addNoteTask(text, note) {
            if (!text || !this.todayData) return;
            this.todayData.tasks.push({
                id: Math.random().toString(36).slice(2),
                text: text.slice(0, 200),
                done: false,
                carriedOver: false,
                createdAt: new Date().toISOString(),
                noteRef: note ? {
                    title: note.title,
                    path: note.path
                } : undefined,
            });
            this.saveToday();
            // Toast
            const el = document.createElement('div');
            el.className = 'note-task-toast';
            el.textContent = '✓ Added to Today';
            document.body.appendChild(el);
            setTimeout(() => el.remove(), 2000);
        },

        toggleTodayTask(id) {
            const task = this.todayData?.tasks.find(t => t.id === id);
            if (task) {
                task.done = !task.done;
                this.saveToday();
            }
        },

        taskAgeDays(task) {
            if (!task.createdAt) return 0;
            const diff = Date.now() - new Date(task.createdAt).getTime();
            return Math.floor(diff / 86400000);
        },

        formatUpcomingDate(dateStr) {
            const d = new Date(dateStr + 'T12:00:00');
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const diff = Math.round((d - today) / 86400000);
            if (diff === 1) return 'Tomorrow';
            if (diff === 2) return 'Day after tomorrow';
            return d.toLocaleDateString('en-GB', {
                weekday: 'long',
                day: 'numeric',
                month: 'short'
            });
        },

        async pullTask(taskId, fromDate) {
            await fetch('/api/today/pull', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    taskId,
                    fromDate
                })
            });
            this.upcomingTasks = this.upcomingTasks
                .map(g => g.date === fromDate ? {
                    ...g,
                    tasks: g.tasks.filter(t => t.id !== taskId)
                } : g)
                .filter(g => g.tasks.length > 0);
            await this.loadToday();
        },


        async postponeTask(taskId, days) {
            const task = this.todayData?.tasks.find(t => t.id === taskId);
            const target = new Date();
            target.setDate(target.getDate() + days);
            const targetDate = target.toISOString().slice(0, 10);
            await fetch('/api/today/postpone', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    taskId,
                    targetDate
                })
            });
            this.todayData.tasks = this.todayData.tasks.filter(t => t.id !== taskId);
            this.postponeMenuTask = '';
            this.upcomingTasks = await fetch('/api/today/upcoming').then(r => r.json()).catch(() => []);
        },

        deleteTodayTask(id) {
            if (!this.todayData) return;
            this.todayData.tasks = this.todayData.tasks.filter(t => t.id !== id);
            this.saveToday();
        },

        startEditTask(task) {
            this.editingTaskId = task.id;
            this.taskEditText = task.text;
            this.$nextTick(() => {
                const el = document.getElementById('task-edit-' + task.id);
                if (el) {
                    el.focus();
                    el.select();
                }
            });
        },

        commitEditTask(id) {
            const task = this.todayData?.tasks.find(t => t.id === id);
            const text = this.taskEditText.trim();
            if (task && text) {
                task.text = text;
                this.saveToday();
            }
            this.editingTaskId = '';
            this.taskEditText = '';
        },

        copyTodayForClaude() {
            if (!this.todayData) return;
            const date = this.todayData.date;
            const ctx = this.todayData.context ? `\nContext: ${this.todayData.context}` : '';
            const carried = this.todayData.tasks.filter(t => t.carriedOver && !t.done);
            const fresh = this.todayData.tasks.filter(t => !t.carriedOver && !t.done);
            const done = this.todayData.tasks.filter(t => t.done);
            let text = `## My day — ${date}${ctx}\n`;
            if (carried.length) text += `\n### Carried over from yesterday:\n${carried.map(t => `- [ ] ${t.text}`).join('\n')}\n`;
            if (fresh.length) text += `\n### Today's tasks:\n${fresh.map(t => `- [ ] ${t.text}`).join('\n')}\n`;
            if (done.length) text += `\n### Already done:\n${done.map(t => `- [x] ${t.text}`).join('\n')}\n`;
            text += `\nPlease prioritize my pending tasks given the context and suggest a realistic order for today.`;
            navigator.clipboard.writeText(text).then(() => {
                this.todayCopied = true;
                setTimeout(() => this.todayCopied = false, 2000);
            });
        },

        async saveSettings() {
            this.settingsSaving = true;
            this.settingsMsg = '';
            try {
                const r = await fetch('/api/config/settings', {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(this.settingsDraft),
                });
                if (!r.ok) throw new Error((await r.json()).error);
                const {
                    settings
                } = await r.json();
                this.config.settings = settings;
                this.settingsMsg = 'Saved';
                setTimeout(() => this.settingsMsg = '', 2000);
            } catch (e) {
                this.settingsMsg = 'Error: ' + e.message;
            }
            this.settingsSaving = false;
        },

        ruleBuilderPreview() {
            const {
                tool,
                specifier,
                pathType
            } = this.ruleBuilder;
            const spec = specifier.trim();
            if (!spec) return tool;
            if (tool === 'WebFetch') {
                const d = spec.startsWith('domain:') ? spec : 'domain:' + spec;
                return `WebFetch(${d})`;
            }
            if (tool === 'Read' || tool === 'Edit' || tool === 'Write') {
                return `${tool}(${pathType}${spec})`;
            }
            if (tool === 'MCP') {
                const parts = spec.split('/');
                return parts.length >= 2 ? `mcp__${parts[0].trim()}__${parts[1].trim()}` : `mcp__${spec.trim()}`;
            }
            if (tool === 'Agent') return `Agent(${spec})`;
            return `Bash(${spec})`;
        },

        ruleBuilderAdd() {
            const rule = this.ruleBuilderPreview();
            if (!rule) return;
            const type = this.ruleBuilder.type;
            if (!this.permsDraft[type].includes(rule)) {
                this.permsDraft[type].push(rule);
            }
            this.ruleBuilder.specifier = '';
        },

        permissionPresets() {
            return [{
                    name: 'Restrictivo',
                    desc: 'Bloquea shell y escritura. Pide confirmación para todo lo demás.',
                    deny: ['Bash(*)', 'Write(*)'],
                    ask: ['Read(*)', 'Edit(*)'],
                    allow: [],
                },
                {
                    name: 'Estándar',
                    desc: 'Permite comandos comunes. Bloquea acciones peligrosas.',
                    deny: ['Bash(rm -rf *)', 'Bash(git push --force*)'],
                    ask: [],
                    allow: ['Bash(npm *)', 'Bash(git *)', 'Bash(ls *)', 'Bash(cat *)'],
                },
                {
                    name: 'Permisivo',
                    desc: 'Permite todo sin preguntar. Ideal para proyectos personales.',
                    deny: [],
                    ask: [],
                    allow: ['Bash(*)', 'Read(*)', 'Edit(*)', 'Write(*)'],
                },
            ];
        },

        applyPermissionPreset(preset) {
            const addUniq = (arr, rules) => {
                for (const r of rules)
                    if (!arr.includes(r)) arr.push(r);
            };
            addUniq(this.permsDraft.deny, preset.deny);
            addUniq(this.permsDraft.ask, preset.ask);
            addUniq(this.permsDraft.allow, preset.allow);
        },

        ruleToolName(rule) {
            if (rule.startsWith('mcp__')) return 'MCP';
            const m = rule.match(/^([A-Za-z]+)/);
            return m ? m[1] : '?';
        },

        humanizeRule(rule) {
            if (!rule) return '';
            if (rule.startsWith('mcp__')) {
                const parts = rule.split('__');
                if (parts.length === 2) return `Server "${parts[1]}" — all tools`;
                if (parts.length >= 3) return `Server "${parts[1]}" → "${parts[2]}"`;
                return rule;
            }
            const m = rule.match(/^([A-Za-z]+)(?:\((.*)\))?$/);
            if (!m) return rule;
            const [, tool, spec] = m;
            if (!spec) {
                return {
                    Bash: 'Any Bash command',
                    Read: 'Any file read',
                    Edit: 'Any file edit',
                    Write: 'Any file write',
                    WebFetch: 'Any web request',
                    Agent: 'Any subagent'
                } [tool] || tool;
            }
            if (tool === 'Bash') {
                if (spec === '*') return 'Any Bash command';
                if (spec.endsWith(' *')) return `Commands starting with "${spec.slice(0,-2)}"`;
                if (spec.startsWith('* ')) return `Commands ending with "${spec.slice(2)}"`;
                if (spec.includes('*')) return `Commands matching "${spec}"`;
                return `Exact: "${spec}"`;
            }
            if (tool === 'Read' || tool === 'Edit' || tool === 'Write') return `${tool}: ${spec}`;
            if (tool === 'WebFetch') return `Requests to ${spec.replace('domain:','')}`;
            if (tool === 'Agent') return `Subagent: ${spec}`;
            return rule;
        },

        async savePermissions() {
            this.permsSaving = true;
            this.permsMsg = '';
            try {
                const r = await fetch('/api/config/settings', {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        permissions: this.permsDraft
                    }),
                });
                if (!r.ok) throw new Error((await r.json()).error);
                const {
                    settings
                } = await r.json();
                this.config.settings = settings;
                this.permsMsg = 'Saved';
                setTimeout(() => this.permsMsg = '', 2000);
            } catch (e) {
                this.permsMsg = 'Error: ' + e.message;
            }
            this.permsSaving = false;
        },

        async saveMemory() {
            this.memorySaving = true;
            this.memoryMsg = '';
            const f = this.selectedMemory;
            try {
                const r = await fetch(`/api/memory/${encodeURIComponent(f.projectDir)}/${encodeURIComponent(f.filename)}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        content: this.memoryDraft
                    }),
                });
                if (!r.ok) throw new Error((await r.json()).error);
                // Reload memory to reflect changes
                this.memoryFiles = [];
                await this.loadMemory();
                const updated = this.memoryFiles.find(m => m.filename === f.filename && m.projectDir === f.projectDir);
                this.selectedMemory = updated || null;
                this.memoryEditing = false;
                this.memoryMsg = 'Saved';
                setTimeout(() => this.memoryMsg = '', 2000);
            } catch (e) {
                this.memoryMsg = 'Error: ' + e.message;
            }
            this.memorySaving = false;
        },

        async deleteMemory() {
            if (!confirm(`Delete "${this.selectedMemory.name || this.selectedMemory.filename}"?`)) return;
            const f = this.selectedMemory;
            try {
                const r = await fetch(`/api/memory/${encodeURIComponent(f.projectDir)}/${encodeURIComponent(f.filename)}`, {
                    method: 'DELETE'
                });
                if (!r.ok) throw new Error((await r.json()).error);
                this.memoryFiles = [];
                await this.loadMemory();
                this.selectedMemory = null;
                this.memoryEditing = false;
            } catch (e) {
                alert('Error: ' + e.message);
            }
        },

        async createMemory() {
            const {
                type,
                name,
                description,
                body
            } = this.memoryNew;
            if (!name.trim()) return;
            const slug = name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
            const filename = `${type}_${slug}.md`;
            const content = `---\nname: ${name}\ndescription: ${description}\ntype: ${type}\n---\n\n${body}`;
            // Use the first project (or the filtered one)
            const proj = this.memoryFiles[0]?.projectDir || this.projects[0]?.dirName;
            if (!proj) return alert('No project found');
            try {
                const r = await fetch(`/api/memory/${encodeURIComponent(proj)}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        filename,
                        content
                    }),
                });
                if (!r.ok) throw new Error((await r.json()).error);
                this.memoryNewModal = false;
                this.memoryNew = {
                    type: 'feedback',
                    name: '',
                    description: '',
                    body: ''
                };
                this.memoryFiles = [];
                await this.loadMemory();
            } catch (e) {
                alert('Error: ' + e.message);
            }
        },

        weekSessions() {
            const cutoff = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
            return Object.entries(this.stats?.sessionsByDate || {})
                .filter(([d]) => d >= cutoff)
                .reduce((s, [, v]) => s + v, 0);
        },

        weekCost() {
            const cutoff = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
            return Object.entries(this.insights?.byDate || {})
                .filter(([d]) => d >= cutoff)
                .reduce((s, [, v]) => s + v, 0);
        },

        fmtCost(n) {
            if (!n || n < 0.0001) return '$0.00';
            if (n < 0.01) return '$' + n.toFixed(4);
            if (n < 1) return '$' + n.toFixed(3);
            if (n < 100) return '$' + n.toFixed(2);
            return '$' + Math.round(n);
        },

        carbonEquivs(g) {
            if (!g || g < 1) return null;
            const kg = g / 1000;
            const car = Math.round(kg / 0.143); // 143 gCO₂/km EU avg
            const flights = kg / 180; // ~180 kg/pax short EU flight
            const trees = Math.round(kg / 21); // ~21 kg absorbed/tree/year
            const burgers = Math.round(kg / 2.3); // ~2.3 kg CO₂ per beef burger
            const electricity = kg / 200; // ~200 kg CO₂/month EU home
            const fmt = n => n >= 1000 ? (n / 1000).toFixed(1).replace('.', ',') + 'k' : String(Math.round(n));
            return {
                car: fmt(car) + ' km by car',
                flights: flights < 1.5 ? '1 short-haul flight' : flights.toFixed(1) + ' short-haul flights',
                trees: trees + ' tree' + (trees !== 1 ? 's' : '') + ' for a year',
                burgers: fmt(burgers) + ' beef burgers',
                electricity: electricity < 1.5 ? '1 month of home electricity' : electricity.toFixed(1) + ' months of home electricity',
            };
        },

        fmtCarbon(g) {
            if (!g || g < 0.001) return null;
            if (g < 1) return (g * 1000).toFixed(0) + 'mg CO₂';
            if (g < 1000) return g.toFixed(1) + 'g CO₂';
            return (g / 1000).toFixed(2) + 'kg CO₂';
        },

        fmtTokensM(n) {
            if (!n) return '0';
            return (n / 1_000_000).toFixed(2) + 'M';
        },

        insightsDailyBars() {
            const byDate = this.insights?.byDate || {};
            const bars = [];
            const today = new Date();
            for (let i = 29; i >= 0; i--) {
                const d = new Date(today);
                d.setDate(today.getDate() - i);
                const key = d.toISOString().slice(0, 10);
                bars.push({
                    date: key,
                    cost: byDate[key] || 0
                });
            }
            const max = Math.max(...bars.map(b => b.cost), 0.0001);
            return bars.map(b => ({
                ...b,
                pct: (b.cost / max * 100).toFixed(1)
            }));
        },

        async loadTools() {
            if (this.toolCommands.length > 0 || this.toolSkills.length > 0) return;
            this.toolsLoading = true;
            const projectPath = this.projects?.find(p => p.dirName === this.configProject)?.projectPath || '';
            const pp = projectPath ? '?projectPath=' + encodeURIComponent(projectPath) : '';
            const [cmds, skills] = await Promise.all([
                fetch('/api/tools/commands' + pp).then(r => r.json()),
                fetch('/api/tools/skills' + pp).then(r => r.json()),
            ]);
            this.toolCommands = cmds;
            this.toolSkills = skills;
            this.toolsLoading = false;
            const first = this.toolsTab === 'skills' ? skills[0] : cmds[0];
            if (first && !this.selectedTool) this.selectedTool = first;
        },

        async loadPlugins(force) {
            if (!force && this.pluginsInstalled.length > 0) return;
            this.pluginsLoading = true;
            try {
                const data = await fetch('/api/plugins').then(r => r.json());
                this.pluginsInstalled = (data.installed || []).map(p => ({
                    ...p,
                    pluginId: p.pluginId || p.id,
                    name: p.name || p.id,
                }));
            } catch {}
            this.pluginsLoading = false;
        },

        async loadPluginDetail(pluginId) {
            if (!pluginId) {
                this.pluginsDetail = null;
                return;
            }
            this.pluginsDetailLoading = true;
            this.pluginsDetail = null;
            try {
                const d = await fetch('/api/plugins/detail?pluginId=' + encodeURIComponent(pluginId)).then(r => r.json());
                this.pluginsDetail = d;
            } catch {}
            this.pluginsDetailLoading = false;
        },

        async loadPluginItems(pluginId) {
            if (!pluginId) {
                this.pluginsItems = null;
                return;
            }
            this.pluginsItemsLoading = true;
            this.pluginsItems = null;
            try {
                const d = await fetch('/api/plugins/items?pluginId=' + encodeURIComponent(pluginId)).then(r => r.json());
                this.pluginsItems = d;
            } catch {}
            this.pluginsItemsLoading = false;
        },

        navigateToPlugin(pluginId) {
            this.view = 'plugins';
            this.pluginsTab = 'installed';
            const p = this.pluginsInstalled.find(i => (i.pluginId || i.name) === pluginId);
            if (p) {
                this.pluginsSelected = {
                    ...p,
                    _type: 'installed'
                };
                this.loadPluginDetail(p.pluginId || p.name);
                this.loadPluginItems(p.pluginId || p.name);
            }
        },

        goToPluginSkill(slug) {
            this.view = 'skills';
            this.skillsTab = 'my';
            this.$nextTick(() => {
                const s = this.toolSkills.find(t => t.slug === slug);
                if (s) this.selectedTool = s;
            });
        },

        goToPluginAgent(slug) {
            this.view = 'agents';
            this.agentsTab = 'my';
            this.$nextTick(() => {
                const a = this.agents.find(ag => ag.slug === slug);
                if (a) this.selectedAgent = a;
            });
        },

        goToPluginCommand(slug) {
            this.view = 'commands';
            this.cliTab = 'list';
            this.$nextTick(() => {
                const c = this.toolCommands.find(t => t.slug === slug);
                if (c) this.selectedTool = c;
            });
        },

        async loadPluginsAvailable() {
            if (this.pluginsAvailable.length > 0) return;
            this.pluginsAvailableLoading = true;
            try {
                const data = await fetch('/api/plugins?available=true').then(r => r.json());
                this.pluginsAvailable = data.available || [];
            } catch {}
            this.pluginsAvailableLoading = false;
        },

        async loadPluginsMarketplaces() {
            this.pluginsMarketplacesLoading = true;
            try {
                this.pluginsMarketplaces = await fetch('/api/plugins/marketplaces').then(r => r.json());
            } catch {}
            this.pluginsMarketplacesLoading = false;
        },

        filteredPluginsAvailable() {
            let list = this.pluginsAvailable;
            if (this.pluginsMarketplaceFilter !== 'all') list = list.filter(p => p.marketplaceName === this.pluginsMarketplaceFilter);
            const q = this.pluginsSearch.trim().toLowerCase();
            if (!q) return list;
            return list.filter(p => p.name?.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q));
        },

        async pluginDoAction(action, pluginId, scope) {
            this.pluginAction = {
                loading: true,
                id: pluginId,
                msg: ''
            };
            try {
                const r = await fetch('/api/plugins/action', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        action,
                        pluginId,
                        scope
                    }),
                });
                const data = await r.json();
                if (!r.ok) throw new Error(data.error || 'Error');
                this.pluginAction = {
                    loading: false,
                    id: null,
                    msg: ''
                };
                // Refresh installed list
                this.pluginsInstalled = [];
                this.pluginsAvailable = [];
                await this.loadPlugins(true);
                if (this.pluginsTab === 'discover') await this.loadPluginsAvailable();
                // Clear selection if the uninstalled plugin was selected
                if (action === 'uninstall' && (this.pluginsSelected?.pluginId === pluginId || this.pluginsSelected?.name === pluginId)) {
                    this.pluginsSelected = null;
                    this.pluginsDetail = null;
                }
            } catch (e) {
                this.pluginAction = {
                    loading: false,
                    id: pluginId,
                    msg: e.message
                };
            }
        },

        toggleSlashPin(cmd) {
            const idx = this.pinnedSlashCmds.indexOf(cmd);
            if (idx === -1) this.pinnedSlashCmds.push(cmd);
            else this.pinnedSlashCmds.splice(idx, 1);
            localStorage.setItem('cm:pinnedSlashCmds', JSON.stringify(this.pinnedSlashCmds));
        },

        sortedSlashCmds() {
            const pinned = this.slashCmds.filter(c => this.pinnedSlashCmds.includes(c.cmd));
            const rest = this.slashCmds.filter(c => !this.pinnedSlashCmds.includes(c.cmd));
            return [...pinned, ...rest];
        },

        togglePin(name) {
            const idx = this.pinnedCommands.indexOf(name);
            if (idx === -1) this.pinnedCommands.push(name);
            else this.pinnedCommands.splice(idx, 1);
            localStorage.setItem('cm:pinnedCommands', JSON.stringify(this.pinnedCommands));
        },

        sortedCommands() {
            const pinned = this.toolCommands.filter(t => this.pinnedCommands.includes(t.name));
            const rest = this.toolCommands.filter(t => !this.pinnedCommands.includes(t.name));
            return [...pinned, ...rest];
        },

        // --- Group/filter helpers for My Agents, My Skills, My Commands ---
        _inferGroups(items, slugKey = 'slug', pluginKey = 'pluginId') {
            const counts = {};
            items.forEach(item => {
                if (item[pluginKey]) {
                    const g = item[pluginKey].split('@')[0];
                    counts[g] = (counts[g] || 0) + 1;
                } else {
                    const dash = (item[slugKey] || '').indexOf('-');
                    if (dash > 0) {
                        const prefix = item[slugKey].slice(0, dash);
                        const pKey = '__' + prefix;
                        counts[pKey] = (counts[pKey] || 0) + 1;
                    }
                }
            });
            return Object.entries(counts)
                .filter(([k, v]) => !k.startsWith('__') || v >= 2)
                .map(([k]) => k.startsWith('__') ? k.slice(2) : k)
                .sort();
        },

        agentGroups() {
            return this._inferGroups(this.agents);
        },
        skillGroups() {
            return this._inferGroups(this.toolSkills);
        },
        commandGroups() {
            return [...new Set(this.toolCommands.map(c => c.namespace).filter(n => n && n !== 'user' && n !== 'project'))].sort();
        },

        filteredAgents() {
            if (!this.agentsFilter) return this.agents;
            const f = this.agentsFilter;
            return this.agents.filter(a => a.pluginId ? a.pluginId.split('@')[0] === f : a.slug.startsWith(f + '-'));
        },

        filteredSkills() {
            if (!this.skillsFilter) return this.toolSkills;
            const f = this.skillsFilter;
            return this.toolSkills.filter(s => s.pluginId ? s.pluginId.split('@')[0] === f : s.slug.startsWith(f + '-'));
        },

        filteredSortedCommands() {
            const all = this.sortedCommands();
            if (!this.commandsFilter) return all;
            const f = this.commandsFilter;
            return all.filter(c => c.namespace === f || c.pluginId?.split('@')[0] === f);
        },

        toolsVisible() {
            return this.toolsTab === 'commands' ? this.toolCommands : this.toolSkills;
        },

        async loadPlans() {
            if (this.plans.length > 0) return;
            this.plansLoading = true;
            this.plans = await fetch('/api/plans').then(r => r.json());
            this.plansLoading = false;
            if (this.plans.length > 0 && !this.selectedPlan) this.selectedPlan = this.plans[0];
        },

        filteredMarketplace() {
            let list = this.marketplace;
            if (this.marketplaceSourceFilter !== 'all') list = list.filter(s => s._source === this.marketplaceSourceFilter);
            const q = this.marketplaceSearch.trim().toLowerCase();
            if (!q) return list;
            return list.filter(s =>
                s.name.toLowerCase().includes(q) ||
                s.description.toLowerCase().includes(q)
            );
        },

        async addMarketplaceSource() {
            const f = this.marketplaceSourceForm;
            f.saving = true;
            f.msg = '';
            try {
                const r = await fetch('/api/marketplace/sources', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        name: f.name,
                        owner: f.owner,
                        repo: f.repo,
                        branch: f.branch || 'main',
                        skillsPath: f.skillsPath || '',
                        token: f.token || ''
                    }),
                });
                const data = await r.json();
                if (!r.ok) {
                    f.msg = 'Error: ' + data.error;
                    return;
                }
                f.msg = 'Source added!';
                f.open = false;
                Object.assign(f, {
                    name: '',
                    owner: '',
                    repo: '',
                    branch: 'main',
                    skillsPath: '',
                    token: ''
                });
                this.marketplace = [];
                await this.loadMarketplace();
            } catch (e) {
                f.msg = 'Error: ' + e.message;
            } finally {
                f.saving = false;
            }
        },

        async removeMarketplaceSource(id) {
            await fetch(`/api/marketplace/sources/${encodeURIComponent(id)}`, {
                method: 'DELETE'
            });
            this.marketplace = [];
            await this.loadMarketplace();
        },

        async loadMarketplace() {
            if (this.marketplace.length > 0) return;
            this.marketplaceLoading = true;
            this.marketplaceErrors = [];
            try {
                const [sourcesData, registryData] = await Promise.all([
                    fetch('/api/marketplace/sources').then(r => r.json()),
                    fetch('/api/marketplace/registry').then(r => r.json()),
                ]);
                this.marketplaceSources = sourcesData || [];
                this.marketplace = registryData.skills || [];
                this.marketplaceErrors = registryData.errors || [];
                if (this.marketplace.length > 0) {
                    const projectPath = this.projects?.find(p => p.dirName === this.configProject)?.projectPath || '';
                    const slugs = this.marketplace.map(s => s.slug).join(',');
                    const pp = projectPath ? '&projectPath=' + encodeURIComponent(projectPath) : '';
                    this.marketplaceInstalled = await fetch(`/api/marketplace/check-installed?slugs=${slugs}${pp}`).then(r => r.json());
                }
            } catch (e) {
                this.marketplaceErrors = [e.message];
            }
            this.marketplaceLoading = false;
        },

        async previewMarketplaceSkill(s) {
            // Use cached content if available
            if (s.content) {
                this.marketplacePreview = s;
                this.marketplaceInstallMsg = '';
                return;
            }
            this.marketplacePreview = null;
            this.marketplacePreviewLoading = true;
            this.marketplaceInstallMsg = '';
            try {
                const r = await fetch(`/api/marketplace/skill/${encodeURIComponent(s.slug)}?source=${s._source||''}`);
                if (!r.ok) throw new Error((await r.json()).error);
                this.marketplacePreview = await r.json();
            } catch (e) {
                console.error(e);
            }
            this.marketplacePreviewLoading = false;
        },

        async installMarketplaceSkill() {
            if (!this.marketplacePreview) return;
            this.marketplaceInstalling = true;
            this.marketplaceInstallMsg = '';
            try {
                const projectPath = this.projects?.find(p => p.dirName === this.configProject)?.projectPath || '';
                const p = this.marketplacePreview;
                const r = await fetch('/api/marketplace/install', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        slug: p.slug,
                        name: p.name,
                        description: p.description,
                        content: p.content,
                        scope: this.marketplaceInstallScope,
                        projectPath
                    }),
                });
                const d = await r.json();
                if (!r.ok) throw new Error(d.error);
                this.marketplaceInstalled = {
                    ...this.marketplaceInstalled,
                    [p.slug]: true
                };
                this.toolCommands = [];
                this.toolSkills = [];
                await this.loadTools();
                this.marketplaceInstallMsg = 'Installed! Available in "My Skills".';
            } catch (e) {
                this.marketplaceInstallMsg = 'Error: ' + e.message;
            }
            this.marketplaceInstalling = false;
        },

        async fetchFromUrl() {
            const u = this.urlInstall;
            u.loading = true;
            u.msg = '';
            u.preview = null;
            try {
                const r = await fetch('/api/marketplace/fetch-url?url=' + encodeURIComponent(u.url));
                const d = await r.json();
                if (!r.ok) throw new Error(d.error);
                u.preview = d;
                u.slug = d.slug;
                u.msg = '';
            } catch (e) {
                u.msg = 'Error: ' + e.message;
            }
            u.loading = false;
        },

        async installFromUrl() {
            const u = this.urlInstall;
            if (!u.preview) return;
            u.loading = true;
            u.msg = '';
            try {
                const projectPath = this.projects?.find(p => p.dirName === this.configProject)?.projectPath || '';
                const r = await fetch('/api/marketplace/install', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        slug: u.slug,
                        name: u.preview.name,
                        description: u.preview.description,
                        content: u.preview.content,
                        scope: u.scope,
                        projectPath
                    }),
                });
                const d = await r.json();
                if (!r.ok) throw new Error(d.error);
                u.msg = 'Installed! Available in "My Skills".';
                u.preview = null;
                u.url = '';
                u.slug = '';
                this.toolCommands = [];
                this.toolSkills = [];
                await this.loadTools();
            } catch (e) {
                u.msg = 'Error: ' + e.message;
            }
            u.loading = false;
        },

        async fetchAgentFromUrl() {
            const u = this.agentsUrlInstall;
            u.loading = true;
            u.msg = '';
            u.preview = null;
            try {
                const r = await fetch('/api/marketplace/fetch-url?url=' + encodeURIComponent(u.url));
                const d = await r.json();
                if (!r.ok) throw new Error(d.error);
                u.preview = d;
                u.slug = d.slug;
                u.msg = '';
            } catch (e) {
                u.msg = 'Error: ' + e.message;
            }
            u.loading = false;
        },

        async installAgentFromUrl() {
            const u = this.agentsUrlInstall;
            if (!u.preview) return;
            u.loading = true;
            u.msg = '';
            try {
                const projectPath = this.projects?.find(p => p.dirName === this.configProject)?.projectPath || '';
                const r = await fetch('/api/tools/agents', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        slug: u.slug,
                        name: u.preview.name,
                        description: u.preview.description,
                        content: u.preview.content,
                        scope: u.scope,
                        projectPath
                    }),
                });
                const d = await r.json();
                if (!r.ok) throw new Error(d.error);
                u.msg = 'Installed! Available in "My Agents".';
                u.preview = null;
                u.url = '';
                u.slug = '';
                this.agents = [];
                await this.loadAgents();
            } catch (e) {
                u.msg = 'Error: ' + e.message;
            }
            u.loading = false;
        },

        filteredPlans() {
            const q = this.plansSearch.trim().toLowerCase();
            if (!q) return this.plans;
            return this.plans.filter(p =>
                p.title.toLowerCase().includes(q) ||
                p.summary.toLowerCase().includes(q) ||
                p.content.toLowerCase().includes(q)
            );
        },

        async loadHistory() {
            if (this.historyEntries.length > 0 && !this.historySearch && !this.historyProject) return;
            this.historyLoading = true;
            const params = new URLSearchParams();
            if (this.historySearch) params.set('q', this.historySearch);
            if (this.historyProject) params.set('project', this.historyProject);
            this.historyEntries = await fetch(`/api/history?${params}`).then(r => r.json());
            this.historyLoading = false;
        },

        async loadConfig() {
            if (this.config) return;
            this.configLoading = true;
            const proj = this.projects?.find(p => p.dirName === this.configProject);
            const pp = proj?.projectPath ? '?projectPath=' + encodeURIComponent(proj.projectPath) : '';
            this.config = await fetch('/api/config' + pp).then(r => r.json());
            const as = await fetch('/api/app-settings').then(r => r.json()).catch(() => ({}));
            this.githubTokenSet = as.githubTokenSet || false;
            this.githubTokenMasked = as.githubTokenMasked || '';
            this.githubTokenDraft = '';
            this.budgetMonthly = as.budgetMonthly || 0;
            this.budgetMonthlyDraft = as.budgetMonthly ? String(as.budgetMonthly) : '';
            this.settingsDraft = {
                model: this.config.settings?.model || '',
                language: this.config.settings?.language || '',
                voiceEnabled: this.config.settings?.voiceEnabled ?? false,
                outputStyle: this.config.settings?.outputStyle || '',
                effortLevel: this.config.settings?.effortLevel || '',
                defaultMode: this.config.settings?.defaultMode || '',
            };
            const p = this.config.settings?.permissions || {};
            this.permsDraft = {
                allow: [...(p.allow || [])],
                deny: [...(p.deny || [])],
                ask: [...(p.ask || [])],
            };
            this.configLoading = false;
        },

        groupedHistoryByDate() {
            const groups = {};
            const now = new Date();
            const today = now.toISOString().slice(0, 10);
            const yesterday = new Date(now - 86400000).toISOString().slice(0, 10);
            const weekAgo = new Date(now - 7 * 86400000).toISOString().slice(0, 10);
            const monthAgo = new Date(now - 30 * 86400000).toISOString().slice(0, 10);
            for (const e of this.historyEntries) {
                const d = new Date(e.timestamp).toISOString().slice(0, 10);
                let label;
                if (d === today) label = 'Today';
                else if (d === yesterday) label = 'Yesterday';
                else if (d >= weekAgo) label = 'This week';
                else if (d >= monthAgo) label = 'This month';
                else label = 'Older';
                if (!groups[label]) groups[label] = [];
                groups[label].push(e);
            }
            const order = ['Today', 'Yesterday', 'This week', 'This month', 'Older'];
            const ordered = {};
            for (const k of order)
                if (groups[k]) ordered[k] = groups[k];
            return ordered;
        },

        isAutoStartEnabled() {
            const hooks = this.configHooks();
            return hooks.some(h => h.event === 'SessionStart' && h.command?.includes('claude-home'));
        },

        async toggleAutoStart(enable) {
            if (enable) {
                await fetch('/api/config/hooks', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        scope: 'user',
                        event: 'SessionStart',
                        matcher: '',
                        type: 'command',
                        command: `lsof -ti:3141 >/dev/null 2>&1 || (claude-home --no-open &>/dev/null &)`,
                    }),
                });
            } else {
                const hook = this.configHooks().find(h => h.event === 'SessionStart' && h.command?.includes('claude-home'));
                if (hook) await this.deleteHook(hook);
            }
            await this.loadConfig();
        },

        configHooks() {
            if (!this.config?.settings) return [];
            const result = [];
            for (const [event, matchers] of Object.entries(this.config.settings.hooks || {})) {
                matchers.forEach((m, matcherIndex) => {
                    for (const h of (m.hooks || [])) {
                        result.push({
                            event,
                            matcher: m.matcher || '',
                            matcherIndex,
                            type: h.type || 'command',
                            command: h.command || '',
                            url: h.url || '',
                            prompt: h.prompt || '',
                            _scope: 'user'
                        });
                    }
                });
            }
            for (const [event, matchers] of Object.entries(this.config.settings._scopedHooks || {})) {
                matchers.forEach((m) => {
                    for (const h of (m.hooks || [])) {
                        result.push({
                            event,
                            matcher: m.matcher || '',
                            matcherIndex: m._idx,
                            type: h.type || 'command',
                            command: h.command || '',
                            url: h.url || '',
                            prompt: h.prompt || '',
                            _scope: m._scope || 'project'
                        });
                    }
                });
            }
            return result;
        },

        heatmapCells() {
            const byDate = this.stats?.sessionsByDate || {};
            const counts = Object.values(byDate);
            const max = counts.length ? Math.max(...counts) : 1;
            const today = new Date();
            const start = new Date(today);
            start.setDate(today.getDate() - 364);
            start.setDate(start.getDate() - start.getDay());
            const cells = [];
            for (let week = 0; week < 53; week++) {
                for (let day = 0; day < 7; day++) {
                    const d = new Date(start);
                    d.setDate(start.getDate() + week * 7 + day);
                    if (d > today) {
                        cells.push(`<div class="heatmap-cell" style="background:transparent"></div>`);
                        continue;
                    }
                    const dateStr = d.toISOString().slice(0, 10);
                    const count = byDate[dateStr] || 0;
                    const level = count > 0 ? Math.min(4, Math.ceil(count / max * 4)) : 0;
                    cells.push(`<div class="heatmap-cell" data-count="${count}" data-level="${level}" title="${dateStr}: ${count} session${count!==1?'s':''}"></div>`);
                }
            }
            return cells.join('');
        },

        heatmapMonths() {
            const today = new Date();
            const start = new Date(today);
            start.setDate(today.getDate() - 364);
            start.setDate(start.getDate() - start.getDay());
            const months = [];
            const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            let last = -1;
            for (let week = 0; week < 53; week++) {
                const d = new Date(start);
                d.setDate(start.getDate() + week * 7);
                const m = d.getMonth();
                if (m !== last) {
                    months.push({
                        week,
                        name: names[m]
                    });
                    last = m;
                }
            }
            return months.map((m, i) => {
                const span = (months[i + 1]?.week ?? 53) - m.week;
                return `<span style="flex:${span};min-width:0;overflow:hidden">${m.name}</span>`;
            }).join('');
        },
    };
}