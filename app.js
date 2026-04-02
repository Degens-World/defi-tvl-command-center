// DeFi TVL Command Center — DeFiLlama API
const LLAMA = 'https://api.llama.fi';

let allProtocols = [];
let allChains = [];
let filteredProtocols = [];
let currentPage = 1;
const PAGE_SIZE = 25;
let activeRange = 365;

let chainPieChart = null;
let chainBarChart = null;
let tvlHistoryChart = null;

// ─── Utils ──────────────────────────────────────────────────────────────────

function fmt(n) {
  if (n === undefined || n === null || isNaN(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
  if (abs >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
  if (abs >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
  return '$' + n.toFixed(2);
}

function pct(v) {
  if (v === undefined || v === null || isNaN(v)) return '<span class="change-neu">—</span>';
  const s = (v > 0 ? '+' : '') + v.toFixed(2) + '%';
  const cls = v > 0 ? 'change-pos' : v < 0 ? 'change-neg' : 'change-neu';
  return `<span class="${cls}">${s}</span>`;
}

function truncChains(arr, max = 3) {
  if (!arr || !arr.length) return '';
  const shown = arr.slice(0, max);
  const rest = arr.length - max;
  let html = shown.map(c => `<span class="chain-tag">${c}</span>`).join('');
  if (rest > 0) html += `<span class="chain-tag">+${rest}</span>`;
  return html;
}

// ─── Fetch ───────────────────────────────────────────────────────────────────

async function fetchJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// ─── Bootstrap ───────────────────────────────────────────────────────────────

async function refreshAll() {
  document.getElementById('last-update').textContent = 'Refreshing…';
  try {
    await Promise.all([
      loadProtocols(),
      loadChains(),
      loadTVLHistory(activeRange),
    ]);
    document.getElementById('last-update').textContent = 'Updated ' + new Date().toLocaleTimeString();
  } catch (e) {
    document.getElementById('last-update').textContent = 'Error — retry';
    console.error(e);
  }
}

// ─── Protocols ───────────────────────────────────────────────────────────────

async function loadProtocols() {
  const data = await fetchJSON(`${LLAMA}/protocols`);

  // Filter: must have TVL > 0
  allProtocols = data
    .filter(p => p.tvl > 0)
    .sort((a, b) => b.tvl - a.tvl);

  document.getElementById('protocol-count-val').textContent = allProtocols.length.toLocaleString();

  // Populate category filter
  const cats = [...new Set(allProtocols.map(p => p.category).filter(Boolean))].sort();
  const catSel = document.getElementById('category-filter');
  const prevCat = catSel.value;
  catSel.innerHTML = '<option value="">All Categories</option>' +
    cats.map(c => `<option value="${c}">${c}</option>`).join('');
  catSel.value = prevCat;

  // Populate chain filter
  const chainSet = new Set();
  allProtocols.forEach(p => (p.chains || []).forEach(c => chainSet.add(c)));
  const chainArr = [...chainSet].sort();
  const chainSel = document.getElementById('chain-filter');
  const prevChain = chainSel.value;
  chainSel.innerHTML = '<option value="">All Chains</option>' +
    chainArr.map(c => `<option value="${c}">${c}</option>`).join('');
  chainSel.value = prevChain;

  renderMovers();
  filterProtocols();
}

function filterProtocols() {
  const cat = document.getElementById('category-filter').value;
  const chain = document.getElementById('chain-filter').value;
  const search = document.getElementById('protocol-search').value.trim().toLowerCase();
  const sortBy = document.getElementById('sort-by').value;

  filteredProtocols = allProtocols.filter(p => {
    if (cat && p.category !== cat) return false;
    if (chain && !(p.chains || []).includes(chain)) return false;
    if (search && !p.name.toLowerCase().includes(search)) return false;
    return true;
  });

  if (sortBy === 'change1d') {
    filteredProtocols.sort((a, b) => (b.change_1d ?? -Infinity) - (a.change_1d ?? -Infinity));
  } else if (sortBy === 'change7d') {
    filteredProtocols.sort((a, b) => (b.change_7d ?? -Infinity) - (a.change_7d ?? -Infinity));
  } else {
    filteredProtocols.sort((a, b) => b.tvl - a.tvl);
  }

  currentPage = 1;
  renderProtocolTable();
}

function renderProtocolTable() {
  const tbody = document.getElementById('protocol-tbody');
  const start = (currentPage - 1) * PAGE_SIZE;
  const page = filteredProtocols.slice(start, start + PAGE_SIZE);
  const totalPages = Math.ceil(filteredProtocols.length / PAGE_SIZE);

  document.getElementById('page-info').textContent = `Page ${currentPage} / ${totalPages || 1}`;
  document.getElementById('prev-btn').disabled = currentPage <= 1;
  document.getElementById('next-btn').disabled = currentPage >= totalPages;

  if (!page.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="loading-row">No protocols match your filters.</td></tr>';
    return;
  }

  tbody.innerHTML = page.map((p, i) => {
    const rank = start + i + 1;
    const logo = p.logo || '';
    const logoHtml = logo
      ? `<img class="proto-logo" src="${logo}" alt="" onerror="this.style.display='none'" />`
      : `<div class="proto-logo"></div>`;
    const chains = truncChains(p.chains);
    return `<tr>
      <td class="rank-cell">${rank}</td>
      <td>
        <div class="protocol-name-cell">
          ${logoHtml}
          <span class="proto-name">${p.name}</span>
        </div>
      </td>
      <td>${p.category ? `<span class="category-badge">${p.category}</span>` : '—'}</td>
      <td><div class="chains-cell">${chains}</div></td>
      <td class="tvl-cell">${fmt(p.tvl)}</td>
      <td>${pct(p.change_1d)}</td>
      <td>${pct(p.change_7d)}</td>
    </tr>`;
  }).join('');
}

function prevPage() { if (currentPage > 1) { currentPage--; renderProtocolTable(); } }
function nextPage() {
  const total = Math.ceil(filteredProtocols.length / PAGE_SIZE);
  if (currentPage < total) { currentPage++; renderProtocolTable(); }
}

// ─── Movers ──────────────────────────────────────────────────────────────────

function renderMovers() {
  const withChange = allProtocols.filter(p => p.change_7d !== undefined && p.change_7d !== null && p.tvl > 1e6);

  const gainers = [...withChange].sort((a, b) => b.change_7d - a.change_7d).slice(0, 8);
  const losers = [...withChange].sort((a, b) => a.change_7d - b.change_7d).slice(0, 8);

  document.getElementById('gainers-list').innerHTML = gainers.map(p => `
    <li>
      <div class="mover-left">
        ${p.logo ? `<img class="mover-logo" src="${p.logo}" alt="" onerror="this.style.display='none'" />` : '<div class="mover-logo"></div>'}
        <div>
          <div class="mover-name">${p.name}</div>
          <div class="mover-tvl">${fmt(p.tvl)}</div>
        </div>
      </div>
      <span class="mover-change change-pos">+${p.change_7d.toFixed(2)}%</span>
    </li>`).join('');

  document.getElementById('losers-list').innerHTML = losers.map(p => `
    <li>
      <div class="mover-left">
        ${p.logo ? `<img class="mover-logo" src="${p.logo}" alt="" onerror="this.style.display='none'" />` : '<div class="mover-logo"></div>'}
        <div>
          <div class="mover-name">${p.name}</div>
          <div class="mover-tvl">${fmt(p.tvl)}</div>
        </div>
      </div>
      <span class="mover-change change-neg">${p.change_7d.toFixed(2)}%</span>
    </li>`).join('');
}

// ─── Chains ──────────────────────────────────────────────────────────────────

async function loadChains() {
  const data = await fetchJSON(`${LLAMA}/v2/chains`);
  allChains = data.filter(c => c.tvl > 0).sort((a, b) => b.tvl - a.tvl);

  // Total TVL = sum of all chains
  const total = allChains.reduce((s, c) => s + c.tvl, 0);
  document.getElementById('total-tvl-val').textContent = fmt(total);
  document.getElementById('chain-count-val').textContent = allChains.length.toLocaleString();

  renderChainCharts(allChains.slice(0, 20), total);
}

function renderChainCharts(chains, total) {
  const top10 = chains.slice(0, 10);
  const otherTVL = total - top10.reduce((s, c) => s + c.tvl, 0);

  const pieLabels = [...top10.map(c => c.name), 'Others'];
  const pieData = [...top10.map(c => c.tvl), otherTVL];
  const palette = [
    '#3b82f6','#8b5cf6','#10b981','#f59e0b','#ef4444',
    '#06b6d4','#ec4899','#a3e635','#fb923c','#c084fc','#94a3b8'
  ];

  if (chainPieChart) chainPieChart.destroy();
  chainPieChart = new Chart(document.getElementById('chainPieChart'), {
    type: 'doughnut',
    data: {
      labels: pieLabels,
      datasets: [{ data: pieData, backgroundColor: palette, borderWidth: 1, borderColor: '#0f1526' }]
    },
    options: {
      plugins: {
        legend: { position: 'bottom', labels: { color: '#94a3b8', boxWidth: 12, font: { size: 11 } } },
        tooltip: { callbacks: { label: ctx => ` ${fmt(ctx.raw)} (${(ctx.raw/total*100).toFixed(1)}%)` } }
      },
      cutout: '55%',
    }
  });

  const barLabels = chains.slice(0, 15).map(c => c.name);
  const barData = chains.slice(0, 15).map(c => c.tvl);

  if (chainBarChart) chainBarChart.destroy();
  chainBarChart = new Chart(document.getElementById('chainBarChart'), {
    type: 'bar',
    data: {
      labels: barLabels,
      datasets: [{
        label: 'TVL',
        data: barData,
        backgroundColor: barLabels.map((_, i) => palette[i % palette.length] + 'cc'),
        borderColor: barLabels.map((_, i) => palette[i % palette.length]),
        borderWidth: 1,
        borderRadius: 4,
      }]
    },
    options: {
      indexAxis: 'y',
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ' ' + fmt(ctx.raw) } }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: { color: '#64748b', callback: v => fmt(v) }
        },
        y: { grid: { display: false }, ticks: { color: '#94a3b8', font: { size: 11 } } }
      },
    }
  });
}

// ─── TVL History ─────────────────────────────────────────────────────────────

async function loadTVLHistory(days) {
  const data = await fetchJSON(`${LLAMA}/v2/historicalChainTvl`);
  const cutoff = Date.now() / 1000 - days * 86400;
  const filtered = data.filter(d => d.date >= cutoff);

  const labels = filtered.map(d => {
    const dt = new Date(d.date * 1000);
    return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  });
  const values = filtered.map(d => d.tvl);

  if (tvlHistoryChart) tvlHistoryChart.destroy();
  tvlHistoryChart = new Chart(document.getElementById('tvlHistoryChart'), {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Total DeFi TVL',
        data: values,
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59,130,246,0.08)',
        fill: true,
        tension: 0.3,
        pointRadius: 0,
        pointHoverRadius: 5,
        borderWidth: 2,
      }]
    },
    options: {
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#111827',
          borderColor: '#1e2d4a',
          borderWidth: 1,
          callbacks: { label: ctx => ' ' + fmt(ctx.raw) }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: '#64748b',
            maxTicksLimit: 10,
            maxRotation: 0,
          }
        },
        y: {
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: { color: '#64748b', callback: v => fmt(v) }
        }
      }
    }
  });
}

function setRange(days, btn) {
  activeRange = days;
  document.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  loadTVLHistory(days);
}

// ─── Init ────────────────────────────────────────────────────────────────────

refreshAll();
setInterval(refreshAll, 5 * 60 * 1000); // auto-refresh every 5 min
