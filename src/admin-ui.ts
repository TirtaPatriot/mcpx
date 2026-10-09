import { validateAdminRequest } from "./auth";
import { publicOrigin } from "./utils";

export function renderAdminPage(request: Request): Response {
  const isAuth = validateAdminRequest(request);
  const origin = publicOrigin(request);

  if (!isAuth) {
    return new Response(null, {
      status: 302,
      headers: { Location: "/admin/login", "Cache-Control": "no-store" },
    });
  }

  const html = `<!doctype html>
<html lang="id" class="dark">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>MCP Gateway — Dashboard Management</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          colors: {
            brand: { 50: '#eff6ff', 500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8' },
            dark: { 900: '#0b0f17', 800: '#111827', 700: '#1f2937', 600: '#374151' }
          }
        }
      }
    }
  </script>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
    body { font-family: 'Inter', system-ui, sans-serif; }
    code, pre, .font-mono { font-family: 'JetBrains Mono', monospace; }
  </style>
</head>
<body class="bg-dark-900 text-slate-100 min-h-screen flex flex-col antialiased">

  <!-- Toast Notification (z-[9999] to ensure it always renders above modal backdrops) -->
  <div id="toast" class="fixed bottom-5 right-5 z-[9999] transform transition-all duration-300 translate-y-20 opacity-0 pointer-events-none">
    <div id="toastContent" class="flex items-center gap-3 px-4 py-3 rounded-xl border shadow-2xl text-sm font-medium"></div>
  </div>

  <!-- Navbar -->
  <header class="border-b border-dark-700 bg-dark-800/80 backdrop-blur sticky top-0 z-40">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-purple-600 flex items-center justify-center font-bold text-white shadow-lg shadow-blue-500/20">
          ⚡
        </div>
        <div>
          <h1 class="text-base font-bold tracking-tight text-white flex items-center gap-2">
            OAuth 2.1 MCP Gateway
            <span class="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">SQLite WAL</span>
            <span class="text-[10px] font-mono px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20">HTTP + NPM (bunx/npx)</span>
          </h1>
          <p class="text-xs text-slate-400">Universal reverse proxy, process bridge & OAuth 2.1 manager untuk Semua AI (Gemini, Claude, Cursor, ChatGPT, LibreChat, dll.)</p>
        </div>
      </div>

      <div class="flex items-center gap-3">
        <div id="currentUserBadge" class="hidden sm:flex items-center gap-2 bg-dark-700/80 border border-dark-600 px-3 py-1.5 rounded-xl text-xs">
          <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <span id="currentUserName" class="font-medium text-slate-200">Admin</span>
          <span id="currentUserRole" class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30 uppercase">ADMIN</span>
        </div>
        <a href="/.well-known/oauth-authorization-server" target="_blank" class="text-xs text-slate-400 hover:text-white transition flex items-center gap-1 bg-dark-700/60 px-2.5 py-1.5 rounded-lg border border-dark-600">
          <span>RFC 8414 Discovery</span>
          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
        </a>
        <button onclick="logout()" class="text-xs bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 px-3 py-1.5 rounded-lg transition font-medium">
          Keluar
        </button>
      </div>
    </div>
  </header>

  <!-- Default Password Alert -->
  <div id="defaultPassWarning" class="hidden bg-amber-500/10 border-b border-amber-500/20 px-4 py-2.5 text-xs text-amber-300">
    <div class="max-w-7xl mx-auto flex items-center justify-between">
      <div class="flex items-center gap-2">
        <span class="text-base">⚠️</span>
        <span>Anda masih menggunakan password bawaan (<strong>admin123</strong>). Segera ganti password di tab <strong>Pengaturan</strong> demi keamanan.</span>
      </div>
      <button onclick="switchTab('settings')" class="underline hover:text-amber-200">Ganti Sekarang &rarr;</button>
    </div>
  </div>

  <!-- Main Container -->
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex-1 w-full flex flex-col md:flex-row gap-6">

    <!-- Sidebar Navigation -->
    <aside class="w-full md:w-56 shrink-0">
      <nav class="flex md:flex-col gap-1 overflow-x-auto pb-2 md:pb-0" id="navTabs">
        <button onclick="switchTab('overview')" data-tab="overview" class="nav-btn active flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition text-left">
          <span>📊</span> Ringkasan
        </button>
        <button onclick="switchTab('servers')" data-tab="servers" class="nav-btn flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition text-left">
          <span>🔌</span> Server MCP
        </button>
        <button onclick="switchTab('clients')" data-tab="clients" class="nav-btn flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition text-left">
          <span>🔑</span> Klien OAuth
        </button>
        <button onclick="switchTab('users')" data-tab="users" class="nav-btn flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition text-left">
          <span>👥</span> Pengguna
        </button>
        <button onclick="switchTab('tokens')" data-tab="tokens" class="nav-btn flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition text-left">
          <span>🎫</span> Token & Sesi
        </button>
        <button onclick="switchTab('logs')" data-tab="logs" class="nav-btn flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition text-left">
          <span>📜</span> Log Aktivitas
        </button>
        <button onclick="switchTab('settings')" data-tab="settings" class="nav-btn flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition text-left">
          <span>⚙️</span> Pengaturan
        </button>
      </nav>
    </aside>

    <!-- Content Area -->
    <main class="flex-1 min-w-0">

      <!-- ── TAB: OVERVIEW ── -->
      <section id="tab-overview" class="tab-pane space-y-6">
        <!-- Stats Cards -->
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <div class="bg-dark-800 border border-dark-700 rounded-2xl p-4 shadow-sm">
            <div class="text-xs font-medium text-slate-400 mb-1">Server MCP Aktif</div>
            <div class="text-2xl font-bold text-white flex items-baseline gap-2">
              <span id="statServersActive">0</span>
              <span class="text-xs font-normal text-slate-400">/ <span id="statServersTotal">0</span></span>
            </div>
            <div class="mt-2 text-[11px] text-blue-400 flex items-center gap-1">
              <span class="inline-block w-1.5 h-1.5 rounded-full bg-blue-400"></span> HTTP & Stdio
            </div>
          </div>
          <div class="bg-dark-800 border border-dark-700 rounded-2xl p-4 shadow-sm">
            <div class="text-xs font-medium text-slate-400 mb-1">Klien OAuth Aktif</div>
            <div class="text-2xl font-bold text-white flex items-baseline gap-2">
              <span id="statClientsActive">0</span>
              <span class="text-xs font-normal text-slate-400">/ <span id="statClientsTotal">0</span></span>
            </div>
            <div class="mt-2 text-[11px] text-emerald-400 flex items-center gap-1">
              <span class="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Multi-klien AI
            </div>
          </div>
          <div class="bg-dark-800 border border-dark-700 rounded-2xl p-4 shadow-sm">
            <div class="text-xs font-medium text-slate-400 mb-1">Access Token Aktif</div>
            <div class="text-2xl font-bold text-white" id="statTokensAccess">0</div>
            <div class="mt-2 text-[11px] text-purple-400 flex items-center gap-1">
              <span class="inline-block w-1.5 h-1.5 rounded-full bg-purple-400"></span> Sesi AI Client
            </div>
          </div>
          <div class="bg-dark-800 border border-dark-700 rounded-2xl p-4 shadow-sm">
            <div class="text-xs font-medium text-slate-400 mb-1">Refresh Token Valid</div>
            <div class="text-2xl font-bold text-white" id="statTokensRefresh">0</div>
            <div class="mt-2 text-[11px] text-amber-400 flex items-center gap-1">
              <span class="inline-block w-1.5 h-1.5 rounded-full bg-amber-400"></span> Rotasi Grace
            </div>
          </div>
          <div class="bg-dark-800 border border-dark-700 rounded-2xl p-4 shadow-sm col-span-2 sm:col-span-1">
            <div class="text-xs font-medium text-slate-400 mb-1">Pengguna Gateway</div>
            <div class="text-2xl font-bold text-white flex items-baseline gap-2">
              <span id="statUsersActive">0</span>
              <span class="text-xs font-normal text-slate-400">/ <span id="statUsersTotal">0</span></span>
            </div>
            <div class="mt-2 text-[11px] text-indigo-400 flex items-center gap-1">
              <span class="inline-block w-1.5 h-1.5 rounded-full bg-indigo-400"></span> Admin & Tim
            </div>
          </div>
        </div>

        <!-- Universal AI Integration Hub -->
        <div class="bg-gradient-to-r from-blue-900/30 via-indigo-900/20 to-purple-900/30 border border-blue-500/20 rounded-2xl p-5 space-y-4">
          <div class="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h2 class="text-base font-semibold text-white flex items-center gap-2">
                <span>🤖</span> Hub Integrasi Semua AI Client (Universal)
              </h2>
              <p class="text-xs text-slate-300 mt-1">
                Hubungkan server MCP upstream ke berbagai model & asisten AI (Google Gemini, Claude, OpenAI/ChatGPT, Cursor, LibreChat, dll.)
              </p>
            </div>
            <div class="flex items-center gap-2">
              <button onclick="openGenerateTokenModal()" class="text-xs bg-purple-600 hover:bg-purple-500 text-white font-medium px-3.5 py-1.5 rounded-lg transition shadow-md shadow-purple-600/30 flex items-center gap-1">
                <span>🔑</span> Buat Token Akses
              </button>
              <button onclick="switchTab('clients')" class="text-xs bg-blue-600 hover:bg-blue-500 text-white font-medium px-3.5 py-1.5 rounded-lg transition shadow-md shadow-blue-600/30">
                Kelola Klien &rarr;
              </button>
            </div>
          </div>

          <!-- Quick Platform Selector Pills -->
          <div class="flex flex-wrap gap-2 text-xs pt-1 border-t border-dark-700/60">
            <button onclick="switchOverviewGuide('gemini')" id="btnGuideGemini" class="px-3 py-1.5 rounded-lg bg-blue-600 text-white font-medium transition flex items-center gap-1.5">
              <span>🤖</span> Google Gemini
            </button>
            <button onclick="switchOverviewGuide('claude')" id="btnGuideClaude" class="px-3 py-1.5 rounded-lg bg-dark-800 text-slate-400 hover:text-white transition flex items-center gap-1.5">
              <span>🟣</span> Claude Desktop / Code
            </button>
            <button onclick="switchOverviewGuide('chatgpt')" id="btnGuideChatgpt" class="px-3 py-1.5 rounded-lg bg-dark-800 text-slate-400 hover:text-white transition flex items-center gap-1.5">
              <span>🟢</span> OpenAI / ChatGPT
            </button>
            <button onclick="switchOverviewGuide('cursor')" id="btnGuideCursor" class="px-3 py-1.5 rounded-lg bg-dark-800 text-slate-400 hover:text-white transition flex items-center gap-1.5">
              <span>⚡</span> Cursor / Windsurf
            </button>
            <button onclick="switchOverviewGuide('generic')" id="btnGuideGeneric" class="px-3 py-1.5 rounded-lg bg-dark-800 text-slate-400 hover:text-white transition flex items-center gap-1.5">
              <span>🌐</span> Generic / SSE REST
            </button>
          </div>

          <!-- Panel: Gemini -->
          <div id="guidePanelGemini" class="space-y-3">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono">
              <div class="bg-dark-900/80 p-3 rounded-xl border border-dark-700 flex items-center justify-between gap-2">
                <div class="min-w-0">
                  <div class="text-[10px] text-slate-400 font-sans uppercase font-bold tracking-wider">Authorize URL</div>
                  <div class="truncate text-slate-200 mt-0.5" id="valAuthUrl">${origin}/oauth/authorize</div>
                </div>
                <button onclick="copyText('${origin}/oauth/authorize')" class="shrink-0 text-slate-400 hover:text-white p-1.5 bg-dark-800 rounded-lg border border-dark-600">Salin</button>
              </div>
              <div class="bg-dark-900/80 p-3 rounded-xl border border-dark-700 flex items-center justify-between gap-2">
                <div class="min-w-0">
                  <div class="text-[10px] text-slate-400 font-sans uppercase font-bold tracking-wider">Token URL</div>
                  <div class="truncate text-slate-200 mt-0.5" id="valTokenUrl">${origin}/oauth/token</div>
                </div>
                <button onclick="copyText('${origin}/oauth/token')" class="shrink-0 text-slate-400 hover:text-white p-1.5 bg-dark-800 rounded-lg border border-dark-600">Salin</button>
              </div>
            </div>
            <p class="text-[11px] text-slate-400">
              💡 <em>Mendukung auto-discovery OAuth 2.1 (RFC 8414 & RFC 9728) untuk integrasi Custom Tools & Gems di Google Gemini Web & Mobile.</em>
            </p>
          </div>

          <!-- Panel: Claude -->
          <div id="guidePanelClaude" class="hidden space-y-2">
            <div class="bg-dark-900/80 p-3.5 rounded-xl border border-dark-700 text-xs font-mono space-y-2">
              <div class="flex items-center justify-between text-slate-400 font-sans text-[11px]">
                <span>Konfigurasi claude_desktop_config.json:</span>
                <button onclick="copyClaudeConfig()" class="text-blue-400 hover:underline">Salin JSON</button>
              </div>
              <pre id="claudeConfigSnippet" class="text-slate-300 text-[11px] overflow-x-auto whitespace-pre">{
  "mcpServers": {
    "dokploy": {
      "url": "${origin}/mcp/dokploy",
      "headers": {
        "Authorization": "Bearer &lt;TOKEN_AKSES&gt;"
      }
    }
  }
}</pre>
            </div>
            <div class="flex items-center justify-between text-[11px] text-slate-400">
              <span>💡 Gunakan Bearer Token untuk koneksi langsung tanpa browser OAuth flow.</span>
              <button onclick="openGenerateTokenModal()" class="text-purple-400 hover:underline font-medium">+ Buat Token Akses untuk Claude</button>
            </div>
          </div>

          <!-- Panel: ChatGPT -->
          <div id="guidePanelChatgpt" class="hidden space-y-2">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono">
              <div class="bg-dark-900/80 p-3 rounded-xl border border-dark-700 flex items-center justify-between gap-2">
                <div class="min-w-0">
                  <div class="text-[10px] text-slate-400 font-sans uppercase font-bold tracking-wider">Auth URL</div>
                  <div class="truncate text-slate-200 mt-0.5">${origin}/oauth/authorize</div>
                </div>
                <button onclick="copyText('${origin}/oauth/authorize')" class="shrink-0 text-slate-400 hover:text-white p-1.5 bg-dark-800 rounded-lg border border-dark-600">Salin</button>
              </div>
              <div class="bg-dark-900/80 p-3 rounded-xl border border-dark-700 flex items-center justify-between gap-2">
                <div class="min-w-0">
                  <div class="text-[10px] text-slate-400 font-sans uppercase font-bold tracking-wider">Token URL</div>
                  <div class="truncate text-slate-200 mt-0.5">${origin}/oauth/token</div>
                </div>
                <button onclick="copyText('${origin}/oauth/token')" class="shrink-0 text-slate-400 hover:text-white p-1.5 bg-dark-800 rounded-lg border border-dark-600">Salin</button>
              </div>
            </div>
            <p class="text-[11px] text-slate-400">
              💡 <em>Di Custom GPT Actions, pilih auth <strong>OAuth</strong>, masukkan Client ID & Secret dari tab Klien OAuth, dan pilih Basic Auth untuk Token Exchange.</em>
            </p>
          </div>

          <!-- Panel: Cursor -->
          <div id="guidePanelCursor" class="hidden space-y-2">
            <div class="bg-dark-900/80 p-3.5 rounded-xl border border-dark-700 text-xs font-mono space-y-2">
              <div class="flex items-center justify-between text-slate-400 font-sans text-[11px]">
                <span>Konfigurasi Cursor (.cursor/mcp.json atau Settings > Features > MCP):</span>
                <button onclick="copyCursorConfig()" class="text-blue-400 hover:underline">Salin JSON</button>
              </div>
              <pre id="cursorConfigSnippet" class="text-slate-300 text-[11px] overflow-x-auto whitespace-pre">{
  "mcpServers": {
    "dokploy": {
      "url": "${origin}/mcp/dokploy",
      "headers": {
        "Authorization": "Bearer &lt;TOKEN_AKSES&gt;"
      }
    }
  }
}</pre>
            </div>
            <div class="flex items-center justify-between text-[11px] text-slate-400">
              <span>💡 Cursor mendukung remote MCP tipe SSE dengan header Authorization Bearer.</span>
              <button onclick="openGenerateTokenModal()" class="text-purple-400 hover:underline font-medium">+ Buat Token Akses untuk Cursor</button>
            </div>
          </div>

          <!-- Panel: Generic -->
          <div id="guidePanelGeneric" class="hidden space-y-2">
            <div class="bg-dark-900/80 p-3.5 rounded-xl border border-dark-700 text-xs font-mono space-y-2">
              <div class="text-slate-400 font-sans text-[11px]">Contoh cURL / SSE Client:</div>
              <pre class="text-slate-300 text-[11px] overflow-x-auto whitespace-pre">curl -N -H "Authorization: Bearer &lt;TOKEN_AKSES&gt;" \
  -H "Accept: text/event-stream" \
  ${origin}/mcp/&lt;SERVER_NAME&gt;</pre>
            </div>
            <p class="text-[11px] text-slate-400">
              💡 <em>Dapat digunakan langsung di LibreChat, Open WebUI, Dify, LangChain, atau agent framework kustom.</em>
            </p>
          </div>
        </div>

        <!-- System Status & Info -->
        <div class="bg-dark-800 border border-dark-700 rounded-2xl p-5">
          <h2 class="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <span>⚙️</span> Info Status Sistem & Database SQLite
          </h2>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
            <div class="bg-dark-900/60 p-3 rounded-xl border border-dark-700/80">
              <div class="text-slate-400">Database SQLite</div>
              <div class="font-mono text-slate-200 font-medium mt-1 truncate" id="sysDbPath">-</div>
            </div>
            <div class="bg-dark-900/60 p-3 rounded-xl border border-dark-700/80">
              <div class="text-slate-400">Uptime Gateway</div>
              <div class="font-mono text-slate-200 font-medium mt-1" id="sysUptime">-</div>
            </div>
            <div class="bg-dark-900/60 p-3 rounded-xl border border-dark-700/80">
              <div class="text-slate-400">Memory (RSS / Heap)</div>
              <div class="font-mono text-slate-200 font-medium mt-1" id="sysMemory">-</div>
            </div>
            <div class="bg-dark-900/60 p-3 rounded-xl border border-dark-700/80">
              <div class="text-slate-400">Runtime Bun</div>
              <div class="font-mono text-slate-200 font-medium mt-1" id="sysBun">-</div>
            </div>
          </div>
        </div>
      </section>

      <!-- ── TAB: MCP SERVERS ── -->
      <section id="tab-servers" class="tab-pane hidden space-y-4">
        <div class="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 class="text-base font-semibold text-white">Daftar Server MCP</h2>
            <p class="text-xs text-slate-400">Mendukung server URL (HTTP/SSE) maupun paket NPM yang dieksekusi via <code>bunx</code> / <code>npx</code></p>
          </div>
          <button onclick="openServerModal()" class="bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium px-4 py-2 rounded-xl transition shadow-lg shadow-blue-600/20 flex items-center gap-1.5">
            <span>+</span> Tambah Server MCP
          </button>
        </div>

        <div class="bg-dark-800 border border-dark-700 rounded-2xl overflow-hidden shadow-sm">
          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs">
              <thead class="bg-dark-900/70 border-b border-dark-700 text-slate-400 uppercase tracking-wider text-[10px]">
                <tr>
                  <th class="py-3 px-4">Status</th>
                  <th class="py-3 px-4">Tipe</th>
                  <th class="py-3 px-4">ID & Nama</th>
                  <th class="py-3 px-4">Target / Perintah</th>
                  <th class="py-3 px-4">Koneksi</th>
                  <th class="py-3 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody id="serversTableBody" class="divide-y divide-dark-700/50">
                <tr><td colspan="6" class="p-6 text-center text-slate-400">Memuat server MCP...</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <!-- ── TAB: OAUTH CLIENTS ── -->
      <section id="tab-clients" class="tab-pane hidden space-y-4">
        <div class="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 class="text-base font-semibold text-white">Klien OAuth 2.1 & Token Akses</h2>
            <p class="text-xs text-slate-400">Kelola kredensial OAuth & Bearer Token untuk berbagai AI Client (Claude, Cursor, Gemini, ChatGPT, LibreChat, dll.)</p>
          </div>
          <div class="flex items-center gap-2">
            <button onclick="openGenerateTokenModal()" class="bg-purple-600 hover:bg-purple-500 text-white text-xs font-medium px-3.5 py-2 rounded-xl transition shadow-lg shadow-purple-600/20 flex items-center gap-1.5">
              <span>🔑</span> Buat Token Akses / API Key
            </button>
            <button onclick="openClientModal()" class="bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium px-3.5 py-2 rounded-xl transition shadow-lg shadow-blue-600/20 flex items-center gap-1.5">
              <span>+</span> Tambah Klien OAuth
            </button>
          </div>
        </div>

        <div class="bg-dark-800 border border-dark-700 rounded-2xl overflow-hidden shadow-sm">
          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs">
              <thead class="bg-dark-900/70 border-b border-dark-700 text-slate-400 uppercase tracking-wider text-[10px]">
                <tr>
                  <th class="py-3 px-4">Status</th>
                  <th class="py-3 px-4">Client ID</th>
                  <th class="py-3 px-4">Nama Aplikasi</th>
                  <th class="py-3 px-4">Client Secret</th>
                  <th class="py-3 px-4">Sesi Aktif</th>
                  <th class="py-3 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody id="clientsTableBody" class="divide-y divide-dark-700/50">
                <tr><td colspan="6" class="p-6 text-center text-slate-400">Memuat klien...</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <!-- ── TAB: TOKENS & SESSIONS ── -->
      <section id="tab-tokens" class="tab-pane hidden space-y-6">
        <div class="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 class="text-base font-semibold text-white">Manajemen Token & Sesi</h2>
            <p class="text-xs text-slate-400">Pantau dan cabut token akses atau refresh token aktif per-klien yang tersimpan di SQLite</p>
          </div>
          <div class="flex items-center gap-2">
            <button onclick="openGenerateTokenModal()" class="bg-purple-600 hover:bg-purple-500 text-white text-xs font-medium px-3 py-1.5 rounded-xl transition shadow-md shadow-purple-600/20 flex items-center gap-1">
              <span>🔑</span> + Buat Token Akses
            </button>
            <select id="tokenClientFilter" onchange="loadTokens()" class="bg-dark-800 border border-dark-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500">
              <option value="">Semua Klien</option>
            </select>
            <button onclick="revokeSelectedClientTokens()" id="btnRevokeClientTokens" class="hidden bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-xs px-3 py-1.5 rounded-xl transition font-medium">
              Cabut Semua Sesi Klien Ini
            </button>
          </div>
        </div>

        <!-- Access Tokens -->
        <div class="bg-dark-800 border border-dark-700 rounded-2xl overflow-hidden shadow-sm">
          <div class="px-4 py-3 bg-dark-900/50 border-b border-dark-700 flex items-center justify-between">
            <h3 class="text-xs font-semibold text-slate-200 uppercase tracking-wider">Access Tokens Aktif (Bearer)</h3>
            <span id="accessTokensCount" class="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 font-mono">0 token</span>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs">
              <thead class="bg-dark-900/30 border-b border-dark-700/60 text-slate-400 uppercase tracking-wider text-[10px]">
                <tr>
                  <th class="py-3 px-4">Token</th>
                  <th class="py-3 px-4">Client ID</th>
                  <th class="py-3 px-4">Pengguna</th>
                  <th class="py-3 px-4">Dibuat</th>
                  <th class="py-3 px-4">Kedaluwarsa</th>
                  <th class="py-3 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody id="accessTokensBody" class="divide-y divide-dark-700/40">
                <tr><td colspan="6" class="p-4 text-center text-slate-400">Tidak ada token</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Refresh Tokens -->
        <div class="bg-dark-800 border border-dark-700 rounded-2xl overflow-hidden shadow-sm">
          <div class="px-4 py-3 bg-dark-900/50 border-b border-dark-700 flex items-center justify-between">
            <h3 class="text-xs font-semibold text-slate-200 uppercase tracking-wider">Refresh Tokens</h3>
            <span id="refreshTokensCount" class="text-xs px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 font-mono">0 token</span>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs">
              <thead class="bg-dark-900/30 border-b border-dark-700/60 text-slate-400 uppercase tracking-wider text-[10px]">
                <tr>
                  <th class="py-3 px-4">Token</th>
                  <th class="py-3 px-4">Client ID</th>
                  <th class="py-3 px-4">Pengguna</th>
                  <th class="py-3 px-4">Status</th>
                  <th class="py-3 px-4">Kedaluwarsa</th>
                  <th class="py-3 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody id="refreshTokensBody" class="divide-y divide-dark-700/40">
                <tr><td colspan="6" class="p-4 text-center text-slate-400">Tidak ada token</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <!-- ── TAB: ACTIVITY LOGS ── -->
      <section id="tab-logs" class="tab-pane hidden space-y-4">
        <div class="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 class="text-base font-semibold text-white">Log Aktivitas Gateway</h2>
            <p class="text-xs text-slate-400">Histori request masuk ke OAuth, proxy HTTP, dan command stdio</p>
          </div>
          <div class="flex items-center gap-2">
            <button onclick="loadLogs()" class="bg-dark-700 hover:bg-dark-600 text-slate-200 text-xs px-3 py-1.5 rounded-xl border border-dark-600 transition flex items-center gap-1">
              <span>🔄</span> Refresh
            </button>
            <button onclick="clearLogs()" class="bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs px-3 py-1.5 rounded-xl border border-red-500/20 transition">
              Bersihkan
            </button>
          </div>
        </div>

        <!-- Filter bar -->
        <div class="flex items-center gap-2 flex-wrap">
          <div class="flex items-center gap-1 bg-dark-800 p-1 rounded-xl border border-dark-700 text-xs">
            <button onclick="setLogFilter('')" id="logFilterAll" class="px-2.5 py-1 rounded-lg bg-blue-600 text-white font-medium">Semua</button>
            <button onclick="setLogFilter('mcp')" id="logFilterMcp" class="px-2.5 py-1 rounded-lg text-slate-400 hover:text-white">MCP</button>
            <button onclick="setLogFilter('oauth')" id="logFilterOauth" class="px-2.5 py-1 rounded-lg text-slate-400 hover:text-white">OAuth</button>
            <button onclick="setLogFilter('error')" id="logFilterError" class="px-2.5 py-1 rounded-lg text-slate-400 hover:text-white">Error (≥400)</button>
          </div>
          <input type="text" id="logSearch" placeholder="Cari path / req id..." oninput="debounce(loadLogs, 300)()" class="bg-dark-800 border border-dark-700 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500">
        </div>

        <div class="bg-dark-800 border border-dark-700 rounded-2xl overflow-hidden shadow-sm">
          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs font-mono">
              <thead class="bg-dark-900/70 border-b border-dark-700 text-slate-400 uppercase tracking-wider text-[10px] font-sans">
                <tr>
                  <th class="py-3 px-4">Waktu</th>
                  <th class="py-3 px-4">Method</th>
                  <th class="py-3 px-4">Path</th>
                  <th class="py-3 px-4">Status</th>
                  <th class="py-3 px-4">Durasi</th>
                  <th class="py-3 px-4">Keterangan</th>
                </tr>
              </thead>
              <tbody id="logsTableBody" class="divide-y divide-dark-700/50">
                <tr><td colspan="6" class="p-6 text-center text-slate-400 font-sans">Memuat log...</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <!-- ── TAB: USERS ── -->
      <section id="tab-users" class="tab-pane hidden space-y-6">
        <div class="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h2 class="text-base font-semibold text-white flex items-center gap-2">
              <span>👥</span> Manajemen Pengguna & Tim
            </h2>
            <p class="text-xs text-slate-400">Kelola akun pengguna, peran administrator/user, dan hak akses gateway.</p>
          </div>
          <button onclick="openUserModal()" class="bg-blue-600 hover:bg-blue-500 text-white font-medium px-4 py-2 rounded-xl text-xs transition shadow-md shadow-blue-600/30 flex items-center gap-1.5">
            <span>+</span> Tambah Pengguna
          </button>
        </div>

        <div class="bg-dark-800 border border-dark-700 rounded-2xl overflow-hidden shadow-sm">
          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs">
              <thead class="bg-dark-900/70 border-b border-dark-700 text-slate-400 uppercase tracking-wider text-[10px]">
                <tr>
                  <th class="py-3 px-4">Pengguna</th>
                  <th class="py-3 px-4">Username</th>
                  <th class="py-3 px-4">Peran</th>
                  <th class="py-3 px-4">Status</th>
                  <th class="py-3 px-4">Dibuat</th>
                  <th class="py-3 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody id="usersTableBody" class="divide-y divide-dark-700/50">
                <tr><td colspan="6" class="p-6 text-center text-slate-400">Memuat data pengguna...</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <!-- ── TAB: SETTINGS ── -->
      <section id="tab-settings" class="tab-pane hidden space-y-6">
        <div>
          <h2 class="text-base font-semibold text-white">Pengaturan Keamanan & Gateway</h2>
          <p class="text-xs text-slate-400">Ubah kredensial admin dan pantau informasi URL gateway</p>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <!-- Change Password -->
          <div class="bg-dark-800 border border-dark-700 rounded-2xl p-5 space-y-4">
            <h3 class="text-sm font-semibold text-white flex items-center gap-2">
              <span>🔐</span> Ganti Password Admin
            </h3>
            <form onsubmit="changePassword(event)" class="space-y-3 text-xs">
              <div>
                <label class="block text-slate-400 mb-1">Password Lama</label>
                <input type="password" id="oldPass" required class="w-full bg-dark-900 border border-dark-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500">
              </div>
              <div>
                <label class="block text-slate-400 mb-1">Password Baru (minimal 4 karakter)</label>
                <input type="password" id="newPass" required class="w-full bg-dark-900 border border-dark-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500">
              </div>
              <button type="submit" class="bg-blue-600 hover:bg-blue-500 text-white font-medium px-4 py-2 rounded-xl transition shadow-md shadow-blue-600/30">
                Simpan Password Baru
              </button>
            </form>
          </div>

          <!-- Gateway Discovery & Endpoints -->
          <div class="bg-dark-800 border border-dark-700 rounded-2xl p-5 space-y-3 text-xs">
            <h3 class="text-sm font-semibold text-white flex items-center gap-2">
              <span>🌐</span> Discovery & Endpoint Standar
            </h3>
            <div class="space-y-2">
              <div>
                <div class="text-slate-400">OAuth Server Metadata (RFC 8414):</div>
                <a href="${origin}/.well-known/oauth-authorization-server" target="_blank" class="text-blue-400 hover:underline font-mono break-all">${origin}/.well-known/oauth-authorization-server</a>
              </div>
              <div>
                <div class="text-slate-400">OAuth Protected Resource (RFC 9728):</div>
                <a href="${origin}/.well-known/oauth-protected-resource" target="_blank" class="text-blue-400 hover:underline font-mono break-all">${origin}/.well-known/oauth-protected-resource</a>
              </div>
              <div>
                <div class="text-slate-400">Health Check:</div>
                <a href="${origin}/health" target="_blank" class="text-blue-400 hover:underline font-mono break-all">${origin}/health</a>
              </div>
            </div>
          </div>
        </div>
      </section>

    </main>
  </div>

  <!-- ── MODAL: SERVER MCP ── -->
  <div id="serverModal" class="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 hidden">
    <div class="bg-dark-800 border border-dark-700 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
      <div class="flex items-center justify-between">
        <h3 class="text-base font-semibold text-white" id="serverModalTitle">Tambah Server MCP</h3>
        <button onclick="closeServerModal()" class="text-slate-400 hover:text-white">&times;</button>
      </div>

      <form onsubmit="saveServer(event)" class="space-y-3 text-xs">
        <div>
          <label class="block text-slate-400 mb-1">ID Slug (huruf, angka, dash - misal: <code>dokploy</code> atau <code>filesystem</code>)</label>
          <input type="text" id="srvId" required placeholder="dokploy" class="w-full bg-dark-900 border border-dark-700 rounded-xl px-3 py-2 font-mono text-white focus:outline-none focus:border-blue-500">
        </div>
        <div>
          <label class="block text-slate-400 mb-1">Nama Tampilan</label>
          <input type="text" id="srvName" required placeholder="Dokploy MCP Server" class="w-full bg-dark-900 border border-dark-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500">
        </div>

        <!-- Tipe Server: HTTP vs Command -->
        <div>
          <label class="block text-slate-400 mb-1">Tipe Eksekusi</label>
          <div class="grid grid-cols-2 gap-2">
            <button type="button" onclick="setServerType('http')" id="typeBtnHttp" class="py-2 px-3 rounded-xl border border-blue-500 bg-blue-600/20 text-white font-medium flex items-center justify-center gap-1.5">
              <span>🌐</span> URL Upstream (HTTP)
            </button>
            <button type="button" onclick="setServerType('command')" id="typeBtnCommand" class="py-2 px-3 rounded-xl border border-dark-700 bg-dark-900 text-slate-400 hover:text-white font-medium flex items-center justify-center gap-1.5">
              <span>⚡</span> NPM / Shell (bunx/npx)
            </button>
          </div>
          <input type="hidden" id="srvType" value="http">
        </div>

        <!-- Section: HTTP Specific -->
        <div id="sectionHttp" class="space-y-3">
          <div>
            <label class="block text-slate-400 mb-1">Upstream URL (contoh: <code>http://host.docker.internal:3001</code>)</label>
            <input type="url" id="srvUrl" placeholder="http://host.docker.internal:3001" class="w-full bg-dark-900 border border-dark-700 rounded-xl px-3 py-2 font-mono text-white focus:outline-none focus:border-blue-500">
          </div>
          <div>
            <label class="block text-slate-400 mb-1">Headers Injeksi (JSON, opsional)</label>
            <textarea id="srvHeaders" rows="2" placeholder='{"Authorization": "Bearer token-mcp-upstream"}' class="w-full bg-dark-900 border border-dark-700 rounded-xl px-3 py-2 font-mono text-white focus:outline-none focus:border-blue-500"></textarea>
          </div>
        </div>

        <!-- Section: Command Specific -->
        <div id="sectionCommand" class="space-y-3 hidden">
          <div>
            <div class="flex items-center justify-between mb-1">
              <label class="text-slate-400">Perintah (Command)</label>
              <div class="space-x-1">
                <button type="button" onclick="setCommandPreset('bunx')" class="text-[10px] bg-dark-700 px-2 py-0.5 rounded text-slate-300 hover:text-white">bunx</button>
                <button type="button" onclick="setCommandPreset('npx')" class="text-[10px] bg-dark-700 px-2 py-0.5 rounded text-slate-300 hover:text-white">npx</button>
              </div>
            </div>
            <input type="text" id="srvCommand" placeholder="bunx" class="w-full bg-dark-900 border border-dark-700 rounded-xl px-3 py-2 font-mono text-white focus:outline-none focus:border-blue-500">
          </div>
          <div>
            <label class="block text-slate-400 mb-1">Argumen / Nama Paket (contoh: <code>-y @dokploy/mcp</code> atau <code>dokploy-mcp</code>)</label>
            <input type="text" id="srvArgs" placeholder="-y @dokploy/mcp" class="w-full bg-dark-900 border border-dark-700 rounded-xl px-3 py-2 font-mono text-white focus:outline-none focus:border-blue-500">
          </div>
          <div>
            <label class="block text-slate-400 mb-1">Environment Variables (JSON, contoh: URL & Token Dokploy)</label>
            <textarea id="srvEnvVars" rows="3" placeholder='{"DOKPLOY_URL": "https://dokploy.example.com", "DOKPLOY_API_KEY": "xxx"}' class="w-full bg-dark-900 border border-dark-700 rounded-xl px-3 py-2 font-mono text-white focus:outline-none focus:border-blue-500"></textarea>
          </div>
          <div class="flex items-center justify-between bg-dark-900/60 p-2.5 rounded-xl border border-dark-700">
            <span class="text-[11px] text-slate-400">Uji handshake sebelum menyimpan:</span>
            <button type="button" onclick="testModalCommand()" id="btnTestModalCmd" class="text-xs bg-dark-700 hover:bg-dark-600 px-3 py-1 rounded-lg text-slate-200">
              Test Perintah Sekarang
            </button>
          </div>
        </div>

        <div>
          <label class="block text-slate-400 mb-1">Deskripsi</label>
          <input type="text" id="srvDesc" placeholder="Server MCP Dokploy untuk deployment" class="w-full bg-dark-900 border border-dark-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500">
        </div>
        <div class="flex items-center gap-2 pt-1">
          <input type="checkbox" id="srvEnabled" checked class="w-4 h-4 rounded bg-dark-900 border-dark-700 text-blue-600 focus:ring-0">
          <label for="srvEnabled" class="text-slate-300">Aktifkan server ini</label>
        </div>

        <div class="flex justify-end gap-2 pt-3 border-t border-dark-700">
          <button type="button" onclick="closeServerModal()" class="px-4 py-2 rounded-xl text-slate-300 hover:bg-dark-700 transition">Batal</button>
          <button type="submit" class="bg-blue-600 hover:bg-blue-500 text-white font-medium px-4 py-2 rounded-xl transition shadow-md shadow-blue-600/30">Simpan Server</button>
        </div>
      </form>
    </div>
  </div>

  <!-- ── MODAL: OAUTH CLIENT ── -->
  <div id="clientModal" class="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 hidden">
    <div class="bg-dark-800 border border-dark-700 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
      <div class="flex items-center justify-between">
        <h3 class="text-base font-semibold text-white" id="clientModalTitle">Tambah Klien OAuth</h3>
        <button onclick="closeClientModal()" class="text-slate-400 hover:text-white">&times;</button>
      </div>

      <form onsubmit="saveClient(event)" class="space-y-3 text-xs">
        <div>
          <label class="block text-slate-400 mb-1">Client ID</label>
          <input type="text" id="cliId" required placeholder="claude-desktop" class="w-full bg-dark-900 border border-dark-700 rounded-xl px-3 py-2 font-mono text-white focus:outline-none focus:border-blue-500">
        </div>
        <div>
          <label class="block text-slate-400 mb-1">Nama Aplikasi / Deskripsi</label>
          <input type="text" id="cliName" required placeholder="Claude Desktop (Macbook) atau Google Gemini" class="w-full bg-dark-900 border border-dark-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500">
        </div>
        <div>
          <div class="flex items-center justify-between mb-1">
            <label class="text-slate-400">Client Secret</label>
            <button type="button" onclick="generateClientSecret()" class="text-blue-400 hover:underline text-[11px]">Acak Secret Baru</button>
          </div>
          <input type="text" id="cliSecret" required class="w-full bg-dark-900 border border-dark-700 rounded-xl px-3 py-2 font-mono text-white focus:outline-none focus:border-blue-500">
        </div>
        <div>
          <label class="block text-slate-400 mb-1">Allowed Redirect URIs (dipisah koma, opsional atau '*' untuk semua)</label>
          <input type="text" id="cliRedirects" placeholder="https://google.com, https://chatgpt.com, http://localhost" class="w-full bg-dark-900 border border-dark-700 rounded-xl px-3 py-2 font-mono text-white focus:outline-none focus:border-blue-500">
        </div>
        <div class="flex items-center gap-2 pt-1">
          <input type="checkbox" id="cliEnabled" checked class="w-4 h-4 rounded bg-dark-900 border-dark-700 text-blue-600 focus:ring-0">
          <label for="cliEnabled" class="text-slate-300">Aktifkan klien ini</label>
        </div>

        <div class="flex justify-end gap-2 pt-3 border-t border-dark-700">
          <button type="button" onclick="closeClientModal()" class="px-4 py-2 rounded-xl text-slate-300 hover:bg-dark-700 transition">Batal</button>
          <button type="submit" class="bg-blue-600 hover:bg-blue-500 text-white font-medium px-4 py-2 rounded-xl transition shadow-md shadow-blue-600/30">Simpan Klien</button>
        </div>
      </form>
    </div>
  </div>

  <!-- ── MODAL: UNIVERSAL AI INTEGRATION GUIDE ── -->
  <div id="aiModal" class="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 hidden">
    <div class="bg-dark-800 border border-dark-700 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
      <div class="flex items-center justify-between">
        <h3 class="text-base font-semibold text-white flex items-center gap-2">
          <span>🤖</span> Panduan Integrasi AI (Universal)
        </h3>
        <button onclick="closeAiGuide()" class="text-slate-400 hover:text-white text-lg">&times;</button>
      </div>

      <!-- Selected Client Info Header -->
      <div class="bg-dark-900/90 p-3 rounded-xl border border-dark-700 text-xs font-mono grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div class="flex items-center justify-between bg-dark-800/80 p-2 rounded-lg border border-dark-700/60">
          <div>
            <span class="text-[10px] text-slate-500 block font-sans uppercase font-bold">Client ID</span>
            <span id="aiModalClientId" class="text-blue-300">-</span>
          </div>
          <button onclick="copyElement('aiModalClientId')" class="text-blue-400 hover:underline text-xs">Salin</button>
        </div>
        <div class="flex items-center justify-between bg-dark-800/80 p-2 rounded-lg border border-dark-700/60">
          <div>
            <span class="text-[10px] text-slate-500 block font-sans uppercase font-bold">Client Secret</span>
            <span id="aiModalClientSecret" class="text-blue-300">-</span>
          </div>
          <button onclick="copyElement('aiModalClientSecret')" class="text-blue-400 hover:underline text-xs">Salin</button>
        </div>
      </div>

      <!-- Tabs Navigation in Modal -->
      <div class="flex flex-wrap gap-1.5 border-b border-dark-700 pb-2 text-xs">
        <button onclick="switchAiModalTab('gemini')" id="modalTabGemini" class="px-3 py-1.5 rounded-lg bg-blue-600 text-white font-medium flex items-center gap-1.5">
          <span>🤖</span> Gemini
        </button>
        <button onclick="switchAiModalTab('claude')" id="modalTabClaude" class="px-3 py-1.5 rounded-lg bg-dark-900 text-slate-400 hover:text-white flex items-center gap-1.5">
          <span>🟣</span> Claude Desktop
        </button>
        <button onclick="switchAiModalTab('chatgpt')" id="modalTabChatgpt" class="px-3 py-1.5 rounded-lg bg-dark-900 text-slate-400 hover:text-white flex items-center gap-1.5">
          <span>🟢</span> OpenAI / ChatGPT
        </button>
        <button onclick="switchAiModalTab('cursor')" id="modalTabCursor" class="px-3 py-1.5 rounded-lg bg-dark-900 text-slate-400 hover:text-white flex items-center gap-1.5">
          <span>⚡</span> Cursor
        </button>
        <button onclick="switchAiModalTab('generic')" id="modalTabGeneric" class="px-3 py-1.5 rounded-lg bg-dark-900 text-slate-400 hover:text-white flex items-center gap-1.5">
          <span>🌐</span> REST / SSE
        </button>
      </div>

      <!-- Tab Content: Gemini -->
      <div id="modalContentGemini" class="space-y-3 text-xs">
        <p class="text-slate-300">
          Salin parameter berikut ke konfigurasi OAuth Custom MCP App di Google Gemini:
        </p>
        <div class="space-y-2 font-mono">
          <div class="bg-dark-900 p-2.5 rounded-xl border border-dark-700 flex items-center justify-between gap-2">
            <div>
              <span class="text-[10px] text-slate-500 block font-sans">AUTHORIZATION URL</span>
              <span class="text-slate-200">${origin}/oauth/authorize</span>
            </div>
            <button onclick="copyText('${origin}/oauth/authorize')" class="text-blue-400 hover:underline text-xs">Salin</button>
          </div>
          <div class="bg-dark-900 p-2.5 rounded-xl border border-dark-700 flex items-center justify-between gap-2">
            <div>
              <span class="text-[10px] text-slate-500 block font-sans">TOKEN URL</span>
              <span class="text-slate-200">${origin}/oauth/token</span>
            </div>
            <button onclick="copyText('${origin}/oauth/token')" class="text-blue-400 hover:underline text-xs">Salin</button>
          </div>
          <div class="bg-dark-900 p-2.5 rounded-xl border border-dark-700 flex items-center justify-between gap-2">
            <div>
              <span class="text-[10px] text-slate-500 block font-sans">MCP ENDPOINT URL (CONTOH)</span>
              <span class="text-blue-300">${origin}/mcp/<span id="aiModalServerExample">dokploy</span></span>
            </div>
            <button onclick="copyText('${origin}/mcp/dokploy')" class="text-blue-400 hover:underline text-xs">Salin</button>
          </div>
        </div>
      </div>

      <!-- Tab Content: Claude Desktop -->
      <div id="modalContentClaude" class="space-y-3 text-xs hidden">
        <p class="text-slate-300">
          Buka file konfigurasi <code>claude_desktop_config.json</code> Anda dan tempel blok berikut:
        </p>
        <div class="bg-dark-900 p-3 rounded-xl border border-dark-700 font-mono text-[11px] space-y-2">
          <div class="flex items-center justify-between text-slate-400 font-sans">
            <span>JSON Konfigurasi:</span>
            <button onclick="copyModalClaudeConfig()" class="text-blue-400 hover:underline text-xs">Salin JSON</button>
          </div>
          <pre id="modalClaudeJson" class="text-slate-300 overflow-x-auto whitespace-pre">{
  "mcpServers": {
    "dokploy": {
      "url": "${origin}/mcp/dokploy",
      "headers": {
        "Authorization": "Bearer &lt;BUAT_TOKEN_AKSES_DI_BAWAH&gt;"
      }
    }
  }
}</pre>
        </div>
        <div class="bg-purple-950/40 border border-purple-800/40 p-3 rounded-xl flex items-center justify-between gap-3">
          <span class="text-purple-200 text-[11px]">Claude Desktop memerlukan Bearer Token aktif (tanpa browser flow).</span>
          <button onclick="openGenerateTokenFromModal()" class="shrink-0 bg-purple-600 hover:bg-purple-500 text-white font-medium px-3 py-1.5 rounded-lg text-xs transition">
            + Buat Token Sekarang
          </button>
        </div>
      </div>

      <!-- Tab Content: OpenAI / ChatGPT -->
      <div id="modalContentChatgpt" class="space-y-3 text-xs hidden">
        <p class="text-slate-300">
          Di OpenAI Custom GPT Actions, atur autentikasi ke <strong>OAuth</strong>:
        </p>
        <div class="space-y-2 font-mono">
          <div class="bg-dark-900 p-2.5 rounded-xl border border-dark-700 flex items-center justify-between gap-2">
            <div>
              <span class="text-[10px] text-slate-500 block font-sans">AUTHORIZATION URL</span>
              <span class="text-slate-200">${origin}/oauth/authorize</span>
            </div>
            <button onclick="copyText('${origin}/oauth/authorize')" class="text-blue-400 hover:underline text-xs">Salin</button>
          </div>
          <div class="bg-dark-900 p-2.5 rounded-xl border border-dark-700 flex items-center justify-between gap-2">
            <div>
              <span class="text-[10px] text-slate-500 block font-sans">TOKEN URL</span>
              <span class="text-slate-200">${origin}/oauth/token</span>
            </div>
            <button onclick="copyText('${origin}/oauth/token')" class="text-blue-400 hover:underline text-xs">Salin</button>
          </div>
          <div class="bg-dark-900 p-2.5 rounded-xl border border-dark-700">
            <span class="text-[10px] text-slate-500 block font-sans">TOKEN EXCHANGE METHOD</span>
            <span class="text-slate-200">Basic authorization header (atau Default POST)</span>
          </div>
        </div>
        <p class="text-[11px] text-slate-400">
          Redirect URI OpenAI (<code>chatgpt.com</code> & <code>openai.com</code>) sudah otomatis diizinkan oleh gateway.
        </p>
      </div>

      <!-- Tab Content: Cursor -->
      <div id="modalContentCursor" class="space-y-3 text-xs hidden">
        <p class="text-slate-300">
          Di Cursor IDE (Settings &gt; Features &gt; MCP atau file <code>.cursor/mcp.json</code>):
        </p>
        <div class="bg-dark-900 p-3 rounded-xl border border-dark-700 font-mono text-[11px] space-y-2">
          <div class="flex items-center justify-between text-slate-400 font-sans">
            <span>Konfigurasi .cursor/mcp.json:</span>
            <button onclick="copyModalCursorConfig()" class="text-blue-400 hover:underline text-xs">Salin JSON</button>
          </div>
          <pre id="modalCursorJson" class="text-slate-300 overflow-x-auto whitespace-pre">{
  "mcpServers": {
    "dokploy": {
      "url": "${origin}/mcp/dokploy",
      "headers": {
        "Authorization": "Bearer &lt;TOKEN_AKSES&gt;"
      }
    }
  }
}</pre>
        </div>
        <div class="bg-purple-950/40 border border-purple-800/40 p-3 rounded-xl flex items-center justify-between gap-3">
          <span class="text-purple-200 text-[11px]">Gunakan Bearer Token aktif untuk menghubungkan Cursor ke server MCP.</span>
          <button onclick="openGenerateTokenFromModal()" class="shrink-0 bg-purple-600 hover:bg-purple-500 text-white font-medium px-3 py-1.5 rounded-lg text-xs transition">
            + Buat Token Cursor
          </button>
        </div>
      </div>

      <!-- Tab Content: Generic -->
      <div id="modalContentGeneric" class="space-y-3 text-xs hidden">
        <p class="text-slate-300">
          Format request langsung untuk integrasi agent, Open WebUI, LibreChat, atau script:
        </p>
        <div class="bg-dark-900 p-3 rounded-xl border border-dark-700 font-mono text-[11px] space-y-1">
          <div class="text-slate-400 font-sans">Endpoint SSE:</div>
          <div class="text-blue-300">${origin}/mcp/&lt;serverName&gt;</div>
          <div class="text-slate-400 font-sans mt-2">HTTP Header:</div>
          <div class="text-emerald-300">Authorization: Bearer &lt;TOKEN_AKSES&gt;</div>
          <div class="text-emerald-300">Accept: text/event-stream</div>
        </div>
      </div>

      <div class="flex justify-end pt-2 border-t border-dark-700">
        <button onclick="closeAiGuide()" class="bg-dark-700 hover:bg-dark-600 text-white font-medium px-4 py-2 rounded-xl text-xs transition">
          Tutup
        </button>
      </div>
    </div>
  </div>

  <!-- Hidden backward-compatible element for legacy references -->
  <div id="geminiModal" class="hidden"><span id="geminiClientId"></span><span id="geminiClientSecret"></span></div>

  <!-- ── MODAL: GENERATE DIRECT ACCESS TOKEN ── -->
  <div id="generateTokenModal" class="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 hidden">
    <div class="bg-dark-800 border border-dark-700 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
      <div class="flex items-center justify-between">
        <h3 class="text-base font-semibold text-white flex items-center gap-2">
          <span>🔑</span> Buat Token Akses / API Key Langsung
        </h3>
        <button onclick="closeGenerateTokenModal()" class="text-slate-400 hover:text-white text-lg">&times;</button>
      </div>

      <p class="text-xs text-slate-300 leading-relaxed">
        Buat Access Token Bearer statis untuk klien AI yang tidak mendukung alur web redirect OAuth (seperti Claude Desktop, Cursor, Open WebUI, LibreChat, dll.)
      </p>

      <form onsubmit="generateTokenSubmit(event)" class="space-y-3 text-xs">
        <div>
          <label class="block text-slate-400 mb-1">Pilih Klien OAuth</label>
          <select id="genTokenClientId" required class="w-full bg-dark-900 border border-dark-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500 font-mono">
            <option value="">Memuat klien...</option>
          </select>
        </div>

        <div>
          <label class="block text-slate-400 mb-1">Pengguna / Pemilik Token</label>
          <select id="genTokenUserId" class="w-full bg-dark-900 border border-dark-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500 font-mono">
            <option value="">Saya sendiri (akun aktif)</option>
          </select>
        </div>

        <div>
          <label class="block text-slate-400 mb-1">Masa Berlaku Token</label>
          <select id="genTokenTtl" class="w-full bg-dark-900 border border-dark-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500">
            <option value="30">30 Hari (Standar)</option>
            <option value="90">90 Hari</option>
            <option value="365">1 Tahun (365 Hari)</option>
            <option value="0" selected>Permanen / 10 Tahun (Direkomendasikan untuk Claude Desktop & Cursor)</option>
          </select>
        </div>

        <div class="flex justify-end gap-2 pt-2 border-t border-dark-700">
          <button type="button" onclick="closeGenerateTokenModal()" class="px-4 py-2 rounded-xl text-slate-300 hover:bg-dark-700 transition">Batal</button>
          <button type="submit" id="btnSubmitGenToken" class="bg-purple-600 hover:bg-purple-500 text-white font-medium px-4 py-2 rounded-xl transition shadow-md shadow-purple-600/30 flex items-center gap-1.5">
            <span>⚡</span> Terbitkan Token
          </button>
        </div>
      </form>

      <!-- Token Result Box -->
      <div id="genTokenResultBox" class="hidden space-y-3 pt-3 border-t border-dark-700 text-xs">
        <div class="bg-emerald-950/40 border border-emerald-800/40 p-3 rounded-xl space-y-2">
          <div class="flex items-center justify-between text-emerald-300 font-semibold">
            <span>✓ Token Akses Berhasil Dibuat</span>
            <span id="genTokenExpDisplay" class="text-[10px] font-normal text-emerald-400 font-mono"></span>
          </div>
          <div class="flex items-center gap-2">
            <input type="text" id="genTokenOutput" readonly class="w-full bg-dark-900 border border-dark-700 rounded-xl px-3 py-2 font-mono text-white text-xs select-all">
            <button onclick="copyElementValue('genTokenOutput')" class="shrink-0 bg-dark-700 hover:bg-dark-600 text-white px-3 py-2 rounded-xl">Salin</button>
          </div>
        </div>

        <div class="bg-dark-900/90 p-3 rounded-xl border border-dark-700 space-y-2 font-mono text-[11px]">
          <div class="flex items-center justify-between text-slate-400 font-sans">
            <span>Snippet Siap Tempel untuk Claude Desktop:</span>
            <button onclick="copyGeneratedClaudeJson()" class="text-blue-400 hover:underline text-xs">Salin</button>
          </div>
          <pre id="genClaudeSnippet" class="text-slate-300 overflow-x-auto whitespace-pre"></pre>
        </div>

        <div class="flex justify-end">
          <button onclick="closeGenerateTokenModal()" class="bg-blue-600 hover:bg-blue-500 text-white font-medium px-4 py-2 rounded-xl text-xs transition">
            Selesai
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- ── MODAL: USER MANAGEMENT ── -->
  <div id="userModal" class="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 hidden">
    <div class="bg-dark-800 border border-dark-700 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
      <div class="flex items-center justify-between pb-3 border-b border-dark-700">
        <h3 class="text-sm font-semibold text-white" id="userModalTitle">Tambah Pengguna Baru</h3>
        <button onclick="closeUserModal()" class="text-slate-400 hover:text-white text-lg">&times;</button>
      </div>

      <form onsubmit="saveUser(event)" class="space-y-3 text-xs">
        <input type="hidden" id="usrId">
        <div>
          <label class="block text-slate-400 mb-1">Username (login)</label>
          <input type="text" id="usrUsername" required placeholder="misal: bobby atau dev-team" class="w-full bg-dark-900 border border-dark-700 rounded-xl px-3 py-2 font-mono text-white focus:outline-none focus:border-blue-500">
        </div>
        <div>
          <label class="block text-slate-400 mb-1">Nama Lengkap</label>
          <input type="text" id="usrName" required placeholder="misal: Bobby Pratama" class="w-full bg-dark-900 border border-dark-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500">
        </div>
        <div>
          <label class="block text-slate-400 mb-1">Peran (Role)</label>
          <select id="usrRole" class="w-full bg-dark-900 border border-dark-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500">
            <option value="user">User Biasa (Akses MCP & Token)</option>
            <option value="admin">Administrator (Akses Penuh)</option>
          </select>
        </div>
        <div>
          <label class="block text-slate-400 mb-1" id="usrPassLabel">Password</label>
          <input type="password" id="usrPass" placeholder="Minimal 4 karakter" class="w-full bg-dark-900 border border-dark-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500">
          <p id="usrPassHelp" class="text-[10px] text-slate-500 mt-1 hidden">Kosongkan jika tidak ingin mengubah password.</p>
        </div>
        <div class="flex items-center gap-2 pt-1">
          <input type="checkbox" id="usrEnabled" class="rounded bg-dark-900 border-dark-700 text-blue-600 focus:ring-0">
          <label for="usrEnabled" class="text-slate-300">Akun Aktif (Dapat Login & Akses Gateway)</label>
        </div>

        <div class="flex justify-end gap-2 pt-3 border-t border-dark-700">
          <button type="button" onclick="closeUserModal()" class="px-4 py-2 rounded-xl text-slate-400 hover:text-white">Batal</button>
          <button type="submit" id="btnSaveUser" class="bg-blue-600 hover:bg-blue-500 text-white font-medium px-4 py-2 rounded-xl transition shadow-md shadow-blue-600/30">
            Simpan Pengguna
          </button>
        </div>
      </form>
    </div>
  </div>

  <script>
    let currentFilter = '';
    let currentTab = 'overview';
    let isEditingServer = false;
    let isEditingClient = false;
    let cachedClients = [];

    let toastTimeout = null;

    function showToast(msg, isError = false) {
      const toast = document.getElementById('toast');
      const content = document.getElementById('toastContent');
      content.className = \`flex items-center gap-3 px-4 py-3 rounded-xl border shadow-2xl text-xs font-medium \${isError ? 'bg-red-900/95 text-red-200 border-red-700 shadow-red-950/60' : 'bg-emerald-900/95 text-emerald-200 border-emerald-700 shadow-emerald-950/60'}\`;
      content.innerHTML = \`<span>\${isError ? '✗' : '✓'}</span><span>\${msg}</span>\`;
      toast.classList.remove('translate-y-20', 'opacity-0', 'pointer-events-none');
      if (toastTimeout) clearTimeout(toastTimeout);
      toastTimeout = setTimeout(() => {
        toast.classList.add('translate-y-20', 'opacity-0', 'pointer-events-none');
      }, 3500);
    }

    function copyText(txt) {
      navigator.clipboard.writeText(txt);
      showToast('Disalin ke clipboard!');
    }

    function copyElement(id) {
      const txt = document.getElementById(id).innerText;
      copyText(txt);
    }

    function debounce(func, wait) {
      let timeout;
      return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
      };
    }

    function switchTab(tabId) {
      currentTab = tabId;
      document.querySelectorAll('.tab-pane').forEach(el => el.classList.add('hidden'));
      document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('bg-dark-800', 'text-white', 'border', 'border-dark-700');
        btn.classList.add('text-slate-400');
        if (btn.dataset.tab === tabId) {
          btn.classList.add('bg-dark-800', 'text-white', 'border', 'border-dark-700');
          btn.classList.remove('text-slate-400');
        }
      });
      const target = document.getElementById('tab-' + tabId);
      if (target) target.classList.remove('hidden');

      if (tabId === 'overview') loadOverview();
      else if (tabId === 'servers') loadServers();
      else if (tabId === 'clients') loadClients();
      else if (tabId === 'users') loadUsers();
      else if (tabId === 'tokens') loadTokens();
      else if (tabId === 'logs') loadLogs();
    }

    async function api(path, options = {}) {
      try {
        const res = await fetch('/api/admin' + path, {
          headers: { 'Content-Type': 'application/json', ...options.headers },
          ...options,
        });
        const data = await res.json();
        if (!res.ok) {
          if (res.status === 401) {
            window.location.href = '/admin/login';
            return;
          }
          throw new Error(data.error || 'Terjadi kesalahan');
        }
        return data;
      } catch (err) {
        showToast(err.message, true);
        throw err;
      }
    }

    async function logout() {
      await api('/logout', { method: 'POST' });
      window.location.href = '/admin/login';
    }

    // ── Overview ──
    async function loadOverview() {
      try {
        const me = await api('/me');
        if (me && me.user) {
          const badge = document.getElementById('currentUserBadge');
          const nameEl = document.getElementById('currentUserName');
          const roleEl = document.getElementById('currentUserRole');
          if (badge) badge.classList.remove('hidden');
          if (nameEl) nameEl.innerText = me.user.name;
          if (roleEl) roleEl.innerText = me.user.role.toUpperCase();
        }
        if (me && me.isDefaultPassword) {
          document.getElementById('defaultPassWarning').classList.remove('hidden');
        }

        const data = await api('/stats');
        if (data && data.stats) {
          document.getElementById('statServersActive').innerText = data.stats.servers.active;
          document.getElementById('statServersTotal').innerText = data.stats.servers.total;
          document.getElementById('statClientsActive').innerText = data.stats.clients.active;
          document.getElementById('statClientsTotal').innerText = data.stats.clients.total;
          document.getElementById('statTokensAccess').innerText = data.stats.tokens.access;
          document.getElementById('statTokensRefresh').innerText = data.stats.tokens.refresh;
          if (data.stats.users) {
            document.getElementById('statUsersActive').innerText = data.stats.users.active;
            document.getElementById('statUsersTotal').innerText = data.stats.users.total;
          }

          document.getElementById('sysDbPath').innerText = data.system.dbPath;
          const upHours = (data.system.uptime / 3600).toFixed(1);
          document.getElementById('sysUptime').innerText = \`\${upHours} jam (\${data.system.uptime}s)\`;
          document.getElementById('sysMemory').innerText = \`\${data.system.memory.rss}MB / \${data.system.memory.heapUsed}MB\`;
          document.getElementById('sysBun').innerText = \`v\${data.system.bunVersion}\`;
        }
      } catch {}
    }

    // ── MCP Servers ──
    function setServerType(type) {
      document.getElementById('srvType').value = type;
      if (type === 'command') {
        document.getElementById('typeBtnCommand').className = 'py-2 px-3 rounded-xl border border-purple-500 bg-purple-600/20 text-white font-medium flex items-center justify-center gap-1.5';
        document.getElementById('typeBtnHttp').className = 'py-2 px-3 rounded-xl border border-dark-700 bg-dark-900 text-slate-400 hover:text-white font-medium flex items-center justify-center gap-1.5';
        document.getElementById('sectionCommand').classList.remove('hidden');
        document.getElementById('sectionHttp').classList.add('hidden');
      } else {
        document.getElementById('typeBtnHttp').className = 'py-2 px-3 rounded-xl border border-blue-500 bg-blue-600/20 text-white font-medium flex items-center justify-center gap-1.5';
        document.getElementById('typeBtnCommand').className = 'py-2 px-3 rounded-xl border border-dark-700 bg-dark-900 text-slate-400 hover:text-white font-medium flex items-center justify-center gap-1.5';
        document.getElementById('sectionHttp').classList.remove('hidden');
        document.getElementById('sectionCommand').classList.add('hidden');
      }
    }

    function setCommandPreset(cmd) {
      document.getElementById('srvCommand').value = cmd;
      if (cmd === 'bunx' && !document.getElementById('srvArgs').value) {
        document.getElementById('srvArgs').value = '-y @dokploy/mcp';
      }
    }

    async function loadServers() {
      const data = await api('/servers');
      const tbody = document.getElementById('serversTableBody');
      if (!data || !data.servers || data.servers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="p-6 text-center text-slate-400">Belum ada server MCP. Klik "Tambah Server MCP" untuk menambahkan.</td></tr>';
        return;
      }

      tbody.innerHTML = data.servers.map(s => {
        const isCmd = s.server_type === 'command';
        const typeBadge = isCmd
          ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-mono bg-purple-500/10 text-purple-400 border border-purple-500/20">NPM/CMD</span>'
          : '<span class="px-2 py-0.5 rounded-full text-[10px] font-mono bg-blue-500/10 text-blue-400 border border-blue-500/20">HTTP</span>';

        const targetDisplay = isCmd
          ? \`<span class="text-purple-300 font-mono">\${s.command || 'bunx'} \${s.args || ''}</span>\`
          : \`<span class="text-slate-300 font-mono truncate block max-w-xs">\${s.url}</span>\`;

        return \`
          <tr class="hover:bg-dark-900/30 transition">
            <td class="py-3 px-4">
              <button onclick="toggleServer('\${s.id}')" class="px-2.5 py-1 rounded-full text-[11px] font-semibold transition \${s.enabled ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-slate-700 text-slate-400'}">
                \${s.enabled ? '● Aktif' : '○ Mati'}
              </button>
            </td>
            <td class="py-3 px-4">\${typeBadge}</td>
            <td class="py-3 px-4">
              <div class="font-medium text-white">\${s.name}</div>
              <div class="text-[11px] font-mono text-blue-400">/mcp/\${s.id}/*</div>
              \${s.description ? \`<div class="text-[11px] text-slate-400 mt-0.5">\${s.description}</div>\` : ''}
            </td>
            <td class="py-3 px-4">\${targetDisplay}</td>
            <td class="py-3 px-4" id="test-res-\${s.id}">
              <button onclick="testServer('\${s.id}')" class="text-[11px] bg-dark-700 hover:bg-dark-600 border border-dark-600 px-2.5 py-1 rounded-lg text-slate-200 transition">
                Test Ping
              </button>
            </td>
            <td class="py-3 px-4 text-right space-x-2">
              <button onclick="editServer('\${s.id}')" class="text-blue-400 hover:underline">Edit</button>
              <button onclick="deleteServer('\${s.id}')" class="text-red-400 hover:underline">Hapus</button>
            </td>
          </tr>
        \`;
      }).join('');
    }

    async function toggleServer(id) {
      await api(\`/servers/\${id}/toggle\`, { method: 'POST' });
      showToast('Status server diubah');
      loadServers();
      loadOverview();
    }

    async function testServer(id) {
      const container = document.getElementById(\`test-res-\${id}\`);
      container.innerHTML = '<span class="text-[11px] text-slate-400 animate-pulse">Menguji...</span>';
      try {
        const res = await api(\`/servers/\${id}/test\`, { method: 'POST' });
        if (res.result.ok) {
          const info = res.result.serverInfo?.name ? \` (\${res.result.serverInfo.name})\` : '';
          container.innerHTML = \`<span class="text-[11px] text-emerald-400 font-mono">✓ \${res.result.status || 'OK'}\${info} (\${res.result.latencyMs}ms)</span>\`;
        } else {
          container.innerHTML = \`<span class="text-[11px] text-red-400 font-mono" title="\${res.result.error || ''}">✗ Gagal (\${res.result.latencyMs}ms)</span>\`;
        }
      } catch (e) {
        container.innerHTML = '<span class="text-[11px] text-red-400">✗ Error</span>';
      }
    }

    async function testModalCommand() {
      const btn = document.getElementById('btnTestModalCmd');
      btn.disabled = true;
      btn.innerText = 'Menguji Handshake...';
      try {
        const payload = {
          command: document.getElementById('srvCommand').value,
          args: document.getElementById('srvArgs').value,
          env_vars: document.getElementById('srvEnvVars').value,
        };
        const res = await api('/test-connection', { method: 'POST', body: JSON.stringify(payload) });
        if (res.result.ok) {
          showToast(\`Handshake sukses! Latensi: \${res.result.latencyMs}ms\`);
        } else {
          showToast(\`Gagal: \${res.result.error}\`, true);
        }
      } catch (err) {
        showToast(err.message, true);
      } finally {
        btn.disabled = false;
        btn.innerText = 'Test Perintah Sekarang';
      }
    }

    function openServerModal(s = null) {
      isEditingServer = !!s;
      document.getElementById('serverModalTitle').innerText = s ? 'Edit Server MCP' : 'Tambah Server MCP';
      document.getElementById('srvId').value = s ? s.id : '';
      document.getElementById('srvId').disabled = !!s;
      document.getElementById('srvName').value = s ? s.name : '';
      document.getElementById('srvUrl').value = s ? s.url : '';
      document.getElementById('srvHeaders').value = s ? s.headers : '';
      document.getElementById('srvCommand').value = s ? (s.command || 'bunx') : 'bunx';
      document.getElementById('srvArgs').value = s ? s.args : '';
      document.getElementById('srvEnvVars').value = s ? s.env_vars : '';
      document.getElementById('srvDesc').value = s ? s.description : '';
      document.getElementById('srvEnabled').checked = s ? s.enabled : true;

      setServerType(s ? (s.server_type || 'http') : 'http');
      document.getElementById('serverModal').classList.remove('hidden');
    }

    function closeServerModal() {
      document.getElementById('serverModal').classList.add('hidden');
    }

    async function editServer(id) {
      const data = await api('/servers');
      const s = data.servers.find(x => x.id === id);
      if (s) openServerModal(s);
    }

    async function saveServer(e) {
      e.preventDefault();
      const id = document.getElementById('srvId').value;
      const srvType = document.getElementById('srvType').value;
      const payload = {
        id,
        name: document.getElementById('srvName').value,
        server_type: srvType,
        url: document.getElementById('srvUrl').value,
        headers: document.getElementById('srvHeaders').value,
        command: document.getElementById('srvCommand').value,
        args: document.getElementById('srvArgs').value,
        env_vars: document.getElementById('srvEnvVars').value,
        description: document.getElementById('srvDesc').value,
        enabled: document.getElementById('srvEnabled').checked,
      };

      if (isEditingServer) {
        await api(\`/servers/\${id}\`, { method: 'PUT', body: JSON.stringify(payload) });
      } else {
        await api('/servers', { method: 'POST', body: JSON.stringify(payload) });
      }
      closeServerModal();
      showToast('Server MCP disimpan');
      loadServers();
      loadOverview();
    }

    async function deleteServer(id) {
      if (!confirm(\`Hapus server MCP "\${id}"?\`)) return;
      await api(\`/servers/\${id}\`, { method: 'DELETE' });
      showToast('Server dihapus');
      loadServers();
      loadOverview();
    }

    // ── OAuth Clients (Multiple Credentials & Easy Revoke) ──
    async function loadClients() {
      const data = await api('/clients');
      const tbody = document.getElementById('clientsTableBody');
      cachedClients = data.clients || [];

      // Update client dropdown di tab tokens
      const select = document.getElementById('tokenClientFilter');
      const currentSelected = select.value;
      select.innerHTML = '<option value="">Semua Klien</option>' +
        cachedClients.map(c => \`<option value="\${c.id}" \${c.id === currentSelected ? 'selected' : ''}>\${c.name} (\${c.id})</option>\`).join('');

      if (!data || !data.clients || data.clients.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="p-6 text-center text-slate-400">Belum ada klien OAuth. Tambahkan klien untuk AI Anda (Claude, Cursor, Gemini, ChatGPT, dll.).</td></tr>';
        return;
      }

      tbody.innerHTML = data.clients.map(c => {
        const tokensCount = (c.active_tokens?.access || 0) + (c.active_tokens?.refresh || 0);
        return \`
          <tr class="hover:bg-dark-900/30 transition">
            <td class="py-3 px-4">
              <button onclick="toggleClient('\${c.id}')" class="px-2.5 py-1 rounded-full text-[11px] font-semibold transition \${c.enabled ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-slate-700 text-slate-400'}">
                \${c.enabled ? '● Aktif' : '○ Nonaktif'}
              </button>
            </td>
            <td class="py-3 px-4 font-mono font-medium text-blue-400">\${c.id}</td>
            <td class="py-3 px-4 font-medium text-white">\${c.name}</td>
            <td class="py-3 px-4 font-mono">
              <div class="flex items-center gap-1.5">
                <span id="sec-text-\${c.id}" class="text-slate-400 truncate max-w-[130px]">••••••••••••••</span>
                <button onclick="toggleSecret('\${c.id}', '\${c.secret}')" class="text-slate-400 hover:text-white text-[11px] px-1.5 py-0.5 rounded bg-dark-700">Lihat</button>
                <button onclick="copyText('\${c.secret}')" class="text-slate-400 hover:text-white text-[11px] px-1.5 py-0.5 rounded bg-dark-700">Salin</button>
              </div>
            </td>
            <td class="py-3 px-4 font-mono">
              <span class="px-2 py-0.5 rounded-full text-[11px] \${tokensCount > 0 ? 'bg-blue-500/10 text-blue-400 font-bold border border-blue-500/20' : 'text-slate-500'}">
                \${tokensCount} sesi aktif
              </span>
            </td>
            <td class="py-3 px-4 text-right space-x-2">
              <button onclick="openGenerateTokenModal('\${c.id}')" class="text-purple-400 hover:underline font-medium" title="Buat Token Akses / API Key">+ Token</button>
              <button onclick="showAiGuide('\${c.id}', '\${c.secret}')" class="text-emerald-400 hover:underline">Panduan AI</button>
              <button onclick="revokeClientTokens('\${c.id}')" class="text-amber-400 hover:underline" title="Cabut seluruh token aktif klien ini">Cabut Sesi</button>
              <button onclick="openClientModal(cachedClients.find(x => x.id === '\${c.id}'))" class="text-blue-400 hover:underline">Edit</button>
              <button onclick="regenerateSecret('\${c.id}')" class="text-slate-400 hover:text-white hover:underline">Acak Secret</button>
              <button onclick="deleteClient('\${c.id}')" class="text-red-400 hover:underline">Hapus</button>
            </td>
          </tr>
        \`;
      }).join('');
    }

    async function toggleClient(id) {
      await api(\`/clients/\${id}/toggle\`, { method: 'POST' });
      showToast('Status klien diubah');
      loadClients();
      loadOverview();
    }

    async function revokeClientTokens(id) {
      if (!confirm(\`Cabut seluruh token dan sesi aktif untuk klien "\${id}"? Sesi AI yang terhubung akan terputus.\`)) return;
      await api(\`/clients/\${id}/tokens\`, { method: 'DELETE' });
      showToast(\`Seluruh sesi klien "\${id}" berhasil dicabut!\`);
      loadClients();
      loadOverview();
      if (currentTab === 'tokens') loadTokens();
    }

    function toggleSecret(id, secret) {
      const el = document.getElementById(\`sec-text-\${id}\`);
      if (el.innerText === '••••••••••••••') el.innerText = secret;
      else el.innerText = '••••••••••••••';
    }

    function openClientModal(c = null) {
      isEditingClient = !!c;
      document.getElementById('clientModalTitle').innerText = c ? 'Edit Klien OAuth' : 'Tambah Klien OAuth';
      document.getElementById('cliId').value = c ? c.id : '';
      document.getElementById('cliId').disabled = !!c;
      document.getElementById('cliName').value = c ? c.name : '';
      document.getElementById('cliSecret').value = c ? c.secret : generateRandomString(32);
      document.getElementById('cliRedirects').value = c ? c.redirect_uris : '';
      document.getElementById('cliEnabled').checked = c ? c.enabled : true;
      document.getElementById('clientModal').classList.remove('hidden');
    }

    function closeClientModal() {
      document.getElementById('clientModal').classList.add('hidden');
    }

    function generateRandomString(len) {
      const arr = new Uint8Array(len);
      crypto.getRandomValues(arr);
      return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('').slice(0, len);
    }

    function generateClientSecret() {
      document.getElementById('cliSecret').value = generateRandomString(32);
    }

    async function saveClient(e) {
      e.preventDefault();
      const id = document.getElementById('cliId').value;
      const payload = {
        id,
        name: document.getElementById('cliName').value,
        secret: document.getElementById('cliSecret').value,
        redirect_uris: document.getElementById('cliRedirects').value,
        enabled: document.getElementById('cliEnabled').checked,
      };

      if (isEditingClient) {
        await api(\`/clients/\${id}\`, { method: 'PUT', body: JSON.stringify(payload) });
      } else {
        await api('/clients', { method: 'POST', body: JSON.stringify(payload) });
      }
      closeClientModal();
      showToast('Klien OAuth disimpan');
      loadClients();
      loadOverview();
    }

    async function regenerateSecret(id) {
      if (!confirm('Acak ulang secret klien ini? Klien AI yang terhubung harus diperbarui dengan secret baru.')) return;
      const res = await api(\`/clients/\${id}/regenerate-secret\`, { method: 'POST' });
      showToast('Secret baru berhasil di-generate!');
      loadClients();
    }

    async function deleteClient(id) {
      if (!confirm(\`Hapus klien "\${id}" beserta semua token aksesnya?\`)) return;
      await api(\`/clients/\${id}\`, { method: 'DELETE' });
      showToast('Klien dihapus');
      loadClients();
      loadOverview();
    }

    let currentGuideClientId = '';
    let currentGuideClientSecret = '';

    function showAiGuide(id, secret) {
      currentGuideClientId = id;
      currentGuideClientSecret = secret;
      document.getElementById('aiModalClientId').innerText = id;
      document.getElementById('aiModalClientSecret').innerText = secret;
      document.getElementById('geminiClientId').innerText = id;
      document.getElementById('geminiClientSecret').innerText = secret;
      switchAiModalTab('gemini');
      document.getElementById('aiModal').classList.remove('hidden');
    }
    const showGeminiGuide = showAiGuide;

    function closeAiGuide() {
      document.getElementById('aiModal').classList.add('hidden');
    }

    function switchOverviewGuide(platform) {
      const platforms = ['gemini', 'claude', 'chatgpt', 'cursor', 'generic'];
      platforms.forEach(p => {
        const btn = document.getElementById('btnGuide' + p.charAt(0).toUpperCase() + p.slice(1));
        const panel = document.getElementById('guidePanel' + p.charAt(0).toUpperCase() + p.slice(1));
        if (p === platform) {
          if (btn) btn.className = 'px-3 py-1.5 rounded-lg bg-blue-600 text-white font-medium transition flex items-center gap-1.5';
          if (panel) panel.classList.remove('hidden');
        } else {
          if (btn) btn.className = 'px-3 py-1.5 rounded-lg bg-dark-800 text-slate-400 hover:text-white transition flex items-center gap-1.5';
          if (panel) panel.classList.add('hidden');
        }
      });
    }

    function switchAiModalTab(platform) {
      const platforms = ['gemini', 'claude', 'chatgpt', 'cursor', 'generic'];
      platforms.forEach(p => {
        const btn = document.getElementById('modalTab' + p.charAt(0).toUpperCase() + p.slice(1));
        const panel = document.getElementById('modalContent' + p.charAt(0).toUpperCase() + p.slice(1));
        if (p === platform) {
          if (btn) btn.className = 'px-3 py-1.5 rounded-lg bg-blue-600 text-white font-medium flex items-center gap-1.5';
          if (panel) panel.classList.remove('hidden');
        } else {
          if (btn) btn.className = 'px-3 py-1.5 rounded-lg bg-dark-900 text-slate-400 hover:text-white flex items-center gap-1.5';
          if (panel) panel.classList.add('hidden');
        }
      });
    }

    function openGenerateTokenModal(preselectClientId = '') {
      const select = document.getElementById('genTokenClientId');
      if (!cachedClients || cachedClients.length === 0) {
        select.innerHTML = '<option value="">Tidak ada klien aktif</option>';
      } else {
        select.innerHTML = cachedClients.map(c =>
          \`<option value="\${c.id}" \${c.id === preselectClientId ? 'selected' : ''}>\${c.name} (\${c.id})</option>\`
        ).join('');
      }

      const userSelect = document.getElementById('genTokenUserId');
      if (userSelect) {
        api('/users').then(uData => {
          const users = uData.users || [];
          userSelect.innerHTML = '<option value="">Saya sendiri (akun aktif)</option>' +
            users.map(u => \`<option value="\${u.id}">\${u.name} (@\${u.username})</option>\`).join('');
        }).catch(() => {});
      }

      document.getElementById('genTokenResultBox').classList.add('hidden');
      document.getElementById('btnSubmitGenToken').disabled = false;
      document.getElementById('generateTokenModal').classList.remove('hidden');
    }

    function closeGenerateTokenModal() {
      document.getElementById('generateTokenModal').classList.add('hidden');
    }

    function openGenerateTokenFromModal() {
      closeAiGuide();
      openGenerateTokenModal(currentGuideClientId);
    }

    async function generateTokenSubmit(e) {
      e.preventDefault();
      const clientId = document.getElementById('genTokenClientId').value;
      const ttlDays = document.getElementById('genTokenTtl').value;
      const userId = document.getElementById('genTokenUserId')?.value || undefined;
      if (!clientId) {
        showToast('Pilih klien terlebih dahulu', true);
        return;
      }

      const btn = document.getElementById('btnSubmitGenToken');
      btn.disabled = true;
      try {
        const res = await api('/tokens/generate', {
          method: 'POST',
          body: JSON.stringify({ clientId, ttlDays: Number(ttlDays), userId })
        });

        if (res.ok && res.token) {
          showToast('Token akses berhasil diterbitkan!');
          document.getElementById('genTokenOutput').value = res.token;
          const expDate = new Date(res.expiresAt).toLocaleDateString();
          document.getElementById('genTokenExpDisplay').innerText = 'Kedaluwarsa: ' + expDate;

          const origin = window.location.origin;
          const claudeJson = JSON.stringify({
            mcpServers: {
              dokploy: {
                url: origin + '/mcp/dokploy',
                headers: {
                  Authorization: 'Bearer ' + res.token
                }
              }
            }
          }, null, 2);
          document.getElementById('genClaudeSnippet').innerText = claudeJson;
          document.getElementById('genTokenResultBox').classList.remove('hidden');

          if (currentTab === 'tokens') loadTokens();
          loadOverview();
        } else {
          showToast(res.error || 'Gagal membuat token', true);
          btn.disabled = false;
        }
      } catch (err) {
        showToast(err.message, true);
        btn.disabled = false;
      }
    }

    function copyElementValue(id) {
      const val = document.getElementById(id).value;
      copyText(val);
    }

    function copyGeneratedClaudeJson() {
      const txt = document.getElementById('genClaudeSnippet').innerText;
      copyText(txt);
    }

    function copyClaudeConfig() {
      const txt = document.getElementById('claudeConfigSnippet').innerText;
      copyText(txt);
    }

    function copyCursorConfig() {
      const txt = document.getElementById('cursorConfigSnippet').innerText;
      copyText(txt);
    }

    function copyModalClaudeConfig() {
      const txt = document.getElementById('modalClaudeJson').innerText;
      copyText(txt);
    }

    function copyModalCursorConfig() {
      const txt = document.getElementById('modalCursorJson').innerText;
      copyText(txt);
    }

    // ── Tokens & Sessions ──
    async function loadTokens() {
      const selectedClient = document.getElementById('tokenClientFilter')?.value || '';
      const btnRevokeAll = document.getElementById('btnRevokeClientTokens');
      if (selectedClient) {
        btnRevokeAll.classList.remove('hidden');
        btnRevokeAll.innerText = \`Cabut Semua Sesi "\${selectedClient}"\`;
      } else {
        btnRevokeAll.classList.add('hidden');
      }

      const queryUrl = selectedClient ? \`/tokens?clientId=\${encodeURIComponent(selectedClient)}\` : '/tokens';
      const data = await api(queryUrl);
      const accessBody = document.getElementById('accessTokensBody');
      const refreshBody = document.getElementById('refreshTokensBody');

      document.getElementById('accessTokensCount').innerText = \`\${data.accessTokens?.length || 0} token\`;
      document.getElementById('refreshTokensCount').innerText = \`\${data.refreshTokens?.length || 0} token\`;

      if (!data.accessTokens || data.accessTokens.length === 0) {
        accessBody.innerHTML = '<tr><td colspan="6" class="p-4 text-center text-slate-400">Belum ada access token aktif.</td></tr>';
      } else {
        accessBody.innerHTML = data.accessTokens.map(t => {
          const exp = new Date(t.expires_at).toLocaleString();
          const created = new Date(t.created_at).toLocaleString();
          const userName = t.user_username
            ? \`<span class="font-medium text-slate-200">\${t.user_name || t.user_username}</span> <span class="text-[11px] text-slate-400 font-mono">(@\${t.user_username})</span>\`
            : '<span class="text-slate-500 italic">Sistem / Default</span>';
          return \`
            <tr class="hover:bg-dark-900/30 transition">
              <td class="py-2.5 px-4 font-mono text-slate-300">\${t.token.slice(0, 12)}...</td>
              <td class="py-2.5 px-4 font-medium text-white">\${t.client_id}</td>
              <td class="py-2.5 px-4 text-xs">\${userName}</td>
              <td class="py-2.5 px-4 text-slate-400">\${created}</td>
              <td class="py-2.5 px-4 text-slate-400">\${exp}</td>
              <td class="py-2.5 px-4 text-right">
                <button onclick="revokeToken('\${t.token}')" class="text-red-400 hover:underline">Cabut</button>
              </td>
            </tr>
          \`;
        }).join('');
      }

      if (!data.refreshTokens || data.refreshTokens.length === 0) {
        refreshBody.innerHTML = '<tr><td colspan="6" class="p-4 text-center text-slate-400">Belum ada refresh token.</td></tr>';
      } else {
        refreshBody.innerHTML = data.refreshTokens.map(t => {
          const exp = new Date(t.expires_at).toLocaleString();
          const isRevoked = !!t.revoked_at;
          const userName = t.user_username
            ? \`<span class="font-medium text-slate-200">\${t.user_name || t.user_username}</span> <span class="text-[11px] text-slate-400 font-mono">(@\${t.user_username})</span>\`
            : '<span class="text-slate-500 italic">Sistem / Default</span>';
          return \`
            <tr class="hover:bg-dark-900/30 transition">
              <td class="py-2.5 px-4 font-mono text-slate-300">\${t.token.slice(0, 12)}...</td>
              <td class="py-2.5 px-4 font-medium text-white">\${t.client_id}</td>
              <td class="py-2.5 px-4 text-xs">\${userName}</td>
              <td class="py-2.5 px-4">
                \${isRevoked ? '<span class="text-amber-400">Rotated / Revoked</span>' : '<span class="text-emerald-400">● Valid</span>'}
              </td>
              <td class="py-2.5 px-4 text-slate-400">\${exp}</td>
              <td class="py-2.5 px-4 text-right">
                <button onclick="revokeToken('\${t.token}')" class="text-red-400 hover:underline">Cabut</button>
              </td>
            </tr>
          \`;
        }).join('');
      }
    }

    async function revokeSelectedClientTokens() {
      const selectedClient = document.getElementById('tokenClientFilter').value;
      if (!selectedClient) return;
      if (!confirm(\`Cabut semua sesi untuk klien "\${selectedClient}"?\`)) return;
      await api(\`/tokens/client/\${selectedClient}\`, { method: 'DELETE' });
      showToast(\`Semua sesi "\${selectedClient}" dicabut\`);
      loadTokens();
      loadOverview();
    }

    async function revokeToken(tok) {
      if (!confirm('Cabut token ini?')) return;
      await api(\`/tokens/\${tok}\`, { method: 'DELETE' });
      showToast('Token dicabut');
      loadTokens();
      loadOverview();
    }

    // ── Logs ──
    function setLogFilter(filter) {
      currentFilter = filter;
      document.querySelectorAll('[id^="logFilter"]').forEach(btn => {
        btn.className = 'px-2.5 py-1 rounded-lg text-slate-400 hover:text-white';
      });
      if (!filter) document.getElementById('logFilterAll').className = 'px-2.5 py-1 rounded-lg bg-blue-600 text-white font-medium';
      if (filter === 'mcp') document.getElementById('logFilterMcp').className = 'px-2.5 py-1 rounded-lg bg-blue-600 text-white font-medium';
      if (filter === 'oauth') document.getElementById('logFilterOauth').className = 'px-2.5 py-1 rounded-lg bg-blue-600 text-white font-medium';
      if (filter === 'error') document.getElementById('logFilterError').className = 'px-2.5 py-1 rounded-lg bg-blue-600 text-white font-medium';
      loadLogs();
    }

    async function loadLogs() {
      const search = document.getElementById('logSearch')?.value || '';
      let url = \`/logs?limit=100\`;
      if (currentFilter) url += \`&filter=\${currentFilter}\`;
      if (search) url += \`&search=\${encodeURIComponent(search)}\`;

      const data = await api(url);
      const tbody = document.getElementById('logsTableBody');
      if (!data || !data.logs || data.logs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="p-6 text-center text-slate-400 font-sans">Belum ada riwayat aktivitas.</td></tr>';
        return;
      }

      tbody.innerHTML = data.logs.map(l => {
        const d = new Date(l.timestamp);
        const timeStr = d.toLocaleTimeString();

        let statusColor = 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
        if (l.status >= 500) statusColor = 'text-red-400 bg-red-500/10 border-red-500/20';
        else if (l.status >= 400) statusColor = 'text-amber-400 bg-amber-500/10 border-amber-500/20';

        return \`
          <tr class="hover:bg-dark-900/30 transition text-[11px]">
            <td class="py-2 px-4 text-slate-400 whitespace-nowrap">\${timeStr}</td>
            <td class="py-2 px-4 font-bold \${l.method === 'POST' ? 'text-indigo-400' : 'text-blue-400'}">\${l.method}</td>
            <td class="py-2 px-4 text-slate-200 truncate max-w-xs">\${l.path}</td>
            <td class="py-2 px-4">
              <span class="px-2 py-0.5 rounded border \${statusColor}">\${l.status}</span>
            </td>
            <td class="py-2 px-4 text-slate-400">\${l.duration_ms.toFixed(1)}ms</td>
            <td class="py-2 px-4 text-slate-400 truncate max-w-xs">\${l.info || '-'}</td>
          </tr>
        \`;
      }).join('');
    }

    async function clearLogs() {
      if (!confirm('Hapus seluruh riwayat log aktivitas?')) return;
      await api('/logs', { method: 'DELETE' });
      showToast('Log dibersihkan');
      loadLogs();
    }

    // ── User Management ──
    let cachedUsers = [];
    let isEditingUser = false;

    async function loadUsers() {
      const data = await api('/users');
      cachedUsers = data.users || [];
      const tbody = document.getElementById('usersTableBody');

      if (!cachedUsers || cachedUsers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="p-6 text-center text-slate-400">Belum ada data pengguna.</td></tr>';
        return;
      }

      tbody.innerHTML = cachedUsers.map(u => {
        const created = new Date(u.created_at).toLocaleDateString();
        const roleBadge = u.role === 'admin'
          ? '<span class="px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20 text-[10px] font-mono font-semibold uppercase">ADMIN</span>'
          : '<span class="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[10px] font-mono font-medium uppercase">USER</span>';
        const statusBadge = u.enabled
          ? '<span class="text-emerald-400 flex items-center gap-1.5"><span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Aktif</span>'
          : '<span class="text-slate-500 flex items-center gap-1.5"><span class="w-1.5 h-1.5 rounded-full bg-slate-500"></span> Nonaktif</span>';

        return \`
          <tr class="hover:bg-dark-900/30 transition">
            <td class="py-3 px-4">
              <div class="font-medium text-white">\${u.name} \${u.isSelf ? '<span class="text-[10px] text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/20 ml-1">(Anda)</span>' : ''}</div>
              <div class="text-[11px] text-slate-400 font-mono">ID: \${u.id}</div>
            </td>
            <td class="py-3 px-4 font-mono text-slate-300">@\${u.username}</td>
            <td class="py-3 px-4">\${roleBadge}</td>
            <td class="py-3 px-4">\${statusBadge}</td>
            <td class="py-3 px-4 text-slate-400">\${created}</td>
            <td class="py-3 px-4 text-right space-x-2">
              <button onclick="editUser('\${u.id}')" class="text-blue-400 hover:underline">Edit</button>
              \${!u.isSelf ? \`
                <button onclick="toggleUserStatus('\${u.id}')" class="\${u.enabled ? 'text-amber-400' : 'text-emerald-400'} hover:underline">
                  \${u.enabled ? 'Nonaktifkan' : 'Aktifkan'}
                </button>
                <button onclick="deleteUserAccount('\${u.id}', '\${u.username}')" class="text-red-400 hover:underline">Hapus</button>
              \` : ''}
            </td>
          </tr>
        \`;
      }).join('');
    }

    function openUserModal(userId = null) {
      isEditingUser = !!userId;
      const modal = document.getElementById('userModal');
      const title = document.getElementById('userModalTitle');
      const inpId = document.getElementById('usrId');
      const inpUsername = document.getElementById('usrUsername');
      const inpName = document.getElementById('usrName');
      const selRole = document.getElementById('usrRole');
      const inpPass = document.getElementById('usrPass');
      const passLabel = document.getElementById('usrPassLabel');
      const passHelp = document.getElementById('usrPassHelp');
      const chkEnabled = document.getElementById('usrEnabled');

      if (isEditingUser) {
        const u = cachedUsers.find(x => x.id === userId);
        if (!u) return;
        title.innerText = 'Edit Pengguna: @' + u.username;
        inpId.value = u.id;
        inpUsername.value = u.username;
        inpUsername.disabled = true;
        inpName.value = u.name;
        selRole.value = u.role;
        inpPass.value = '';
        inpPass.required = false;
        passLabel.innerText = 'Password Baru (Opsional)';
        passHelp.classList.remove('hidden');
        chkEnabled.checked = !!u.enabled;
      } else {
        title.innerText = 'Tambah Pengguna Baru';
        inpId.value = '';
        inpUsername.value = '';
        inpUsername.disabled = false;
        inpName.value = '';
        selRole.value = 'user';
        inpPass.value = '';
        inpPass.required = true;
        passLabel.innerText = 'Password';
        passHelp.classList.add('hidden');
        chkEnabled.checked = true;
      }
      modal.classList.remove('hidden');
    }

    function editUser(id) {
      openUserModal(id);
    }

    function closeUserModal() {
      document.getElementById('userModal').classList.add('hidden');
    }

    async function saveUser(e) {
      e.preventDefault();
      const id = document.getElementById('usrId').value;
      const username = document.getElementById('usrUsername').value.trim();
      const name = document.getElementById('usrName').value.trim();
      const role = document.getElementById('usrRole').value;
      const password = document.getElementById('usrPass').value;
      const enabled = document.getElementById('usrEnabled').checked;

      const payload = {
        name,
        role,
        enabled,
      };
      if (password) payload.password = password;

      if (isEditingUser) {
        await api(\`/users/\${id}\`, { method: 'PUT', body: JSON.stringify(payload) });
        showToast('Pengguna berhasil diperbarui');
      } else {
        payload.username = username;
        await api('/users', { method: 'POST', body: JSON.stringify(payload) });
        showToast('Pengguna baru berhasil dibuat');
      }

      closeUserModal();
      loadUsers();
      loadOverview();
    }

    async function toggleUserStatus(id) {
      const res = await api(\`/users/\${id}/toggle\`, { method: 'POST' });
      showToast(res.enabled ? 'Pengguna diaktifkan' : 'Pengguna dinonaktifkan');
      loadUsers();
      loadOverview();
    }

    async function deleteUserAccount(id, username) {
      if (!confirm(\`Hapus pengguna "\${username}"? Tindakan ini tidak dapat dibatalkan.\`)) return;
      await api(\`/users/\${id}\`, { method: 'DELETE' });
      showToast('Pengguna dihapus');
      loadUsers();
      loadOverview();
    }

    // ── Change password ──
    async function changePassword(e) {
      e.preventDefault();
      const oldPassword = document.getElementById('oldPass').value;
      const newPassword = document.getElementById('newPass').value;
      await api('/change-password', {
        method: 'POST',
        body: JSON.stringify({ oldPassword, newPassword }),
      });
      showToast('Password admin berhasil diubah!');
      document.getElementById('oldPass').value = '';
      document.getElementById('newPass').value = '';
      document.getElementById('defaultPassWarning').classList.add('hidden');
    }

    // Initial load
    loadOverview();
  </script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export function renderLoginPage(request: Request): Response {
  const isAuth = validateAdminRequest(request);
  if (isAuth) {
    return new Response(null, {
      status: 302,
      headers: { Location: "/admin", "Cache-Control": "no-store" },
    });
  }

  const html = `<!doctype html>
<html lang="id" class="dark">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Login — MCP Gateway Management</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          colors: {
            brand: { 50: '#eff6ff', 500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8' },
            dark: { 900: '#0b0f17', 800: '#111827', 700: '#1f2937' }
          }
        }
      }
    }
  </script>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    body { font-family: 'Inter', system-ui, sans-serif; }
  </style>
</head>
<body class="bg-dark-900 text-slate-100 min-h-screen flex items-center justify-center p-4">

  <div class="max-w-md w-full bg-dark-800 border border-dark-700 rounded-3xl p-8 shadow-2xl space-y-6">
    <div class="text-center space-y-2">
      <div class="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-purple-600 flex items-center justify-center text-white text-xl font-bold mx-auto shadow-lg shadow-blue-500/30">
        ⚡
      </div>
      <h1 class="text-xl font-bold text-white tracking-tight">MCP Gateway Dashboard</h1>
      <p class="text-xs text-slate-400">Masuk untuk mengelola server MCP, klien OAuth, dan token SQLite</p>
    </div>

    <div id="loginError" class="hidden bg-red-500/10 border border-red-500/20 text-red-300 text-xs p-3 rounded-xl"></div>

    <form onsubmit="handleLogin(event)" class="space-y-4 text-xs">
      <div>
        <label class="block text-slate-300 font-medium mb-1.5">Username</label>
        <input type="text" id="username" value="admin" required autofocus placeholder="Masukkan username akun..." class="w-full bg-dark-900 border border-dark-700 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition font-mono">
      </div>

      <div>
        <label class="block text-slate-300 font-medium mb-1.5">Password</label>
        <input type="password" id="password" required placeholder="Masukkan password..." class="w-full bg-dark-900 border border-dark-700 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition">
        <p class="text-[11px] text-slate-500 mt-1.5">Akun default: <code>admin</code> / <code>admin123</code></p>
      </div>

      <button type="submit" id="btnSubmit" class="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 rounded-xl text-sm transition shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2">
        <span>Masuk ke Dashboard</span> &rarr;
      </button>
    </form>
  </div>

  <script>
    async function handleLogin(e) {
      e.preventDefault();
      const errBox = document.getElementById('loginError');
      const btn = document.getElementById('btnSubmit');
      errBox.classList.add('hidden');
      btn.disabled = true;
      btn.innerText = 'Memverifikasi...';

      const username = document.getElementById('username').value.trim();
      const password = document.getElementById('password').value;
      try {
        const res = await fetch('/api/admin/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Username atau password salah');
        window.location.href = '/admin';
      } catch (err) {
        errBox.innerText = err.message;
        errBox.classList.remove('hidden');
        btn.disabled = false;
        btn.innerHTML = '<span>Masuk ke Dashboard</span> &rarr;';
      }
    }
  </script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}
