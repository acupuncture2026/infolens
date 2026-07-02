/**
 * InfoLens — 内容注入器
 * 场景 1: 任何网页 → 右上角浮动徽章
 * 场景 2: 搜索引擎结果页 → 每个结果旁标注
 */

// ── 搜索引擎配置 ──
const ENGINES = {
  baidu: {
    match: /baidu\.com\/s\?/i,
    container: '#content_left .result, #content_left .c-container, .result, .c-container',
    title: 'h3 a, .t a',
    observe: () => document.getElementById('content_left') || document.body,
    extractUrl(link) {
      const mu = link.closest('[mu]')?.getAttribute('mu');
      if (mu && mu.startsWith('http')) return mu;
      const href = link.getAttribute('href') || '';
      if (href.startsWith('http') && !href.includes('baidu.com')) return href;
      return null;
    }
  },
  bing: {
    match: /bing\.com\/search/i,
    container: 'li.b_algo, .b_algo',
    title: 'h2 a, h2 a.tilk, .tilk a',
    observe: () => document.getElementById('b_content') || document.getElementById('b_results') || document.body,
    extractUrl(link) {
      const href = link.getAttribute('href') || '';
      if (href.startsWith('http') && !href.includes('bing.com/')) return href;
      if (href.includes('bing.com/ck/')) {
        try {
          const u = new URL(href).searchParams.get('u');
          if (u) {
            const raw = atob(u.replace(/_/g, '/').replace(/-/g, '+'));
            const m = raw.match(/a1(http.+)$/);
            if (m) return m[1];
          }
        } catch(e) {}
        const parent = link.closest('li.b_algo');
        if (parent) {
          const cite = parent.querySelector('cite');
          if (cite) {
            let t = cite.textContent.trim();
            if (t && !t.startsWith('http')) t = 'https://' + t;
            if (t && !t.includes('bing.com')) return t;
          }
        }
      }
      return null;
    }
  },
  google: {
    match: /google\.\w+\/search\?.*q=/i,
    container: '.g, .MjjYud, .tF2Cxc',
    title: 'a[ping][href]:not([href^="/search"])',
    observe: () => document.getElementById('search') || document.getElementById('main') || document.body,
    extractUrl(link) {
      const href = link.getAttribute('href') || '';
      const m = href.match(/\/url\?q=([^&]+)/);
      if (m) return decodeURIComponent(m[1]);
      if (href.startsWith('http') && !href.includes('google.com/url')) return href;
      return null;
    }
  },
  duckduckgo: {
    match: /duckduckgo\.com/i,
    container: '.result, .nrn-react-div, article',
    title: '.result__a',
    observe: () => document.getElementById('links') || document.getElementById('web_content_wrapper') || document.body,
    extractUrl(link) {
      const href = link.getAttribute('href') || '';
      const m = href.match(/uddg=([^&]+)/);
      if (m) return decodeURIComponent(m[1]);
      if (href.startsWith('http')) return href;
      return null;
    }
  }
};

function detectEngine() {
  const url = window.location.href;
  for (const [name, cfg] of Object.entries(ENGINES)) {
    if (cfg.match.test(url)) return { name, ...cfg };
  }
  return null;
}

// ── 竖排浮动栏 HTML（7 行） ──
function makeBarHTML(entry) {
  const s = score(entry);
  const color = scoreColor(s.display);
  const scoreText = s.total > 0 ? (s.display > 0 ? '+' : '') + s.display : '—';

  const buttons = TAGS.map(x =>
    `<button class="il-btn${x.key===entry?.userVote?' il-active':''}" data-tag="${x.key}"><span class="il-emoji">${x.emoji}</span><span class="il-label">${t(x)}</span></button>`
  ).join('');

  return `<div class="il-score-row"><span class="il-score" style="border-color:${color};color:${color}">${scoreText}</span></div>${buttons}`;
}

// ── 搜索结果横排徽章 HTML ──
function makeBadgeHTML(entry) {
  const s = score(entry);
  const color = entry ? scoreColor(s.display) : '#ccc';
  const scoreText = s.total > 0 ? (s.display > 0 ? '+' : '') + s.display : '—';

  // 有数据时显示标签（最多3个）
  const tags = (entry && s.total > 0
    ? TAGS.filter(x => (entry[x.key]||0) > 0).slice(0, 3).map(x =>
      `<span class="il-tag-sm il-${x.key}-sm" title="${t(x)} (${entry[x.key]})">${x.emoji}${t(x)}<b>${entry[x.key]}</b></span>`
    ).join('') : '');

  // 始终渲染 6 个操作按钮
  const btns = TAGS.map(x =>
    `<button class="il-btn-sm${entry && x.key===entry.userVote?' il-active':''}" data-tag="${x.key}" title="${t(x)}">${x.emoji}</button>`
  ).join('');

  return `<span class="il-score-sm" style="border-color:${color};color:${color}">${scoreText}</span>${tags}<span class="il-div-sm">|</span><span class="il-acts-sm">${btns}</span>`;
}

// ── 场景 1: 页面浮动徽章 ──
function injectPageBadge() {
  const url = window.location.href;
  const domain = getDomain(url);
  const entry = getEntry(url);

  const bar = document.createElement('div');
  bar.id = 'infolens-bar';
  bar.innerHTML = makeBarHTML(entry);
  document.body.appendChild(bar);
  bindBarEvents(bar, url, domain);
}

function bindBarEvents(bar, url, domain) {
  bar.querySelectorAll('.il-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      vote(url, domain, btn.dataset.tag);
      bar.innerHTML = makeBarHTML(getEntry(url));
      bindBarEvents(bar, url, domain);
    });
  });
}

// ── 场景 2: 搜索结果注入 ──
function injectSearchResults(engine) {
  const target = engine.observe();
  if (!target) return;

  const injected = new WeakSet();

  function doInject() {
    const items = target.querySelectorAll(engine.container);
    items.forEach(el => {
      if (injected.has(el)) return;
      const link = el.querySelector(engine.title);
      if (!link) return;
      const url = engine.extractUrl(link);
      if (!url) return;
      const domain = getDomain(url);
      if (!domain) return;

      injected.add(el);
      const entry = getEntry(url);

      const badge = document.createElement('div');
      badge.className = 'il-badge';
      badge.innerHTML = makeBadgeHTML(entry);

      link.style.display = 'inline-flex';
      link.style.alignItems = 'center';
      link.style.gap = '4px';
      link.after(badge);
      bindBadgeEvents(badge, url, domain);
    });
  }

  doInject();

  let timer = null;
  const observer = new MutationObserver(() => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(doInject, 400);
  });
  observer.observe(target, { childList: true, subtree: true });
  window.addEventListener('beforeunload', () => observer.disconnect(), { once: true });
}

function bindBadgeEvents(badge, url, domain) {
  badge.querySelectorAll('.il-btn-sm').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      vote(url, domain, btn.dataset.tag);
      badge.innerHTML = makeBadgeHTML(getEntry(url));
      bindBadgeEvents(badge, url, domain);
    });
  });
}

// ── 启动 ──
(function() {
  try {
    let lastUrl = window.location.href;
    let badgeDone = false;
    let searchDone = false;
    let dataLoaded = false;
    let runTimer = null;

    function run() {
      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        badgeDone = false;
        searchDone = false;
        const oldBar = document.getElementById('infolens-bar');
        if (oldBar) oldBar.remove();
      }

      if (!dataLoaded) return;

      if (!badgeDone && document.body) {
        badgeDone = true;
        injectPageBadge();
      }

      if (!searchDone) {
        const engine = detectEngine();
        if (engine) {
          searchDone = true;
          // 修复 3.3: 检测到搜索页后停止轮询
          if (runTimer) { clearInterval(runTimer); runTimer = null; }
          setTimeout(() => injectSearchResults(engine), 1000);
        }
      }
    }

    // 修复 3.3: 使用 popstate + hashchange 替代轮询检测 SPA 导航
    function onNavigate() {
      lastUrl = window.location.href;
      badgeDone = false;
      searchDone = false;
      const oldBar = document.getElementById('infolens-bar');
      if (oldBar) oldBar.remove();
      if (dataLoaded) run();
    }
    window.addEventListener('popstate', onNavigate);
    window.addEventListener('hashchange', onNavigate);

    // 监听数据变化（其他标签页的投票实时同步）
    listenForChanges(() => {
      const bar = document.getElementById('infolens-bar');
      if (bar) {
        const url = window.location.href;
        const entry = getEntry(url);
        bar.innerHTML = makeBarHTML(entry);
        bindBarEvents(bar, url, getDomain(url));
      }
      document.querySelectorAll('.il-badge').forEach(badge => {
        const url = badge.dataset.url;
        badge.innerHTML = makeBadgeHTML(getEntry(url));
        bindBadgeEvents(badge, url, getDomain(url));
      });
    });

    // 从 service worker 加载数据
    loadData().then(() => {
      dataLoaded = true;
      if (document.readyState === 'complete' || document.readyState === 'interactive') {
        setTimeout(run, 500);
      } else {
        window.addEventListener('DOMContentLoaded', () => setTimeout(run, 500));
      }
      runTimer = setInterval(run, 500);
    });
  } catch(e) {
    console.error('[InfoLens] 启动错误:', e);
  }
})();
