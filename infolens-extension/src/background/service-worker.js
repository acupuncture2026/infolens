/**
 * InfoLens — Service Worker（数据中枢 + 云端同步）
 */

const CLOUD_API = 'https://infolens-api.leokin.workers.dev';
let store = {};
let userId = null;
let cloudSynced = false;

// ── 启动：加载本地数据 + 拉取云端 ──
(async function() {
  // 加载用户 ID
  const uidResult = await chrome.storage.local.get(['userId', 'infolens_persist']);
  userId = uidResult.userId || crypto.randomUUID();
  chrome.storage.local.set({ userId });

  // 加载持久化数据
  if (uidResult.infolens_persist) {
    try { store = JSON.parse(uidResult.infolens_persist); } catch(e) {}
  }

  // 拉取云端社区数据（合并到本地）
  await pullCloudData();

  console.log('[InfoLens] SW 启动完成, 共', Object.keys(store).length, '条数据');
})();

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

      // 同步到云端
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
      });
      break;

    default:
      sendResp(null);
  }
});

// ── 云端同步（投票推送） ──
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
    }
  } catch(e) {}
}

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
