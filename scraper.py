#!/usr/bin/env python3
"""
小红书每日热门数据抓取器
支持多数据源：RedFox API / 自定义 API / Playwright 本地抓取
依赖自修复：运行时会自动安装缺失的 Python 包和浏览器
"""

import os
import sys
import subprocess
import importlib
import json
import argparse
from typing import List, Dict, Any, Optional


# ═══════════════════════════════════════════════════════════════
# 步骤 0：依赖自修复（零配置启动）
# ═══════════════════════════════════════════════════════════════

def _ensure_package(pkg: str) -> None:
    """自动安装缺失的 Python 包。"""
    try:
        importlib.import_module(pkg)
    except ImportError:
        print(f"[{pkg}] 未安装，正在自动安装...")
        subprocess.check_call(
            [sys.executable, "-m", "pip", "install", "--quiet", pkg],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        importlib.import_module(pkg)
        print(f"[{pkg}] 安装完成。")


def _ensure_browser() -> None:
    """自动下载 Playwright Chromium 浏览器。"""
    try:
        import playwright.sync_api
        with playwright.sync_api.sync_playwright() as p:
            p.chromium.launch()
    except Exception:
        print("[Playwright] Chromium 未下载，正在自动安装...")
        subprocess.check_call(
            [sys.executable, "-m", "playwright", "install", "chromium"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        print("[Playwright] Chromium 安装完成。")


# 按需自动修复依赖
_ensure_package("requests")
try:
    _ensure_package("playwright")
    _ensure_browser()
except Exception as e:
    print(f"[警告] 自动安装依赖失败: {e}")
    print("请手动运行: pip install playwright requests && playwright install chromium")


# ═══════════════════════════════════════════════════════════════
# 业务逻辑
# ═══════════════════════════════════════════════════════════════


def get_data_provider() -> str:
    """按优先级选择数据源。"""
    if os.environ.get("REDFOX_API_KEY"):
        return "redfox"
    if os.environ.get("CUSTOM_API_URL"):
        return "custom"
    return "playwright"


def fetch_redfox(limit: int = 20) -> List[Dict[str, Any]]:
    """通过 RedFox API 获取数据。"""
    import requests

    api_key = os.environ["REDFOX_API_KEY"]
    headers = {"Authorization": f"Bearer {api_key}"}
    params = {"limit": limit}

    resp = requests.get(
        "https://api.redfox.hk/v1/xiaohongshu/daily-hot",
        headers=headers,
        params=params,
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json().get("data", [])


def fetch_custom(limit: int = 20) -> List[Dict[str, Any]]:
    """通过自定义 API 获取数据。"""
    import requests

    url = os.environ["CUSTOM_API_URL"]
    params = {"limit": limit}

    resp = requests.get(url, params=params, timeout=30)
    resp.raise_for_status()
    data = resp.json()
    return data.get("data", data)


def fetch_playwright(limit: int = 20) -> Dict[str, Any]:
    """通过 Playwright 本地抓取数据。"""
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("错误：未安装 Playwright。请运行：")
        print("  pip install playwright requests")
        print("  playwright install chromium")
        sys.exit(1)

    results: Dict[str, Any] = {"hot_queries": [], "hot_notes": []}

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
            viewport={"width": 1920, "height": 1080},
            locale="zh-CN",
        )
        page = context.new_page()

        def handle_response(response) -> None:
            url = response.url
            try:
                if "/api/sns/web/v1/search/trending" in url:
                    payload = response.json()
                    queries = payload.get("data", {}).get("queries", [])
                    results["hot_queries"] = queries

                if "/api/sns/web/v1/feed/trending" in url:
                    payload = response.json()
                    items = payload.get("data", {}).get("items", [])
                    results["hot_notes"].extend(items)
            except Exception:
                pass

        page.on("response", handle_response)
        page.goto("https://www.xiaohongshu.com/explore", wait_until="networkidle")
        page.wait_for_timeout(3000)
        browser.close()

    return results


def normalize_redfox_item(raw: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "rank": raw.get("rank"),
        "title": raw.get("title"),
        "hot_score": raw.get("hot_score"),
        "like_count": raw.get("like_count", 0),
        "author_name": raw.get("author_name"),
        "url": raw.get("url"),
        "tags": raw.get("tags", []),
        "source": "redfox",
    }


def normalize_playwright_note(raw: Dict[str, Any]) -> Dict[str, Any]:
    note_card = raw.get("note_card", raw)
    interact = note_card.get("interact_info", {})
    user_info = note_card.get("user", {})
    # 笔记 ID 可能在多个位置
    note_id = (
        raw.get("id")
        or raw.get("note_id")
        or note_card.get("note_id")
        or note_card.get("id")
        or ""
    )

    return {
        "rank": None,
        "title": note_card.get("display_title", note_card.get("title", "")),
        "hot_score": int(interact.get("liked_count", 0) or 0),
        "like_count": int(interact.get("liked_count", 0) or 0),
        "author_name": user_info.get("nickname", ""),
        "url": f"https://www.xiaohongshu.com/explore/{note_id}" if note_id else "",
        "tags": [t.get("name", "") for t in note_card.get("tag_list", [])],
        "source": "playwright",
    }


def normalize_playwright_query(raw: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "rank": raw.get("rank"),
        "title": raw.get("query", ""),
        "hot_score": raw.get("hot_score", 0),
        "like_count": 0,
        "author_name": "",
        "url": "",
        "tags": [],
        "source": "playwright",
    }


def fetch_all(provider: Optional[str] = None, limit: int = 20) -> Dict[str, Any]:
    """
    统一入口：获取小红书每日热门数据。
    返回 {"provider": str, "hot_queries": [...], "hot_notes": [...]}
    """
    prov = provider or get_data_provider()
    output: Dict[str, Any] = {"provider": prov, "hot_queries": [], "hot_notes": []}

    if prov == "redfox":
        items = fetch_redfox(limit=limit)
        output["hot_notes"] = [normalize_redfox_item(i) for i in items]

    elif prov == "custom":
        items = fetch_custom(limit=limit)
        # 自定义 API 假设已返回标准格式
        if items and isinstance(items[0], dict):
            if "title" in items[0] and "query" not in items[0]:
                output["hot_notes"] = items
            else:
                output["hot_queries"] = items

    elif prov == "playwright":
        raw = fetch_playwright(limit=limit)
        output["hot_queries"] = [
            normalize_playwright_query(q) for q in raw.get("hot_queries", [])
        ]
        output["hot_notes"] = [
            normalize_playwright_note(n) for n in raw.get("hot_notes", [])
        ]

    return output


def print_results(data: Dict[str, Any]) -> None:
    """命令行友好输出。"""
    provider = data["provider"]
    print(f"📊 小红书每日热门（数据来源：{provider}）\n")

    queries = data.get("hot_queries", [])
    if queries:
        print("--- 热搜词 TOP 10 ---")
        for idx, q in enumerate(queries[:10], 1):
            title = q.get("title", "")
            score = q.get("hot_score", 0)
            print(f"{idx}. {title} 🔥 {score}")
        print()

    notes = data.get("hot_notes", [])
    if notes:
        print("--- 热门笔记 TOP 10 ---")
        for idx, note in enumerate(notes[:10], 1):
            title = (note.get("title", ""))[:28]
            author = note.get("author_name", "")
            likes = note.get("like_count", 0)
            url = note.get("url", "")
            print(f"{idx}. 《{title}》 by @{author} | 👍 {likes}")
            if url:
                print(f"   🔗 {url}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="小红书每日热门数据抓取")
    parser.add_argument("--provider", choices=["redfox", "custom", "playwright"], help="强制指定数据源")
    parser.add_argument("--limit", type=int, default=20, help="返回条数")
    parser.add_argument("--json", action="store_true", help="以 JSON 格式输出")
    args = parser.parse_args()

    result = fetch_all(provider=args.provider, limit=args.limit)

    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print_results(result)
