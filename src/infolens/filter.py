"""过滤层 — 交叉验证、偏见分析、规则引擎、对比视图"""

import re
from collections import defaultdict
from .models import Article, VerificationLevel, BiasDirection, Source


def group_by_topic(articles: list[Article], top_k: int = 5) -> list[dict]:
    """
    将文章按主题分组，返回对比视图数据。
    同一事件的不同信源报道 = 一组对比。
    改进：用短关键词（品牌名/实体名）做分组键，提高跨语言匹配率。
    """
    topic_groups: dict[str, list[Article]] = defaultdict(list)

    for article in articles:
        keywords = extract_keywords(article.title + " " + article.summary, top_n=5)
        # 只取第一个短关键词（品牌名/实体名），提高跨语言匹配率
        topic_key = keywords[0] if keywords else ""
        if len(topic_key) < 2:
            continue
        topic_groups[topic_key].append(article)

    # 过滤：至少 2 个不同信源才构成对比
    comparisons = []
    for topic_key, group in topic_groups.items():
        unique_sources = set(a.source_id for a in group)
        if len(unique_sources) < 2:
            continue
        
        # 按信源偏见方向排序，方便对比
        bias_order = {
            BiasDirection.LEFT: 1,
            BiasDirection.CENTER: 2,
            BiasDirection.RIGHT: 3,
            BiasDirection.STATE_ALIGNED: 0,
            BiasDirection.COMMERCIAL: 4,
            BiasDirection.UNKNOWN: 5,
        }
        group.sort(key=lambda a: bias_order.get(a.bias_direction, 5))
        
        comparisons.append({
            "topic": topic_key,
            "article_count": len(group),
            "source_count": len(unique_sources),
            "articles": [
                {
                    "title": a.title,
                    "url": a.url,
                    "source_name": a.source_name,
                    "bias_direction": a.bias_direction.value,
                    "verification_level": a.verification_level.value,
                    "emotionality": analyze_emotionality(a.summary + a.content[:200]),
                    "summary": a.summary[:300],
                }
                for a in group
            ]
        })

    # 按信源数量降序（对比价值最高排前面）
    comparisons.sort(key=lambda c: (-c["source_count"], -c["article_count"]))
    return comparisons[:top_k]


def cross_validate(articles: list[Article], similarity_threshold: float = 0.3) -> list[Article]:
    """
    基于标题关键词相似度进行交叉验证。
    如果多个独立信源报道了相似主题，提升验证等级。
    """
    # 按主题关键词分组（简单 TF 实现）
    topic_groups: dict[str, list[Article]] = defaultdict(list)

    for article in articles:
        keywords = extract_keywords(article.title + " " + article.summary, top_n=5)
        topic_key = " ".join(sorted(keywords)[:2])  # 用前2个关键词做粗分组
        topic_groups[topic_key].append(article)

    # 根据同组独立信源数设置验证等级
    for key, group in topic_groups.items():
        unique_sources = set(a.source_id for a in group)

        for article in group:
            if len(unique_sources) >= 3:
                article.verification_level = VerificationLevel.VERIFIED
                article.matched_cross = [a.url for a in group if a.url != article.url]
            elif len(unique_sources) >= 2:
                article.verification_level = VerificationLevel.PARTIAL
                article.matched_cross = [a.url for a in group if a.url != article.url]
            else:
                article.verification_level = VerificationLevel.UNVERIFIED

    return articles


def extract_keywords(text: str, top_n: int = 5) -> list[str]:
    """简单关键词提取（去停用词 + 词频）"""
    stop_words = {
        "的", "了", "在", "是", "我", "有", "和", "就", "不", "人", "都", "一",
        "一个", "上", "也", "很", "到", "说", "要", "去", "你", "会", "着",
        "没有", "看", "好", "自己", "这",
        "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
        "in", "on", "at", "to", "for", "of", "with", "by", "from",
        "and", "or", "but", "not", "no", "it", "its", "this", "that",
        "i", "you", "he", "she", "we", "they", "me", "him", "her", "us", "them",
    }

    # 中文按字符 n-gram，英文按单词
    tokens = []
    # 英文分词
    en_words = re.findall(r'[a-zA-Z]{3,}', text.lower())
    tokens.extend([w for w in en_words if w not in stop_words])

    # 中文：简单提取长度>=2的连续中文字符
    cn_tokens = re.findall(r'[\u4e00-\u9fff]{2,}', text)
    tokens.extend([t for t in cn_tokens if t not in stop_words])

    # 词频排序
    freq = defaultdict(int)
    for t in tokens:
        freq[t] += 1

    return [w for w, _ in sorted(freq.items(), key=lambda x: -x[1])[:top_n]]


def analyze_emotionality(text: str) -> float:
    """
    情绪化程度分析（0-1，越高越情绪化）。
    简单规则：感叹号比例、大写比例、情绪词密度。
    """
    if not text or len(text) < 10:
        return 0.5

    score = 0.0

    # 感叹号密度
    exclamation_ratio = text.count('!') + text.count('！')
    score += min(exclamation_ratio / max(len(text) / 100, 1), 1.0) * 0.3

    # 问号密度（ rhetorica l questions ）
    question_ratio = text.count('?') + text.count('？')
    score += min(question_ratio / max(len(text) / 100, 1), 1.0) * 0.2

    # 情绪词检测（中文+英文简单列表）
    emotional_words = [
        "震惊", "惊呆", "万万没想到", "太可怕了", "令人发指",
        "重磅", "爆了", "炸锅", "刷屏", "疯狂",
        "shocking", "unbelievable", "outrageous", "insane",
        "breaking", "bombshell", "explosive",
    ]
    text_lower = text.lower()
    emotion_count = sum(1 for w in emotional_words if w in text_lower)
    score += min(emotion_count / 3, 1.0) * 0.5

    return round(min(score, 1.0), 2)


def filter_by_rules(articles: list[Article], rules: dict) -> list[Article]:
    """
    根据规则过滤文章。
    支持的规则：
      - min_verification_level: 最低验证等级
      - max_emotionality: 最大情绪化程度
      - min_length: 最短摘要长度
      - source_ids: 只看特定源
    """
    level_order = {
        VerificationLevel.UNVERIFIED: 0,
        VerificationLevel.PARTIAL: 1,
        VerificationLevel.VERIFIED: 2,
        VerificationLevel.DISPUTED: 1,
        VerificationLevel.DEBUNKED: 0,
    }

    filtered = []
    for a in articles:
        # 验证等级过滤
        min_level = rules.get("min_verification_level")
        if min_level and level_order.get(a.verification_level, 0) < level_order.get(min_level, 0):
            continue

        # 情绪化过滤
        max_emotionality = rules.get("max_emotionality")
        if max_emotionality is not None:
            emo = analyze_emotionality(a.summary + a.content[:200])
            if emo > max_emotionality:
                continue

        # 长度过滤
        min_length = rules.get("min_length")
        if min_length and len(a.summary) < min_length:
            continue

        # 源过滤
        source_ids = rules.get("source_ids")
        if source_ids and a.source_id not in source_ids:
            continue

        filtered.append(a)

    return filtered
