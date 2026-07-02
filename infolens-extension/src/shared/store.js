/**
 * InfoLens — 数据存储（URL 级别，支持 10 万+ 条目）
 * 评分算法：加权投票 + 置信度衰减
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
  // 修复 1.1: 发送前剥离查询参数和锚点
  const cleanUrl = url.split('?')[0].split('#')[0];
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
    chrome.runtime.sendMessage({ type: 'VOTE', data: { url: cleanUrl, domain, tagType } }).catch(() => {});
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
      // 修复 3.2: 支持全量广播和单条 URL 增量更新
      if (msg.type === 'DATA_CHANGED' && msg.data) {
        if (msg.url) {
          // 单条 URL 更新
          localCache[msg.url] = msg.data;
          normIndex[normalizeUrl(msg.url)] = msg.url;
        } else {
          // 全量 store 广播（pullCloudData 结果）
          localCache = msg.data;
          buildNormIndex();
        }
        if (callback) callback();
      }
    });
  }
}

/**
 * 加权评分
 * 评分范围: -50000 ~ +50000，10 级色阶（深红 → 深绿）
 * 返回: { rawScore, adjusted, display, total, confidence }
 *   rawScore   — 原始加权和
 *   adjusted   — 置信度衰减后的分数
 *   confidence — 置信度因子 0~1
 *   total      — 总投票数
 */
const WEIGHTS = {
  good: 10000, official: 10000, deep: 5000,
  offtopic: -5000, outdated: -2500, spam: -10000
};

function score(entry) {
  if (!entry) return { rawScore: 0, adjusted: 0, display: 0, total: 0, confidence: 0 };
  let rawScore = 0;
  let total = 0;
  for (const [tag, weight] of Object.entries(WEIGHTS)) {
    const count = entry[tag] || 0;
    rawScore += count * weight;
    total += count;
  }
  const confidence = total / (total + 5);
  const adjusted = rawScore * confidence;
  return { rawScore, adjusted, display: rawScore, total, confidence };
}

function scoreColor(s) {
  // 10 级色阶: -50000 ~ +50000
  if (s >= 40000) return '#1b5e20';  // 深绿
  if (s >= 30000) return '#2e7d32';
  if (s >= 20000) return '#43a047';
  if (s >= 10000) return '#7cb342';  // 绿
  if (s >= 1)     return '#9acd32';  // 浅绿（微正）
  if (s >= -1)    return '#fdd835';  // 黄色（中性）
  if (s >= -2500) return '#e65100';  // 橙
  if (s >= -5000) return '#d84315';
  if (s >= -10000) return '#c62828'; // 红
  return '#b71c1c';                  // 深红
}

function getDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}
