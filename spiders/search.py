"""
InfoLens 搜索引擎爬虫
抓取百度/Bing/DDG搜索结果，提取标题、URL、排名、是否广告
"""

import scrapy
import re
from urllib.parse import quote


class SearchSpider(scrapy.Spider):
    name = "search"
    custom_settings = {
        "ROBOTSTXT_OBEY": False,
        "DOWNLOAD_DELAY": 1,
        "USER_AGENT": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "DEFAULT_REQUEST_HEADERS": {
            "Accept-Language": "zh-CN,zh;q=0.9",
        },
    }
    
    def start_requests(self):
        keyword = getattr(self, 'keyword', '')
        engine = getattr(self, 'engine', 'bing')
        
        if not keyword:
            self.logger.error("用法: scrapy crawl search -a keyword='宠孚生物官网' -a engine=bing")
            return
        
        engines = {
            "bing": f"https://www.bing.com/search?q={quote(keyword)}&count=10",
            "ddg": f"https://html.duckduckgo.com/html/?q={quote(keyword)}",
            "baidu": f"https://www.baidu.com/s?wd={quote(keyword)}&rn=10",
        }
        
        url = engines.get(engine)
        if not url:
            self.logger.error(f"未知引擎: {engine} (支持 bing/ddg/baidu)")
            return
        
        self.logger.info(f"🔍 搜索 [{engine}]: {keyword}")
        
        yield scrapy.Request(
            url=url,
            callback=self.parse,
            meta={"engine": engine, "keyword": keyword},
        )
    
    def parse(self, response):
        engine = response.meta["engine"]
        keyword = response.meta["keyword"]
        
        if engine == "ddg":
            yield from self.parse_ddg(response, keyword)
        elif engine == "bing":
            yield from self.parse_bing(response, keyword)
        elif engine == "baidu":
            yield from self.parse_baidu(response, keyword)
    
    def parse_ddg(self, response, keyword):
        """DuckDuckGo HTML"""
        results = response.css(".result")
        self.logger.info(f"DDG: 找到 {len(results)} 个结果")
        
        for i, result in enumerate(results, 1):
            title_el = result.css(".result__a")
            url_el = result.css(".result__url")
            
            if title_el:
                title = title_el.css("::text").get("").strip()
                url = url_el.css("::attr(href)").get("") or title_el.css("::attr(href)").get("")
                snippet = result.css(".result__snippet::text").get("").strip()
                
                if title and url:
                    yield {
                        "rank": i,
                        "title": title,
                        "url": url,
                        "source": "ddg",
                        "keyword": keyword,
                        "is_ad": False,
                        "snippet": snippet,
                    }
    
    def parse_bing(self, response, keyword):
        """Bing 搜索"""
        html = response.text
        blocks = re.findall(r'<li class="b_algo"[^>]*>(.*?)</li>', html, re.DOTALL)
        self.logger.info(f"Bing: 找到 {len(blocks)} 个 b_algo 块")
        
        rank = 0
        for block in blocks:
            # 标题在 <h2><a> 中
            h2_m = re.search(r'<h2[^>]*><a[^>]*>([^<]+)</a>', block)
            # 链接
            url_m = re.search(r'<a[^>]+href="(https?://[^"]+)"', block)
            
            if h2_m and url_m:
                title = h2_m.group(1).strip()
                url = url_m.group(1)
                
                # 过滤 bing/microsoft 自己的链接
                if 'bing.com' not in url.lower() and 'microsoft' not in url.lower():
                    rank += 1
                    is_ad = "广告" in block.lower() or "sponsored" in block.lower()
                    snippet_m = re.search(r'<p[^>]*>([^<]{10,200})</p>', block)
                    snippet = snippet_m.group(1).strip() if snippet_m else ""
                    
                    yield {
                        "rank": rank,
                        "title": title,
                        "url": url,
                        "source": "bing",
                        "keyword": keyword,
                        "is_ad": is_ad,
                        "snippet": snippet,
                    }
    
    def parse_baidu(self, response, keyword):
        """百度搜索"""
        html = response.text
        
        # 百度搜索结果在 data-tools 属性中
        tools = re.findall(r'data-tools=\'[^"]*title:"([^"]*)",url:"([^"]*)"', html)
        
        if not tools:
            # 备用：普通链接提取
            links = re.findall(r'<a[^>]+href="(https?://[^"]+)"[^>]*>([^<]{4,80})</a>', html)
            tools = [(t, u) for u, t in links if 'baidu.com' not in u and 'bdimg' not in u]
        
        self.logger.info(f"百度: 找到 {len(tools)} 个结果")
        
        for i, (title, url) in enumerate(tools[:15], 1):
            if title.strip() and url:
                yield {
                    "rank": i,
                    "title": title.strip(),
                    "url": url,
                    "source": "baidu",
                    "keyword": keyword,
                    "is_ad": False,
                    "snippet": "",
                }
