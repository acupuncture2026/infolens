/**
 * InfoLens — Service Worker（数据中枢 + 云端同步）
 */

const CLOUD_API = 'https://infolens-api.leokin.workers.dev';
let store = {};
let userId = null;

// ── 启动 ──
(async function() {
  // 加载用户 ID
  const uidResult = await chrome.storage.local.get(['userId', 'infolens_persist']);
  userId = uidResult.userId || crypto.randomUUID();
  chrome.storage.local.set({ userId });

  // 加载持久化数据
  if (uidResult.infolens_persist) {
    try { store = JSON.parse(uidResult.infolens_persist); } catch(e) {}
  }
  console.log('[InfoLens] SW 启动, 加载', Object.keys(store).length, '条数据');
})();

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

      // 持久化
      chrome.storage.local.set({ infolens_persist: JSON.stringify(store) });

      // 同步到云端（异步，不阻塞）
      syncToCloud(url, domain, tagType);

      // 通知所有标签页
      chrome.runtime.sendMessage({ type: 'DATA_CHANGED', data: store }).catch(() => {});
      sendResp(d);
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

// 启动时检查，每 6 小时检查一次
setTimeout(checkForUpdate, 10000);
setInterval(checkForUpdate, 6 * 60 * 60 * 1000);

// ── 通知点击 ──
chrome.notifications.onClicked.addListener(() => {
  chrome.tabs.create({ url: `https://github.com/${GITHUB_REPO}` });
});

chrome.notifications.onButtonClicked.addListener(() => {
  chrome.tabs.create({ url: `https://github.com/${GITHUB_REPO}` });
});
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
      console.log('[InfoLens] 云端同步成功:', domain, tagType);
    }
  } catch(e) {
    // 静默失败，不影响本地数据
  }
}
