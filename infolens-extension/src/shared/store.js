/**
 * InfoLens — 数据存储（URL 级别）
 * 评分算法：加权投票
 *   👍 值得看   +100
 *   📋 官网     +100
 *   🔍 深度     +50
 *   ⚠️ 偏题     -50
 *   📅 过时     -25
 *   👎 垃圾     -100（每个都扣）
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
  if (typeof chrome !== 'undefined' && chrome.runtime) {
    chrome.runtime.sendMessage({ type: 'VOTE', data: { url, domain, tagType } }).catch(() => {});
  }
  return d;
}

function loadData() {
  return new Promise((resolve) => {
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({ type: 'GET_ALL' }, (r) => {
        if (r && typeof r === 'object') localCache = r;
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
        if (callback) callback();
      }
    });
  }
}

/**
 * 加权评分
 * 返回: { rawScore, display, total }
 *   rawScore: 原始加权分（可负数）
 *   display:  显示分（-100 ~ 100）
 *   total:    总票数
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
  // display: 限制在 -100 ~ 100
  const display = Math.max(-100, Math.min(100, rawScore));
  return { rawScore, display, total };
}

/**
 * 显示颜色（根据分数）
 */
function scoreColor(s) {
  if (s >= 80) return '#2e7d32';   // 绿（高质量）
  if (s >= 40) return '#558b2f';   // 浅绿
  if (s >= 10) return '#f9a825';   // 黄（一般）
  if (s >= -20) return '#e65100';  // 橙（偏负）
  return '#c62828';                // 红（垃圾）
}

function getDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}
