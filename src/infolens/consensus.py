"""UGC 标记与社区共识模型 — 用户标记驱动的系统优化"""

from dataclasses import dataclass, field
from enum import Enum
from datetime import datetime
from typing import Optional


class UserTagType(str, Enum):
    """用户标记类型"""
    BIAS_FLAG = "bias_flag"            # 标记偏见
    MISLEADING = "misleading"          # 标记误导
    GOOD = "good"                      # 标记优质
    IMPORTANT = "important"            # 标记重要
    FACT_CHECK = "fact_check"          # 事实核查
    OUTDATED = "outdated"              # 标记过时
    DUPLICATE = "duplicate"            # 标记重复


@dataclass
class UserTag:
    """单条用户标记"""
    article_url: str
    user_id: str
    tag_type: UserTagType
    value: str = ""
    created_at: Optional[datetime] = None


@dataclass
class TagConsensus:
    """标记共识状态"""
    article_url: str
    tag_type: UserTagType
    agree_count: int = 0
    total_users: int = 0
    confidence: float = 0.0            # 0-1
    status: str = "pending"            # pending / active
    triggered_action: str = ""

    @property
    def agreed(self) -> bool:
        """是否达成共识（≥3人同意）"""
        return self.agree_count >= 3


@dataclass
class OptimizationStrategy:
    """基于共识的优化策略"""
    trigger: str = ""
    action: str = ""
    description: str = ""

    @staticmethod
    def all_strategies() -> list["OptimizationStrategy"]:
        return [
            OptimizationStrategy(
                trigger="bias_flag 共识达成（≥3人标记偏见）",
                action="降低该信源 independence 评分，后续文章自动标黄",
                description="多人认为某源有偏见 → 下调独立性评分"
            ),
            OptimizationStrategy(
                trigger="misleading 共识达成（≥3人标记误导）",
                action="标题加 ⚠️ 警告，降低该源 accuracy 评分",
                description="多人标记误导 → 降低可信度"
            ),
            OptimizationStrategy(
                trigger="fact_check 纠错达成共识",
                action="文章标记 disputed/debunked",
                description="社区纠错 → 降级验证状态"
            ),
            OptimizationStrategy(
                trigger="good 共识达成（≥3人标记优质）",
                action="提升该信源 accuracy/transparency 评分",
                description="多人认可 → 提升信源评分"
            ),
            OptimizationStrategy(
                trigger="important 大量标记（≥5人）",
                action="增加该主题采集频率和信源覆盖",
                description="集体关注 → 扩大采集"
            ),
            OptimizationStrategy(
                trigger="duplicate 共识达成（≥2人）",
                action="合并重复文章",
                description="多人标记重复 → 去重"
            ),
        ]
