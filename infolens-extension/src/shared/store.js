/**
 * InfoLens — 数据存储（通过 service worker 中转）
 */

let localCache = {};

function getAllData() { return localCache; }

function normalizeUrl(url) {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '') + u.pathname;
  } catch {
    return url.split('?')[0].split('#')[0];
  }
}

function getEntry(url) {
  if (localCache[url]) return localCache[url];
  const norm = normalizeUrl(url);
  for (const [k, v] of Object.entries(localCache)) {
    if (normalizeUrl(k) === norm) return v;
  }
  return null;
}

function vote(url, domain, tagType) {
  // 同步更新本地缓存（即时响应）
  if (!localCache[url]) localCache[url] = { good:0, spam:0, official:0, offtopic:0, deep:0, outdated:0, domain, userVote:null };
  const d = localCache[url];
  const old = d.userVote;
  if (old === tagType) {
    d[old] = Math.max(0, (d[old]||0) - 1);
    d.userVote = null;
  } else {
    if (old) d[old] = Math.max(0, (d[old]||0) - 1);
    d[tagType] = (d[tagType]||0) + 1;
    d.userVote = tagType;
  }
  // 同步保存到 service worker
  if (typeof chrome !== 'undefined' && chrome.runtime) {
    chrome.runtime.sendMessage({ type: 'VOTE', data: { url, domain, tagType } }).catch(() => {});
  }
  return d;
}

function loadData() {
  return new Promise((resolve) => {
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({ type: 'GET_ALL' }, (r) => {
        if (r && typeof r === 'object') {
          localCache = r;
        }
        resolve();
      });
    } else {
      resolve();
    }
  });
}

function listenForChanges(callback) {
  if (typeof chrome !== 'undefined' && chrome.runtime) {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.type === 'DATA_CHANGED' && msg.data) {
        localCache = msg.data;
        if (callback) callback();
      }
    });
  }
}

function score(entry) {
  if (!entry) return { credibility: 0.5, total: 0 };
  const total = (entry.good||0)+(entry.spam||0)+(entry.official||0)+(entry.offtopic||0)+(entry.deep||0)+(entry.outdated||0);
  if (total === 0) return { credibility: 0.5, total: 0 };
  return { credibility: ((entry.good||0)+(entry.official||0))/total, total };
}

function scoreColor(c) {
  if (c >= 0.8) return '#2e7d32';
  if (c >= 0.6) return '#558b2f';
  if (c >= 0.4) return '#f9a825';
  if (c >= 0.2) return '#e65100';
  return '#c62828';
}

function getDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}
