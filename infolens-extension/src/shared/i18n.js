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

/** 独立翻译键（非标签） */
const I18N = {
  PRIVACY_NOTE: { zh:'匿名使用，不收集个人信息', en:'Anonymous, no personal data collected', ja:'匿名利用、個人情報は収集しません', ko:'익명 사용, 개인정보 수집 없음', fr:'Anonyme, aucune donnée personnelle collectée', de:'Anonym, keine personenbezogenen Daten gesammelt', es:'Anónimo, no se recopilan datos personales', pt:'Anônimo, nenhum dado pessoal coletado', ru:'Анонимно, личные данные не собираются', ar:'مجهول، لا يتم جمع بيانات شخصية' },
  SYNC_PENDING: { zh:'同步中...', en:'Syncing...', ja:'同期中...', ko:'동기 중...', fr:'Synchronisation...', de:'Synchronisierung...', es:'Sincronizando...', pt:'Sincronizando...', ru:'Синхронизация...', ar:'جارٍ المزامنة...' },
  LOADING: { zh:'加载中...', en:'Loading...', ja:'読み込み中...', ko:'로딩 중...', fr:'Chargement...', de:'Laden...', es:'Cargando...', pt:'Carregando...', ru:'Загрузка...', ar:'جارٍ التحميل...' },
  COLLAPSE: { zh:'收起', en:'Collapse', ja:'折りたたむ', ko:'접기', fr:'Réduire', de:'Einklappen', es:'Colapsar', pt:'Recolher', ru:'Свернуть', ar:'طي' },
  EXPAND: { zh:'展开', en:'Expand', ja:'展開する', ko:'펼치기', fr:'Développer', de:'Erweitern', es:'Expandir', pt:'Expandir', ru:'Развернуть', ar:'توسيع' },
};

function t(tag) { return tag[LANG] || tag.en; }
function tKey(key) { const found = TAGS.find(x => x.key === key); return found ? t(found) : key; }
function tI18n(key) { const entry = I18N[key]; return entry ? (entry[LANG] || entry.en) : key; }
