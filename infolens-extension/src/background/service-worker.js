/**
 * InfoLens — Service Worker（数据中枢 + 云端同步）
 */

const CLOUD_API = 'https://infolens-api.leokin.workers.dev';
let store = {};
let userId = null;
let cloudSynced = false;
let syncQueue = [];
let processingQueue = false;

// ── 启动：加载本地数据 + 拉取云端 + 处理未同步队列 ──
(async function() {
  // 加载用户 ID
  const uidResult = await chrome.storage.local.get(['userId', 'infolens_persist', 'infolens_sync_queue']);
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

  // 拉取云端社区数据（合并到本地）
  await pullCloudData();

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
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 10000);
      const resp = await fetch(`${CLOUD_API}/api/dump?offset=${offset}&limit=2000`, { signal: controller.signal });
      if (!resp.ok) break;

      const data = await resp.json();
      total = data.total || 0;

      for (const [url, entry] of Object.entries(data.urls || {})) {
        if (!store[url]) {
          store[url] = { ...entry, domain: entry.domain, userVote: null };
          merged++;
        }
      }

      if (!data.hasMore) break;
      offset += data.limit;
      // 最多拉取 5 页（1 万条），避免阻塞启动
      if (offset >= 10000) break;
    }

    if (merged > 0) {
      console.log('[InfoLens] 云端拉取', merged, '条 (总', total, '条)');
      chrome.storage.local.set({ infolens_persist: JSON.stringify(store) });
      chrome.runtime.sendMessage({ type: 'DATA_CHANGED', data: store }).catch(() => {});
    }
    cloudSynced = true;
  } catch(e) {
    console.warn('[InfoLens] 云端拉取失败:', e.message);
  }
}

// ── 同步队列管理 ──

function saveQueue() {
  chrome.storage.local.set({ infolens_sync_queue: JSON.stringify(syncQueue) });
}

function queueItem(url, domain, tagType) {
  // 去重：同一 URL+类型 不重复入队
  const key = `${url}|${tagType}`;
  if (syncQueue.some(item => `${item.url}|${item.tagType}` === key)) return;
  syncQueue.push({ url, domain, tagType, retryAt: Date.now() });
  saveQueue();
}

async function processQueue() {
  if (processingQueue || syncQueue.length === 0) return;
  processingQueue = true;

  const now = Date.now();
  const dueItems = syncQueue.filter(item => item.retryAt <= now);

  for (const item of dueItems) {
    try {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 5000);
      const resp = await fetch(`${CLOUD_API}/api/tag`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, url: item.url, domain: item.domain, tag_type: item.tagType }),
        signal: controller.signal,
      });

      if (resp.ok) {
        // 成功 → 从队列移除
        const idx = syncQueue.indexOf(item);
        if (idx !== -1) syncQueue.splice(idx, 1);
        saveQueue();
        console.log('[InfoLens] 同步成功:', item.domain, item.tagType);
      } else {
        // 服务端错误 → 延迟重试（指数退避，最长 1 小时）
        item.retryAt = now + Math.min(30000 * Math.pow(2, (item.retries || 0)), 3600000);
        item.retries = (item.retries || 0) + 1;
        saveQueue();
        console.warn('[InfoLens] 同步失败 (HTTP', resp.status, '), 稍后重试:', item.url);
      }
    } catch(e) {
      // 网络错误 → 延迟重试
      item.retryAt = now + Math.min(15000 * Math.pow(2, (item.retries || 0)), 3600000);
      item.retries = (item.retries || 0) + 1;
      saveQueue();
    }
  }

  processingQueue = false;
}

// ── 单条即时同步（VOTE 时调用） ──
async function syncToCloud(url, domain, tagType) {
  try {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 5000);
    const resp = await fetch(`${CLOUD_API}/api/tag`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, url, domain, tag_type: tagType }),
      signal: controller.signal,
    });
    if (resp.ok) {
      console.log('[InfoLens] 云端同步:', domain, tagType);
      return true;
    }
  } catch(e) {}

  // 失败 → 加入待同步队列
  queueItem(url, domain, tagType);
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

      // 即时持久化
      chrome.storage.local.set({ infolens_persist: JSON.stringify(store) });

      // 异步同步到云端（失败自动入队重试）
      syncToCloud(url, domain, tagType);

      // 通知所有标签页
      chrome.runtime.sendMessage({ type: 'DATA_CHANGED', data: store }).catch(() => {});
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
        chrome.storage.local.set({ infolens_persist: JSON.stringify(store) });
        chrome.runtime.sendMessage({ type: 'DATA_CHANGED', data: store }).catch(() => {});
      }
      sendResp({ ok: true });
      break;
    }

    case 'CLEAR':
      store = {};
      chrome.storage.local.set({ infolens_persist: '{}' });
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
