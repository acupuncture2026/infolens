"""InfoLens — 搜索结果标注层（极简版）

第一阶段：用户搜索 → 拿链接 → 标注 → 沉淀
"""

from dataclasses import dataclass, field
from enum import Enum
from datetime import datetime
from typing import Optional


class TagType(str, Enum):
    GOOD = "good"          # 值得看
    SPAM = "spam"          # 垃圾/广告/内容农场
    OFFICIAL = "official"  # 官网/权威
    OFFTOPIC = "offtopic"  # 偏题/标题党
    DEEP = "deep"          # 深度分析
    OUTDATED = "outdated"  # 过时


TAG_LABELS = {
    TagType.GOOD: "👍 值得看",
    TagType.SPAM: "👎 垃圾",
    TagType.OFFICIAL: "📋 官网",
    TagType.OFFTOPIC: "⚠️ 偏题",
    TagType.DEEP: "🔍 深度",
    TagType.OUTDATED: "📅 过时",
}


@dataclass
class SearchResult:
    """一条搜索结果"""
    keyword: str              # 搜索关键词
    url: str                  # 链接
    title: str = ""           # 标题
    domain: str = ""          # 域名（自动提取）
    tags: list = field(default_factory=list)  # 标注
    created_at: Optional[datetime] = None


@dataclass
class UserTag:
    """用户标注"""
    url: str
    tag_type: TagType
    user_id: str = "anon"
    created_at: Optional[datetime] = None


@dataclass
class DomainScore:
    """域名评分（由标注沉淀而来）"""
    domain: str
    good_count: int = 0
    spam_count: int = 0
    official_count: int = 0
    offtopic_count: int = 0

    @property
    def credibility(self) -> float:
        total = self.good_count + self.spam_count + self.official_count + self.offtopic_count
        if total == 0:
            return 0.5
        return (self.good_count + self.official_count) / total
