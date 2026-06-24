# xiaohongshu-dailytop

## 用途

获取小红书（Xiaohongshu）每日热门榜单/趋势数据，支持多数据源自动回退，无需强制依赖 RedFox 平台。

## 触发条件

当用户请求包含以下关键词时触发：
- 小红书热门、小红书每日热门、小红书 trending、小红书热搜
- 小红书今日热点、小红书榜单、小红书灵感
- xiaohongshu daily top、xiaohongshu trending、小红书爆文

## 数据源配置

系统按以下**优先级**自动选择数据源：

| 优先级 | 环境变量 | 数据源 | 说明 |
|--------|----------|--------|------|
| 1 | `REDFOX_API_KEY` | RedFox API | 稳定、付费，返回结构化 JSON |
| 2 | `CUSTOM_API_URL` | 自定义第三方接口 | 用户自建的代理或替代 API |
| 3 | 无（默认） | Playwright 本地抓取 | 免费，需安装浏览器环境 |

### 环境变量设置示例

```bash
# 方案一：RedFox（稳定优先）
export REDFOX_API_KEY="sk_xxxx"

# 方案二：自定义 API
export CUSTOM_API_URL="https://your-api.com/xiaohongshu/hot"

# 方案三：本地抓取（默认）
# 无需配置变量，但需确保 Python 环境已安装依赖：
# pip install playwright requests
# playwright install chromium
```

## 执行流程

### 步骤 0：环境自检与自动安装

在获取数据前，Agent 先检查运行环境，**自动修复缺失的依赖**：

```python
import subprocess, sys, importlib

def ensure_dependency(pkg: str):
    try:
        importlib.import_module(pkg)
    except ImportError:
        print(f"[{pkg}] 未安装，正在自动安装...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", pkg])

def ensure_playwright_browsers():
    from playwright.sync_api import sync_playwright
    try:
        with sync_playwright() as p:
            p.chromium.launch()
    except Exception:
        print("[Playwright] 浏览器未下载，正在自动安装 Chromium...")
        subprocess.check_call([sys.executable, "-m", "playwright", "install", "chromium"])
```

**AI 执行逻辑：**
1. 尝试 `import requests` 和 `import playwright`，失败则自动 `pip install`
2. 尝试启动 Chromium，失败则自动 `playwright install chromium`
3. 若 Python 本身不存在，提示用户安装 Python 3.10+，或引导使用 RedFox API（无需 Python）

> **原则：用户零配置**。除首次安装 Python 外，其余依赖全部由 Agent 自动处理。

### 步骤 1：检测数据源

读取环境变量，按优先级确定使用的 Provider：

```python
import os

def get_data_provider():
    if os.environ.get("REDFOX_API_KEY"):
        return "redfox"
    if os.environ.get("CUSTOM_API_URL"):
        return "custom"
    return "playwright"  # 默认 fallback
```

### 步骤 2：获取数据

#### Provider A: RedFox API

```python
import os, requests

def fetch_redfox():
    api_key = os.environ["REDFOX_API_KEY"]
    headers = {"Authorization": f"Bearer {api_key}"}
    resp = requests.get(
        "https://api.redfox.hk/v1/xiaohongshu/daily-hot",
        headers=headers,
        timeout=30
    )
    resp.raise_for_status()
    return resp.json()["data"]
```

#### Provider B: 自定义 API

```python
import os, requests

def fetch_custom():
    url = os.environ["CUSTOM_API_URL"]
    resp = requests.get(url, timeout=30)
    resp.raise_for_status()
    data = resp.json()
    # 支持用户自定义响应格式，但建议统一字段名
    return data.get("data", data)
```

#### Provider C: Playwright 本地抓取（默认 Fallback）

```python
from playwright.sync_api import sync_playwright
import json

def fetch_playwright():
    """
    访问小红书首页/发现页，拦截内部 API 获取热搜数据。
    如果热门笔记数据不可得，至少返回热搜词列表。
    """
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
            viewport={"width": 1920, "height": 1080},
        )
        page = context.new_page()

        results = {"hot_queries": [], "hot_notes": []}

        def handle_response(response):
            url = response.url
            try:
                if "/api/sns/web/v1/search/trending" in url:
                    payload = response.json()
                    queries = payload.get("data", {}).get("queries", [])
                    results["hot_queries"] = queries

                if "/api/sns/web/v1/feed/trending" in url or "/api/sns/web/v1/homefeed" in url:
                    payload = response.json()
                    notes = payload.get("data", {}).get("notes", [])
                    results["hot_notes"].extend(notes)
            except Exception:
                pass

        page.on("response", handle_response)
        page.goto("https://www.xiaohongshu.com/explore", wait_until="networkidle")
        page.wait_for_timeout(3000)
        browser.close()
        return results
```

### 步骤 3：字段归一化

无论哪个 Provider，最终输出统一字段结构，方便下游处理：

```python
def normalize_item(raw_item, source):
    """
    将不同来源的数据统一为标准格式。
    """
    if source == "redfox":
        return {
            "rank": raw_item.get("rank"),
            "title": raw_item.get("title"),
            "hot_score": raw_item.get("hot_score"),
            "like_count": raw_item.get("like_count", 0),
            "author_name": raw_item.get("author_name"),
            "url": raw_item.get("url"),
            "tags": raw_item.get("tags", []),
        }
    elif source == "playwright":
        # 小红书内部 API 字段映射
        note_card = raw_item.get("note_card", raw_item)
        return {
            "rank": None,
            "title": note_card.get("title", ""),
            "hot_score": note_card.get("interact_info", {}).get("liked_count", 0),
            "like_count": note_card.get("interact_info", {}).get("liked_count", 0),
            "author_name": note_card.get("user", {}).get("nickname", ""),
            "url": f"https://www.xiaohongshu.com/explore/{note_card.get('note_id', '')}",
            "tags": [t.get("name", "") for t in note_card.get("tag_list", [])],
        }
    else:
        # 自定义 API：假设用户已按标准格式返回
        return raw_item
```

### 步骤 4：输出结果

1. 说明当前使用的数据源 Provider
2. 展示前 10~20 条热门内容（表格或列表）
3. 若数据包含热搜词，单独列出热搜词云/榜单

## 输出格式

```
📊 小红书每日热门（数据来源：Playwright 本地抓取）

--- 热搜词 TOP 10 ---
1. [query] 🔥 hot_score
2. ...

--- 热门笔记 TOP 10 ---
1. 《标题》 by @作者 | 👍 1.2w
   🔗 https://www.xiaohongshu.com/explore/xxxxx
2. ...
```

## 错误处理

| 场景 | 处理方式 |
|------|----------|
| REDFOX_API_KEY 无效 | 提示用户检查 Key，并自动降级到 Playwright |
| Playwright 未安装 | 输出安装命令：`pip install playwright && playwright install chromium` |
| 自定义 API 超时 | 提示检查 `CUSTOM_API_URL` 可达性，询问是否切换 |
| 小红书反爬阻断 | 提示更换 IP 或使用代理，建议用户考虑 RedFox API |

## 依赖

- **RedFox**: 仅需 `requests`
- **Custom API**: 仅需 `requests`
- **Playwright**: `playwright` + Chromium 浏览器

## 参考

更多使用范例见 `.lingma/skills/xiaohongshu-dailytop/examples.md`。
