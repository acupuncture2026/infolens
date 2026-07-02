/**
 * InfoLens — Service Worker（数据中枢 + 云端同步）
 */

// Fix 7.3: Configurable API URL — default fallback, overridden by chrome.storage.local on startup
const DEFAULT_CLOUD_API = 'https://infolens-api.leokin.workers.dev';
let cloudApiUrl = DEFAULT_CLOUD_API;

let store = {};
let userId = null;
let cloudSynced = false;
let syncQueue = [];
let processingQueue = false;

// ── 启动：加载本地数据 + 拉取云端（非阻塞） + 处理未同步队列 ──
(async function() {
  // 加载用户 ID + 云端 API 配置 + 持久化数据 + 队列
  const uidResult = await chrome.storage.local.get([
    'userId', 'infolens_persist', 'infolens_sync_queue', 'cloudApiUrl'
  ]);

  // Fix 7.3: 读取可配置的云端 API 地址
  if (uidResult.cloudApiUrl && typeof uidResult.cloudApiUrl === 'string' && uidResult.cloudApiUrl.trim()) {
    cloudApiUrl = uidResult.cloudApiUrl.trim();
  }

  userId = uidResult.userId || crypto.randomUUID();
  chrome.storage.local.set({ userId });

  // 加载持久化数据
  if (uidResult.infolens_persist) {
    try { store = JSON.parse(uidResult.infolens_persist); } catch(e) {}
  }

  // 加载未同步队列
  if (uidResult.infolens_sync_queue) {
    try { syncQueue = JSON.parse(uidResult.infolens_sync_queue); } catch(e) { syncQueue = []; }
  }

  // Fix 8.3: 非阻塞云端拉取 — fire-and-forget，不阻塞启动
  pullCloudData();

  // 处理未同步队列（网络恢复后自动重推）
  processQueue();

  // 设置定时重试（每 15 分钟）
  chrome.alarms.create('syncQueue', { periodInMinutes: 15 });

  console.log('[InfoLens] SW 启动完成, 共', Object.keys(store).length, '条数据, 待同步', syncQueue.length, '条');
})();

// ── Alarm 事件（定时重试同步队列） ──
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'syncQueue' && syncQueue.length > 0) {
    processQueue();
  }
});

// ── 云端拉取（社区标注数据 → 本地） ──
async function pullCloudData() {
  try {
    let offset = 0;
    let total = 0;
    let merged = 0;

    while (true) {
      // 修复：使用 Promise.race 超时，避免 AbortController 在 SW 中被 GC 的问题
      let resp;
      try {
        const fetchPromise = fetch(`${cloudApiUrl}/api/dump?offset=${offset}&limit=2000`);
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 15000));
        resp = await Promise.race([fetchPromise, timeoutPromise]);
      } catch(e) {
        if (e.message === 'timeout') {
          console.warn('[InfoLens] 云端拉取超时');
        } else {
          console.warn('[InfoLens] 云端拉取请求失败:', e.message);
        }
        break;
      }

      if (!resp.ok) break;

      let data;
      try {
        data = await resp.json();
      } catch(e) {
        console.warn('[InfoLens] 云端拉取 JSON 解析失败:', e.message);
        break;
      }

      total = data.total || 0;

      // Fix 5.3: 始终合并云端计数，保留本地 userVote
      for (const [url, entry] of Object.entries(data.urls || {})) {
        if (store[url]) {
          const localVote = store[url].userVote;
          for (const tag of ['good','spam','official','offtopic','deep','outdated']) {
            store[url][tag] = Math.max(store[url][tag] || 0, entry[tag] || 0);
          }
          store[url].userVote = localVote;
          merged++;
        } else {
          store[url] = { ...entry, domain: entry.domain, userVote: null };
          merged++;
        }
      }

      if (!data.hasMore) break;
      offset += data.limit;
      // 最多拉取 5 页（1 万条），避免阻塞启动
      if (offset >= 10000) break;
    }

    // Fix: 如果 store 超过 5000 条，清理零票条目
    const entryCount = Object.keys(store).length;
    if (entryCount > 5000) {
      pruneZeroVoteEntries();
    }

    if (merged > 0 || Object.keys(store).length < entryCount) {
      // Fix 8.1: 存储配额处理
      safeStorageSet({ infolens_persist: JSON.stringify(store) }, () => {
        console.log('[InfoLens] 云端拉取', merged, '条 (总', total, '条)');
        // Fix 3.2: 拉取完成后广播完整 store（因为大量条目变更）
        chrome.runtime.sendMessage({ type: 'DATA_CHANGED', data: store }).catch(() => {});
      });
    }
    cloudSynced = true;
    console.log('[InfoLens] 云端拉取完成');
  } catch(e) {
    console.warn('[InfoLens] 云端拉取失败:', e.message);
  }
}

// ── Fix 8.1: 带错误检查的 storage set 封装 ──
function safeStorageSet(data, callback) {
  chrome.storage.local.set(data, () => {
    if (chrome.runtime.lastError) {
      const msg = chrome.runtime.lastError.message;
      console.error('[InfoLens] Storage error:', msg);
      // 配额超限 → 通知用户并清理零票条目
      if (msg.includes('QUOTA_BYTES') || msg.includes('quota')) {
        pruneZeroVoteEntries();
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'assets/icon-48.png',
          title: 'InfoLens 存储空间不足',
          message: '已自动清理无投票数据的条目以释放空间。',
        });
      }
      if (callback) callback(new Error(msg));
      return;
    }
    if (callback) callback();
  });
}

// ── Fix 8.1: 清理零票条目释放空间 ──
function pruneZeroVoteEntries() {
  const tags = ['good','spam','official','offtopic','deep','outdated'];
  let pruned = 0;
  for (const [url, entry] of Object.entries(store)) {
    if (entry.userVote) continue;
    const allZero = tags.every(t => !entry[t] || entry[t] === 0);
    if (allZero) {
      delete store[url];
      pruned++;
    }
  }
  console.log('[InfoLens] 清理了', pruned, '条零票数据');
  chrome.storage.local.set({ infolens_persist: JSON.stringify(store) });
}

// ── 同步队列管理 ──

function saveQueue() {
  // Fix 8.1: 带错误检查的队列保存
  chrome.storage.local.set({ infolens_sync_queue: JSON.stringify(syncQueue) }, () => {
    if (chrome.runtime.lastError) {
      console.error('[InfoLens] Queue save error:', chrome.runtime.lastError.message);
    }
  });
}

function queueItem(url, domain, tagType) {
  // Fix 1.1: 入队前清理 URL 的查询参数和 hash
  const cleanUrl = url.split('?')[0].split('#')[0];
  // 去重：同一 URL+类型 不重复入队
  const key = `${cleanUrl}|${tagType}`;
  if (syncQueue.some(item => `${item.url}|${item.tagType}` === key)) return;
  syncQueue.push({ url: cleanUrl, domain, tagType, retryAt: Date.now() });
  saveQueue();
}

// Fix 3.1: 队列批量写入 — 不再每项后调用 saveQueue()
async function processQueue() {
  if (processingQueue || syncQueue.length === 0) return;
  processingQueue = true;

  const now = Date.now();
  const dueItems = syncQueue.filter(item => item.retryAt <= now);
  const succeededItems = [];

  for (const item of dueItems) {
    try {
      // Fix 1.1: 使用清理后的 URL
      const cleanUrl = item.url.split('?')[0].split('#')[0];
      const fetchPromise = fetch(`${cloudApiUrl}/api/tag`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, url: cleanUrl, domain: item.domain, tag_type: item.tagType }),
      });
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000));
      const resp = await Promise.race([fetchPromise, timeoutPromise]);

      if (resp.ok) {
        succeededItems.push(item);
        console.log('[InfoLens] 同步成功:', item.domain, item.tagType);
      } else {
        // 服务端错误 → 延迟重试（指数退避，最长 1 小时）
        item.retryAt = now + Math.min(30000 * Math.pow(2, (item.retries || 0)), 3600000);
        item.retries = (item.retries || 0) + 1;
        console.warn('[InfoLens] 同步失败 (HTTP', resp.status, '), 稍后重试:', item.url);
      }
    } catch(e) {
      // 网络错误 → 延迟重试
      item.retryAt = now + Math.min(15000 * Math.pow(2, (item.retries || 0)), 3600000);
      item.retries = (item.retries || 0) + 1;
    }
  }

  // 成功项一次性从队列移除，然后只保存一次
  if (succeededItems.length > 0) {
    for (const item of succeededItems) {
      const idx = syncQueue.indexOf(item);
      if (idx !== -1) syncQueue.splice(idx, 1);
    }
    saveQueue();
  }

  processingQueue = false;
}

// ── 单条即时同步（VOTE 时调用） ──
async function syncToCloud(url, domain, tagType) {
  // Fix 1.1: 同步前清理 URL
  const cleanUrl = url.split('?')[0].split('#')[0];
  try {
    const fetchPromise = fetch(`${cloudApiUrl}/api/tag`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, url: cleanUrl, domain, tag_type: tagType }),
    });
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000));
    const resp = await Promise.race([fetchPromise, timeoutPromise]);
    if (resp.ok) {
      console.log('[InfoLens] 云端同步:', domain, tagType);
      return true;
    }
  } catch(e) {}

  // 失败 → 加入待同步队列
  queueItem(cleanUrl, domain, tagType);
  return false;
}

// ── 消息处理 ──
chrome.runtime.onMessage.addListener((msg, sender, sendResp) => {
  switch (msg.type) {
    case 'GET_ALL':
      sendResp(store);
      break;

    case 'VOTE': {
      const { url, domain, tagType } = msg.data;
      if (!store[url]) store[url] = { good:0, spam:0, official:0, offtopic:0, deep:0, outdated:0, domain, userVote:null };
      const d = store[url];
      const old = d.userVote;
      if (old === tagType) {
        d[old] = Math.max(0, (d[old]||0) - 1);
        d.userVote = null;
      } else {
        if (old) d[old] = Math.max(0, (d[old]||0) - 1);
        d[tagType] = (d[tagType]||0) + 1;
        d.userVote = tagType;
      }

      // Fix 8.1: 带错误检查的即时持久化
      safeStorageSet({ infolens_persist: JSON.stringify(store) });

      // 异步同步到云端（失败自动入队重试）
      syncToCloud(url, domain, tagType);

      // Fix 3.2: 单条投票只广播变更的 URL，而非完整 store
      chrome.runtime.sendMessage({ type: 'DATA_CHANGED', url, entry: store[url] }).catch(() => {});
      sendResp(d);
      break;
    }

    case 'EXPORT':
      sendResp({ data: store, exportedAt: new Date().toISOString() });
      break;

    case 'IMPORT': {
      const imported = msg.data;
      if (imported && typeof imported === 'object') {
        for (const [url, entry] of Object.entries(imported)) {
          if (!store[url]) {
            store[url] = { ...entry, userVote: null };
          }
        }
        // Fix 8.1: 带错误检查的存储
        safeStorageSet({ infolens_persist: JSON.stringify(store) });
        chrome.runtime.sendMessage({ type: 'DATA_CHANGED', data: store }).catch(() => {});
      }
      sendResp({ ok: true });
      break;
    }

    case 'CLEAR':
      store = {};
      // Fix 8.1: 带错误检查的存储
      safeStorageSet({ infolens_persist: '{}' });
      chrome.runtime.sendMessage({ type: 'DATA_CHANGED', data: store }).catch(() => {});
      sendResp({ ok: true });
      break;

    case 'STATS':
      sendResp({
        totalUrls: Object.keys(store).length,
        votedUrls: Object.values(store).filter(v => v.userVote).length,
        domains: new Set(Object.values(store).map(v => v.domain).filter(Boolean)).size,
        cloudSynced,
        pendingSync: syncQueue.length,
      });
      break;

    default:
      sendResp(null);
  }
});

// ── 版本检查（GitHub） ──
const GITHUB_REPO = 'acupuncture2026/infolens';
const GITHUB_API = `https://api.github.com/repos/${GITHUB_REPO}`;

function checkForUpdate() {
  fetch(`${GITHUB_API}/commits/main`, {
    headers: { 'Accept': 'application/vnd.github.v3+json' }
  })
  .then(r => r.json())
  .then(data => {
    if (data.sha) {
      chrome.storage.local.get(['lastCommitSha'], (r) => {
        if (r.lastCommitSha && r.lastCommitSha !== data.sha) {
          chrome.notifications.create({
            type: 'basic',
            iconUrl: 'assets/icon-48.png',
            title: 'InfoLens 有新版本',
            message: `检测到更新\n\n${data.commit.message.split('\n')[0]}\n\n点击前往 GitHub 更新`,
            buttons: [{ title: '查看更新' }],
          });
        }
        chrome.storage.local.set({ lastCommitSha: data.sha });
      });
    }
  })
  .catch(() => {});
}

setTimeout(checkForUpdate, 10000);
setInterval(checkForUpdate, 6 * 60 * 60 * 1000);

// ── 通知 ──
chrome.notifications.onClicked.addListener(() => {
  chrome.tabs.create({ url: `https://github.com/${GITHUB_REPO}` });
});
chrome.notifications.onButtonClicked.addListener(() => {
  chrome.tabs.create({ url: `https://github.com/${GITHUB_REPO}` });
});
