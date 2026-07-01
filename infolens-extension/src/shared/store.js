/**
 * InfoLens — 数据存储（URL 级别，支持 10 万+ 条目）
 * 评分算法：加权投票
 *   👍 值得看   +100
 *   📋 官网     +100
 *   🔍 深度     +50
 *   ⚠️ 偏题     -50
 *   📅 过时     -25
 *   👎 垃圾     -100（每个都扣）
 */

let localCache = {};
// 规范化 URL 索引：规范化 URL → 原始 URL（加速查找）
let normIndex = {};

function getAllData() { return localCache; }

function normalizeUrl(url) {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '') + u.pathname;
  } catch {
    return url.split('?')[0].split('#')[0];
  }
}

function buildNormIndex() {
  normIndex = {};
  for (const url of Object.keys(localCache)) {
    normIndex[normalizeUrl(url)] = url;
  }
}

function getEntry(url) {
  // 精确匹配
  if (localCache[url]) return localCache[url];
  // 索引查找 O(1)
  const norm = normalizeUrl(url);
  const original = normIndex[norm];
  if (original && localCache[original]) return localCache[original];
  return null;
}

function addEntry(url, entry) {
  localCache[url] = entry;
  normIndex[normalizeUrl(url)] = url;
}

function vote(url, domain, tagType) {
  if (!localCache[url]) addEntry(url, { good:0, spam:0, official:0, offtopic:0, deep:0, outdated:0, domain, userVote:null });
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
          buildNormIndex();
        }
        resolve();
      });
    } else { resolve(); }
  });
}

function listenForChanges(callback) {
  if (typeof chrome !== 'undefined' && chrome.runtime) {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.type === 'DATA_CHANGED' && msg.data) {
        localCache = msg.data;
        buildNormIndex();
        if (callback) callback();
      }
    });
  }
}

/**
 * 加权评分
 * 返回: { rawScore, display, total }
 */
const WEIGHTS = {
  good: 100, official: 100, deep: 50,
  offtopic: -50, outdated: -25, spam: -100
};

function score(entry) {
  if (!entry) return { rawScore: 0, display: 0, total: 0 };
  let rawScore = 0;
  let total = 0;
  for (const [tag, weight] of Object.entries(WEIGHTS)) {
    const count = entry[tag] || 0;
    rawScore += count * weight;
    total += count;
  }
  return { rawScore, display: rawScore, total };
}

function scoreColor(s) {
  if (s >= 400) return '#1b5e20';
  if (s >= 200) return '#2e7d32';
  if (s >= 100) return '#43a047';
  if (s >= 50)  return '#7cb342';
  if (s >= 10)  return '#f9a825';
  if (s >= -10) return '#fdd835';
  if (s >= -50) return '#e65100';
  if (s >= -100) return '#d84315';
  if (s >= -200) return '#c62828';
  return '#b71c1c';
}

function getDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}
