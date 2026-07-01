"""预设信源 — 中英文 RSS 种子列表"""

from .models import Source, BiasDirection


def default_sources() -> list[Source]:
    """
    预设信源列表。
    评分是初始值，用户可自行审计修改。
    """
    return [
        # ── 中文 ──
        Source(
            id="xinhua", name="新华网",
            feed_url="http://www.news.cn/rss/xwzx.xml",
            country="CN", bias_direction=BiasDirection.STATE_ALIGNED,
            accuracy=0.7, transparency=0.5, independence=0.2, emotionality=0.3,
        ),
        Source(
            id="caixin", name="财新网",
            feed_url="https://www.caixin.com/rss/feed.xml",
            country="CN", bias_direction=BiasDirection.CENTER,
            accuracy=0.8, transparency=0.7, independence=0.6, emotionality=0.2,
        ),
        Source(
            id="ftchinese", name="FT中文网",
            feed_url="https://www.ftchinese.com/rss/news",
            country="CN", bias_direction=BiasDirection.CENTER,
            accuracy=0.75, transparency=0.7, independence=0.6, emotionality=0.2,
        ),

        # ── English ──
        Source(
            id="reuters", name="Reuters",
            feed_url="https://feeds.reuters.com/reuters/topNews",
            country="US", bias_direction=BiasDirection.CENTER,
            accuracy=0.85, transparency=0.8, independence=0.7, emotionality=0.15,
        ),
        Source(
            id="bbc", name="BBC News",
            feed_url="https://feeds.bbci.co.uk/news/world/rss.xml",
            country="UK", bias_direction=BiasDirection.CENTER,
            accuracy=0.8, transparency=0.8, independence=0.6, emotionality=0.2,
        ),
        Source(
            id="ap", name="Associated Press",
            feed_url="https://rsshub.app/apnews/topics/top-news",
            country="US", bias_direction=BiasDirection.CENTER,
            accuracy=0.85, transparency=0.8, independence=0.75, emotionality=0.15,
        ),
        Source(
            id="guardian", name="The Guardian",
            feed_url="https://www.theguardian.com/world/rss",
            country="UK", bias_direction=BiasDirection.LEFT,
            accuracy=0.75, transparency=0.75, independence=0.55, emotionality=0.3,
        ),
        Source(
            id="economist", name="The Economist",
            feed_url="https://www.economist.com/the-world-this-week/rss.xml",
            country="UK", bias_direction=BiasDirection.CENTER,
            accuracy=0.85, transparency=0.7, independence=0.6, emotionality=0.15,
        ),

        # ── 科技 ──
        Source(
            id="36kr", name="36氪",
            feed_url="https://36kr.com/feed",
            country="CN", bias_direction=BiasDirection.COMMERCIAL,
            accuracy=0.7, transparency=0.6, independence=0.4, emotionality=0.3,
        ),
        Source(
            id="hackernews", name="Hacker News (best)",
            feed_url="https://hnrss.org/best",
            country="US", bias_direction=BiasDirection.CENTER,
            accuracy=0.75, transparency=0.8, independence=0.7, emotionality=0.2,
        ),
    ]
