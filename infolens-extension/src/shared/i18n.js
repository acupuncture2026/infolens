/**
 * InfoLens — 多语言
 */
const LANG = (() => {
  const code = (navigator.language || 'en').slice(0, 2);
  return ['zh','en','ja','ko','fr','de','es','pt','ru','ar'].includes(code) ? code : 'en';
})();

const TAGS = [
  { key:'good',     emoji:'👍', zh:'值得看',  en:'Good',     ja:'良質',    ko:'양호',     fr:'Bon',        de:'Gut',       es:'Bueno',    pt:'Bom',       ru:'Хорошо',     ar:'جيد' },
  { key:'official', emoji:'📋', zh:'官网',    en:'Official', ja:'公式',     ko:'공식',     fr:'Officiel',   de:'Offiziell', es:'Oficial',  pt:'Oficial',   ru:'Офиц.',      ar:'رسمي' },
  { key:'offtopic', emoji:'⚠️', zh:'偏题',   en:'Off-topic',ja:'関連なし', ko:'관련없음', fr:'Hors-sujet', de:'Irrelevant',es:'Fuera',   pt:'Fora tema', ru:'Не в тему', ar:'خارج الموضوع' },
  { key:'spam',     emoji:'👎', zh:'垃圾',    en:'Spam',     ja:'スパム',   ko:'스팸',     fr:'Indésirable',de:'Spam',      es:'Spam',     pt:'Spam',      ru:'Спам',       ar:'مزعج' },
  { key:'deep',     emoji:'🔍', zh:'深度',    en:'In-depth', ja:'詳細',     ko:'심층',     fr:'Approfondi', de:'Tief',      es:'Profund.', pt:'Aprofund.', ru:'Подробно',   ar:'متعمق' },
  { key:'outdated', emoji:'📅', zh:'过时',    en:'Outdated', ja:'古い',     ko:'오래됨',   fr:'Obsolète',   de:'Veraltet',  es:'Obsoleto', pt:'Desatual.', ru:'Устарело',  ar:'قديم' },
];

function t(tag) { return tag[LANG] || tag.en; }
function tKey(key) { const found = TAGS.find(x => x.key === key); return found ? t(found) : key; }
