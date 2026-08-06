# app/gateway/dashboard.py
"""
Phase 7 — Comprehensive Gateway Admin Panel & Control Dashboard

Serves a state-of-the-art, modern Web UI dashboard with dark mode aesthetics,
glassmorphism design, real-time metrics, live SIM node manager, activation monitor,
pattern registry editor, and interactive SMS pattern testing sandbox.
"""

from fastapi import APIRouter
from fastapi.responses import HTMLResponse

router = APIRouter(tags=["Admin Dashboard"])

DASHBOARD_HTML = """<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>NexNum Gateway — Production Control Dashboard</title>
  <!-- Google Fonts & Lucide Icons -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          fontFamily: {
            sans: ['Inter', 'sans-serif'],
            mono: ['JetBrains Mono', 'monospace'],
          },
          colors: {
            brand: {
              50: '#eef2ff',
              100: '#e0e7ff',
              500: '#6366f1',
              600: '#4f46e5',
              700: '#4338ca',
            },
            dark: {
              bg: '#090d16',
              card: '#111827',
              border: '#1f2937',
              input: '#1f2937'
            }
          }
        }
      }
    }
  </script>
  <style>
    body { background-color: #090d16; color: #f3f4f6; }
    .glass-card { background: rgba(17, 24, 39, 0.7); backdrop-filter: blur(12px); border: 1px solid rgba(255, 255, 255, 0.08); }
    .glow-indigo { box-shadow: 0 0 25px -5px rgba(99, 102, 241, 0.3); }
    .glow-emerald { box-shadow: 0 0 25px -5px rgba(16, 185, 129, 0.3); }
    /* Scrollbar */
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: #090d16; }
    ::-webkit-scrollbar-thumb { background: #374151; border-radius: 3px; }
  </style>
</head>
<body class="font-sans min-h-screen flex flex-col antialiased selection:bg-brand-500 selection:text-white">

  <!-- Header / Navigation -->
  <header class="border-b border-gray-800 bg-gray-900/60 backdrop-blur-md sticky top-0 z-50">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-gradient-to-tr from-brand-600 to-indigo-400 flex items-center justify-center text-white font-black text-xl shadow-lg glow-indigo">
          N
        </div>
        <div>
          <h1 class="text-lg font-bold bg-gradient-to-r from-white via-gray-200 to-gray-400 bg-clip-text text-transparent">
            NexNum Gateway Control Center
          </h1>
          <p class="text-xs text-gray-400 flex items-center gap-1.5">
            <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            High-Performance Production Engine v2.0
          </p>
        </div>
      </div>
      <div class="flex items-center gap-3">
        <button onclick="refreshData()" class="px-3.5 py-1.5 text-xs font-medium bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-lg border border-gray-700 transition flex items-center gap-2">
          <svg id="refresh-icon" class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
          Refresh Live
        </button>
        <span id="last-updated" class="text-xs font-mono text-gray-500">Updated: Just now</span>
      </div>
    </div>
  </header>

  <!-- Main Container -->
  <main class="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

    <!-- KPI Metric Cards Grid -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
      <!-- Card 1 -->
      <div class="glass-card p-5 rounded-2xl relative overflow-hidden group">
        <div class="absolute -right-4 -bottom-4 w-24 h-24 bg-brand-500/10 rounded-full blur-2xl group-hover:bg-brand-500/20 transition"></div>
        <div class="text-xs font-semibold tracking-wider text-gray-400 uppercase">Allocatable SIMs</div>
        <div class="mt-2 flex items-baseline justify-between">
          <span id="stat-total-sims" class="text-3xl font-extrabold text-white">0</span>
          <span id="stat-online-badge" class="px-2 py-0.5 text-xs font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full">0 Online</span>
        </div>
        <div class="mt-3 text-xs text-gray-400 flex justify-between">
          <span>Gateways: <strong id="stat-gateways-count" class="text-gray-200">0</strong></span>
          <span>Legacy: <strong id="stat-legacy-count" class="text-gray-200">0</strong></span>
        </div>
      </div>

      <!-- Card 2 -->
      <div class="glass-card p-5 rounded-2xl relative overflow-hidden group">
        <div class="absolute -right-4 -bottom-4 w-24 h-24 bg-emerald-500/10 rounded-full blur-2xl group-hover:bg-emerald-500/20 transition"></div>
        <div class="text-xs font-semibold tracking-wider text-gray-400 uppercase">Active Redis Activations</div>
        <div class="mt-2 flex items-baseline justify-between">
          <span id="stat-active-activations" class="text-3xl font-extrabold text-white">0</span>
          <span class="px-2 py-0.5 text-xs font-medium text-brand-400 bg-brand-500/10 border border-brand-500/20 rounded-full">Live State</span>
        </div>
        <div class="mt-3 text-xs text-gray-400">
          <span>Concurrency load normal</span>
        </div>
      </div>

      <!-- Card 3 -->
      <div class="glass-card p-5 rounded-2xl relative overflow-hidden group">
        <div class="absolute -right-4 -bottom-4 w-24 h-24 bg-pink-500/10 rounded-full blur-2xl group-hover:bg-pink-500/20 transition"></div>
        <div class="text-xs font-semibold tracking-wider text-gray-400 uppercase">Inbound Stream Backlog</div>
        <div class="mt-2 flex items-baseline justify-between">
          <span id="stat-stream-length" class="text-3xl font-extrabold text-white">0</span>
          <span class="px-2 py-0.5 text-xs font-medium text-purple-400 bg-purple-500/10 border border-purple-500/20 rounded-full">Redis Streams</span>
        </div>
        <div class="mt-3 text-xs text-gray-400 flex justify-between">
          <span>Workers: <strong id="stat-workers-count" class="text-gray-200">3</strong></span>
          <span>Consumer Group: <strong class="text-gray-200">Active</strong></span>
        </div>
      </div>

      <!-- Card 4 -->
      <div class="glass-card p-5 rounded-2xl relative overflow-hidden group">
        <div class="absolute -right-4 -bottom-4 w-24 h-24 bg-amber-500/10 rounded-full blur-2xl group-hover:bg-amber-500/20 transition"></div>
        <div class="text-xs font-semibold tracking-wider text-gray-400 uppercase">Fresh Numbers Engine</div>
        <div class="mt-2 flex items-baseline justify-between">
          <span class="text-2xl font-bold text-emerald-400">Optimal</span>
          <span class="px-2 py-0.5 text-xs font-medium text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-full">Score +100</span>
        </div>
        <div class="mt-3 text-xs text-gray-400">
          <span>Pre-scorer running every 60s</span>
        </div>
      </div>
    </div>

    <!-- Navigation Tabs -->
    <div class="border-b border-gray-800 flex gap-6">
      <button onclick="switchTab('devices')" id="tab-btn-devices" class="pb-3 text-sm font-semibold text-brand-400 border-b-2 border-brand-500 transition">
        📱 Devices & SIM Manager
      </button>
      <button onclick="switchTab('activations')" id="tab-btn-activations" class="pb-3 text-sm font-semibold text-gray-400 hover:text-gray-200 border-b-2 border-transparent transition">
        ⚡ Live Activations
      </button>
      <button onclick="switchTab('patterns')" id="tab-btn-patterns" class="pb-3 text-sm font-semibold text-gray-400 hover:text-gray-200 border-b-2 border-transparent transition">
        🛠️ Service Pattern Registry
      </button>
      <button onclick="switchTab('tester')" id="tab-btn-tester" class="pb-3 text-sm font-semibold text-gray-400 hover:text-gray-200 border-b-2 border-transparent transition">
        🧪 Pattern Test Sandbox
      </button>
    </div>

    <!-- TAB 1: Devices & SIM Manager -->
    <div id="tab-content-devices" class="space-y-4">
      <div class="flex flex-col sm:flex-row gap-3 justify-between items-center">
        <input type="text" id="device-search" oninput="filterDevices()" placeholder="Search by Device ID, Phone Number, Carrier..." class="w-full sm:w-80 px-4 py-2 text-sm bg-gray-900 border border-gray-700 rounded-xl focus:outline-none focus:border-brand-500 text-gray-100 placeholder-gray-500">
        <div class="flex gap-2 text-xs">
          <button onclick="setDeviceFilter('all')" class="px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium">All SIMs</button>
          <button onclick="setDeviceFilter('online')" class="px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">Online Only</button>
          <button onclick="setDeviceFilter('silentgate')" class="px-3 py-1.5 rounded-lg bg-brand-500/10 text-brand-400 border border-brand-500/20 font-medium">Gateways</button>
        </div>
      </div>

      <div class="glass-card rounded-2xl overflow-hidden border border-gray-800">
        <div class="overflow-x-auto">
          <table class="w-full text-left text-sm text-gray-300">
            <thead class="bg-gray-900/80 text-xs uppercase text-gray-400 border-b border-gray-800 font-semibold">
              <tr>
                <th class="px-6 py-4">Device ID</th>
                <th class="px-6 py-4">SIM Slot</th>
                <th class="px-6 py-4">Phone Number</th>
                <th class="px-6 py-4">Carrier</th>
                <th class="px-6 py-4">Schema</th>
                <th class="px-6 py-4">Battery</th>
                <th class="px-6 py-4">Status</th>
                <th class="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody id="devices-table-body" class="divide-y divide-gray-800/60 font-mono text-xs">
              <!-- Rendered via JS -->
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- TAB 2: Live Activations -->
    <div id="tab-content-activations" class="space-y-4 hidden">
      <div class="glass-card rounded-2xl overflow-hidden border border-gray-800">
        <div class="overflow-x-auto">
          <table class="w-full text-left text-sm text-gray-300">
            <thead class="bg-gray-900/80 text-xs uppercase text-gray-400 border-b border-gray-800 font-semibold">
              <tr>
                <th class="px-6 py-4">Activation ID</th>
                <th class="px-6 py-4">Device ID</th>
                <th class="px-6 py-4">Phone</th>
                <th class="px-6 py-4">Service</th>
                <th class="px-6 py-4">Status</th>
                <th class="px-6 py-4">Extracted OTP Code</th>
                <th class="px-6 py-4">Elapsed</th>
              </tr>
            </thead>
            <tbody id="activations-table-body" class="divide-y divide-gray-800/60 font-mono text-xs">
              <!-- Rendered via JS -->
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- TAB 3: Service Pattern Registry -->
    <div id="tab-content-patterns" class="space-y-4 hidden">
      <div class="glass-card rounded-2xl p-6 border border-gray-800">
        <h3 class="text-base font-bold text-white mb-4">Registered Service Patterns (25+ Supported)</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" id="patterns-grid">
          <!-- Rendered via JS -->
        </div>
      </div>
    </div>

    <!-- TAB 4: Pattern Test Sandbox -->
    <div id="tab-content-tester" class="space-y-4 hidden">
      <div class="glass-card rounded-2xl p-6 border border-gray-800 max-w-2xl mx-auto space-y-4">
        <h3 class="text-lg font-bold text-white">SMS Pattern Matching Test Sandbox</h3>
        <p class="text-xs text-gray-400">Test sample SMS text & sender ID against service regexes in real-time.</p>
        
        <div>
          <label class="block text-xs font-semibold text-gray-300 mb-1">Target Service Code</label>
          <select id="test-service" class="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-xl text-sm text-gray-100">
            <option value="tg">Telegram (tg)</option>
            <option value="wa">WhatsApp (wa)</option>
            <option value="go">Google / YouTube (go)</option>
            <option value="ig">Instagram (ig)</option>
            <option value="fb">Facebook (fb)</option>
            <option value="tw">Twitter / X (tw)</option>
            <option value="oi">Tinder (oi)</option>
            <option value="ub">Uber (ub)</option>
            <option value="am">Amazon (am)</option>
            <option value="sw">Swiggy (sw)</option>
            <option value="zo">Zomato (zo)</option>
            <option value="ot">Other / Fallback (ot)</option>
          </select>
        </div>

        <div>
          <label class="block text-xs font-semibold text-gray-300 mb-1">Sender ID / Number</label>
          <input type="text" id="test-sender" placeholder="e.g. Telegram or AD-AMAZON-T" class="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-xl text-sm text-gray-100 placeholder-gray-500">
        </div>

        <div>
          <label class="block text-xs font-semibold text-gray-300 mb-1">Sample SMS Body</label>
          <textarea id="test-body" rows="4" placeholder="Paste sample SMS text here..." class="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-xl text-sm text-gray-100 placeholder-gray-500 font-mono"></textarea>
        </div>

        <button onclick="runPatternTest()" class="w-full py-2.5 bg-brand-600 hover:bg-brand-500 text-white font-semibold text-sm rounded-xl transition glow-indigo">
          Run Pattern Match Test
        </button>

        <!-- Result Box -->
        <div id="test-result-box" class="hidden p-4 rounded-xl border text-sm font-mono space-y-1"></div>
      </div>
    </div>

  </main>

  <!-- JS Controller -->
  <script>
    let allDevices = [];
    let currentFilter = 'all';

    async function refreshData() {
      const btn = document.getElementById('refresh-icon');
      btn.classList.add('animate-spin');
      try {
        const statsRes = await fetch('/api/v1/admin/stats');
        const stats = await statsRes.json();
        
        document.getElementById('stat-total-sims').innerText = stats.sim_nodes.total_allocatable;
        document.getElementById('stat-online-badge').innerText = `${stats.sim_nodes.online} Online`;
        document.getElementById('stat-gateways-count').innerText = stats.sim_nodes.gateways_schema;
        document.getElementById('stat-legacy-count').innerText = stats.sim_nodes.legacy_schema;
        document.getElementById('stat-active-activations').innerText = stats.activations.active_in_redis;
        document.getElementById('stat-stream-length').innerText = stats.stream.backlog_length;

        // Fetch Devices
        const devRes = await fetch('/api/v1/admin/devices');
        const devData = await devRes.json();
        allDevices = devData.devices || [];
        renderDevices();

        // Fetch Activations
        const actRes = await fetch('/api/v1/admin/activations');
        const actData = await actRes.json();
        renderActivations(actData.activations || []);

        document.getElementById('last-updated').innerText = `Updated: ${new Date().toLocaleTimeString()}`;
      } catch (e) {
        console.error('Failed to refresh data:', e);
      } finally {
        setTimeout(() => btn.classList.remove('animate-spin'), 500);
      }
    }

    function renderDevices() {
      const tbody = document.getElementById('devices-table-body');
      const search = document.getElementById('device-search').value.toLowerCase();
      
      let filtered = allDevices.filter(d => {
        if (currentFilter === 'online' && !d.isOnline) return false;
        if (currentFilter === 'silentgate' && d.schemaType !== 'silentgate') return false;
        if (search) {
          return d.deviceId.toLowerCase().includes(search) || d.phoneNumber.includes(search) || d.carrier.toLowerCase().includes(search);
        }
        return true;
      });

      if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center py-8 text-gray-500 font-sans text-xs">No matching SIM nodes found</td></tr>`;
        return;
      }

      tbody.innerHTML = filtered.map(d => `
        <tr class="hover:bg-gray-800/40 transition">
          <td class="px-6 py-3.5 font-bold text-white">${d.deviceId}</td>
          <td class="px-6 py-3.5"><span class="px-2 py-0.5 rounded bg-gray-800 text-gray-300">SIM ${d.simSlot}</span></td>
          <td class="px-6 py-3.5 font-bold text-emerald-400">${d.phoneNumber}</td>
          <td class="px-6 py-3.5 text-gray-300">${d.carrier}</td>
          <td class="px-6 py-3.5"><span class="px-2 py-0.5 rounded ${d.schemaType === 'silentgate' ? 'bg-brand-500/10 text-brand-400' : 'bg-gray-800 text-gray-400'}">${d.schemaType}</span></td>
          <td class="px-6 py-3.5 ${d.battery < 20 ? 'text-rose-400 font-bold' : 'text-gray-300'}">${d.battery}%</td>
          <td class="px-6 py-3.5">
            ${d.isOnline ? '<span class="px-2 py-0.5 text-xs text-emerald-400 bg-emerald-500/10 rounded-full font-sans">● Online</span>' : '<span class="px-2 py-0.5 text-xs text-gray-500 bg-gray-800 rounded-full font-sans">○ Offline</span>'}
          </td>
          <td class="px-6 py-3.5 text-right font-sans">
            ${d.isBanned ? 
              `<button onclick="unbanDevice('${d.deviceId}')" class="px-2.5 py-1 text-xs bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-lg transition">Unban</button>` : 
              `<button onclick="banDevice('${d.deviceId}')" class="px-2.5 py-1 text-xs bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-lg transition">Ban</button>`
            }
          </td>
        </tr>
      `).join('');
    }

    function renderActivations(activations) {
      const tbody = document.getElementById('activations-table-body');
      if (!activations || activations.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center py-8 text-gray-500 font-sans text-xs">No active activations in Redis</td></tr>`;
        return;
      }

      tbody.innerHTML = activations.map(a => `
        <tr class="hover:bg-gray-800/40 transition">
          <td class="px-6 py-3.5 font-bold text-white">${a.id}</td>
          <td class="px-6 py-3.5 text-gray-400">${a.client_id}</td>
          <td class="px-6 py-3.5 font-bold text-emerald-400">${a.number}</td>
          <td class="px-6 py-3.5"><span class="px-2 py-0.5 rounded bg-brand-500/10 text-brand-400 font-bold uppercase">${a.service}</span></td>
          <td class="px-6 py-3.5 font-bold ${a.status === 'STATUS_OK' ? 'text-emerald-400' : a.status === 'STATUS_CANCEL' ? 'text-rose-400' : 'text-amber-400'}">${a.status}</td>
          <td class="px-6 py-3.5 text-white font-bold">${a.code_text || '-'}</td>
          <td class="px-6 py-3.5 text-gray-400">${a.elapsedSeconds}s</td>
        </tr>
      `).join('');
    }

    async function loadPatterns() {
      const grid = document.getElementById('patterns-grid');
      try {
        const res = await fetch('/api/v1/admin/patterns');
        const data = await res.json();
        const patterns = data.patterns || {};
        
        grid.innerHTML = Object.entries(patterns).map(([code, p]) => `
          <div class="p-4 rounded-xl bg-gray-900 border border-gray-800 space-y-2">
            <div class="flex justify-between items-center">
              <span class="font-bold text-white text-sm">${p.name}</span>
              <span class="px-2 py-0.5 rounded bg-brand-500/10 text-brand-400 font-mono text-xs">${code}</span>
            </div>
            <div class="text-xs text-gray-400 font-mono">
              <div>Sender Regex: <span class="text-gray-200">${(p.sender_patterns || []).join(', ')}</span></div>
              <div>Body Regex: <span class="text-gray-200">${(p.body_patterns || []).slice(0, 2).join(', ')}</span></div>
            </div>
          </div>
        `).join('');
      } catch (e) {
        grid.innerHTML = `<div class="text-xs text-rose-400">Failed to load patterns</div>`;
      }
    }

    async function runPatternTest() {
      const serviceCode = document.getElementById('test-service').value;
      const sender = document.getElementById('test-sender').value;
      const body = document.getElementById('test-body').value;
      const box = document.getElementById('test-result-box');

      if (!body) return alert('Please enter sample SMS body text');

      try {
        const res = await fetch('/api/v1/admin/test-match', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({ serviceCode, sender, body })
        });
        const data = await res.json();

        box.classList.remove('hidden', 'bg-emerald-500/10', 'border-emerald-500/30', 'text-emerald-400', 'bg-rose-500/10', 'border-rose-500/30', 'text-rose-400');
        if (data.isMatched) {
          box.classList.add('bg-emerald-500/10', 'border-emerald-500/30', 'text-emerald-400');
          box.innerHTML = `✅ MATCH SUCCESS!<br>Extracted OTP Code: <strong class="text-white text-base">${data.extractedCode}</strong>`;
        } else {
          box.classList.add('bg-rose-500/10', 'border-rose-500/30', 'text-rose-400');
          box.innerHTML = `❌ NO MATCH — SMS did not match pattern for service '${serviceCode}'`;
        }
      } catch (e) {
        alert('Test match failed: ' + e);
      }
    }

    async function banDevice(id) {
      await fetch(`/api/v1/admin/devices/${id}/ban`, { method: 'POST' });
      refreshData();
    }

    async function unbanDevice(id) {
      await fetch(`/api/v1/admin/devices/${id}/unban`, { method: 'POST' });
      refreshData();
    }

    function switchTab(tabName) {
      ['devices', 'activations', 'patterns', 'tester'].forEach(t => {
        document.getElementById(`tab-content-${t}`).classList.add('hidden');
        document.getElementById(`tab-btn-${t}`).classList.remove('text-brand-400', 'border-brand-500');
        document.getElementById(`tab-btn-${t}`).classList.add('text-gray-400', 'border-transparent');
      });

      document.getElementById(`tab-content-${tabName}`).classList.remove('hidden');
      document.getElementById(`tab-btn-${tabName}`).classList.add('text-brand-400', 'border-brand-500');
      document.getElementById(`tab-btn-${tabName}`).classList.remove('text-gray-400', 'border-transparent');

      if (tabName === 'patterns') loadPatterns();
    }

    function setDeviceFilter(filter) {
      currentFilter = filter;
      renderDevices();
    }

    function filterDevices() {
      renderDevices();
    }

    // Auto-refresh data every 5 seconds
    refreshData();
    setInterval(refreshData, 5000);
  </script>
</body>
</html>
"""

@router.get("/admin/dashboard", response_class=HTMLResponse)
@router.get("/admin/gui", response_class=HTMLResponse)
@router.get("/admin", response_class=HTMLResponse)
async def serve_dashboard():
    """Serves the Production Control Dashboard Single-Page Web Application."""
    return DASHBOARD_HTML
