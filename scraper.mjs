#!/usr/bin/env node
/**
 * 小红书每日热门数据抓取器 (Node.js 版)
 * 支持多数据源：RedFox API / 自定义 API / Playwright 本地抓取
 * 依赖自修复：运行时会自动安装缺失的 npm 包和浏览器
 */

import { execSync, spawn } from 'child_process';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ═══════════════════════════════════════════════════════════════
// 步骤 0：依赖自修复（零配置启动）
// ═══════════════════════════════════════════════════════════════

function ensurePackage(pkgName) {
  try {
    createRequire(import.meta.url)(pkgName);
    return true;
  } catch {
    console.log(`[${pkgName}] 未安装，正在自动安装...`);
    try {
      // 优先使用 package.json 安装（确保版本一致）
      const hasPackageJson = fs.existsSync(path.join(__dirname, 'package.json'));
      if (hasPackageJson) {
        execSync('npm install', {
          cwd: __dirname,
          stdio: 'inherit',
          timeout: 120000,
        });
      } else {
        execSync(`npm install ${pkgName}`, {
          cwd: __dirname,
          stdio: 'inherit',
          timeout: 120000,
        });
      }
      console.log(`[${pkgName}] 安装完成。`);
      return true;
    } catch (e) {
      console.error(`[${pkgName}] 安装失败: ${e.message}`);
      return false;
    }
  }
}

async function ensureBrowser() {
  let pw;
  try {
    pw = await import('playwright');
  } catch {
    console.log('[Playwright] 模块加载失败，浏览器状态未知，尝试安装...');
    try {
      execSync('npx playwright install chromium', {
        cwd: __dirname,
        stdio: 'inherit',
        timeout: 300000,
      });
      console.log('[Playwright] Chromium 安装完成。');
      return true;
    } catch (e) {
      console.error(`[Playwright] 浏览器安装失败: ${e.message}`);
      return false;
    }
  }

  try {
    const browser = await pw.chromium.launch();
    await browser.close();
    return true;
  } catch {
    console.log('[Playwright] Chromium 未下载，正在自动安装...');
    try {
      execSync('npx playwright install chromium', {
        cwd: __dirname,
        stdio: 'inherit',
        timeout: 300000,
      });
      console.log('[Playwright] Chromium 安装完成。');
      return true;
    } catch (e) {
      console.error(`[Playwright] 浏览器安装失败: ${e.message}`);
      return false;
    }
  }
}

// 按需自动修复依赖
const hasPlaywright = ensurePackage('playwright');
if (!hasPlaywright) {
  console.error('错误：无法安装 Playwright，请检查网络或 npm 配置。');
  process.exit(1);
}
const browserOk = await ensureBrowser();
if (!browserOk) {
  console.error('错误：无法安装 Chromium 浏览器。');
  process.exit(1);
}

// ═══════════════════════════════════════════════════════════════
// 业务逻辑
// ═══════════════════════════════════════════════════════════════

let chromium = null;

function getDataProvider() {
  if (process.env.REDFOX_API_KEY) return 'redfox';
  if (process.env.CUSTOM_API_URL) return 'custom';
  return 'playwright';
}

async function fetchRedfox(limit = 20) {
  const apiKey = process.env.REDFOX_API_KEY;
  const url = new URL('https://api.redfox.hk/v1/xiaohongshu/daily-hot');
  url.searchParams.set('limit', String(limit));
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!resp.ok) throw new Error(`RedFox API ${resp.status}`);
  const data = await resp.json();
  return data.data || [];
}

async function fetchCustom(limit = 20) {
  const url = new URL(process.env.CUSTOM_API_URL);
  url.searchParams.set('limit', String(limit));
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Custom API ${resp.status}`);
  const data = await resp.json();
  return data.data || data;
}

async function fetchPlaywright(limit = 20) {
  if (!chromium) {
    const pw = await import('playwright');
    chromium = pw.chromium;
  }
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    locale: 'zh-CN',
  });
  const page = await context.newPage();

  const results = { hot_queries: [], hot_notes: [] };

  page.on('response', async (response) => {
    const url = response.url();
    try {
      if (url.includes('/api/sns/web/v1/search/trending')) {
        const payload = await response.json();
        const queries = payload.data?.queries || payload.data?.data || [];
        results.hot_queries.push(...queries);
      }
      if (
        url.includes('/api/sns/web/v1/feed/trending') ||
        url.includes('/api/sns/web/v1/homefeed') ||
        url.includes('/api/sns/web/v1/search/notes')
      ) {
        const payload = await response.json();
        const items =
          payload.data?.items || payload.data?.notes || payload.data?.data || [];
        results.hot_notes.push(...items);
      }
    } catch {
      // ignore non-JSON responses
    }
  });

  try {
    await page.goto('https://www.xiaohongshu.com/explore', {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });
  } catch {
    // 即使超时也继续尝试
  }

  await page.waitForTimeout(5000);

  // 尝试滚动触发更多接口（页面可能跳转，需容错）
  try {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(3000);
  } catch {
    // 滚动失败不影响已有数据
  }

  await browser.close();
  return results;
}

function normalizeRedfoxItem(raw) {
  return {
    rank: raw.rank,
    title: raw.title,
    hot_score: raw.hot_score,
    like_count: raw.like_count || 0,
    author_name: raw.author_name,
    url: raw.url,
    tags: raw.tags || [],
    source: 'redfox',
  };
}

function normalizePlaywrightNote(raw) {
  const noteCard = raw.note_card || raw;
  const interact = noteCard.interact_info || {};
  const userInfo = noteCard.user || {};
  // 笔记 ID 可能在多个位置
  const noteId = raw.id || raw.note_id || noteCard.note_id || noteCard.id || '';
  return {
    rank: null,
    title: noteCard.display_title || noteCard.title || '',
    hot_score: parseInt(interact.liked_count || 0, 10),
    like_count: parseInt(interact.liked_count || 0, 10),
    author_name: userInfo.nickname || '',
    url: noteId ? `https://www.xiaohongshu.com/explore/${noteId}` : '',
    tags: (noteCard.tag_list || []).map((t) => t.name || ''),
    source: 'playwright',
  };
}

function normalizePlaywrightQuery(raw) {
  return {
    rank: raw.rank,
    title: raw.query || '',
    hot_score: raw.hot_score || 0,
    like_count: 0,
    author_name: '',
    url: '',
    tags: [],
    source: 'playwright',
  };
}

async function fetchAll(provider, limit = 20) {
  const prov = provider || getDataProvider();
  const output = { provider: prov, hot_queries: [], hot_notes: [] };

  if (prov === 'redfox') {
    const items = await fetchRedfox(limit);
    output.hot_notes = items.map(normalizeRedfoxItem);
  } else if (prov === 'custom') {
    const items = await fetchCustom(limit);
    if (items && items[0]) {
      if ('title' in items[0] && !('query' in items[0])) {
        output.hot_notes = items;
      } else {
        output.hot_queries = items;
      }
    }
  } else {
    const raw = await fetchPlaywright(limit);
    output.hot_queries = raw.hot_queries.map(normalizePlaywrightQuery);
    output.hot_notes = raw.hot_notes.map(normalizePlaywrightNote);
  }

  return output;
}

function printResults(data) {
  console.log(`\n📊 小红书每日热门（数据来源：${data.provider}）\n`);

  const queries = data.hot_queries || [];
  if (queries.length > 0) {
    console.log('--- 热搜词 TOP 10 ---');
    queries.slice(0, 10).forEach((q, idx) => {
      const title = q.title || '';
      const score = q.hot_score || 0;
      console.log(`${idx + 1}. ${title} 🔥 ${score}`);
    });
    console.log();
  }

  const notes = data.hot_notes || [];
  if (notes.length > 0) {
    console.log('--- 热门笔记 TOP 10 ---');
    notes.slice(0, 10).forEach((note, idx) => {
      const title = (note.title || '').slice(0, 28);
      const author = note.author_name || '';
      const likes = note.like_count || 0;
      const url = note.url || '';
      console.log(
        `${idx + 1}. 《${title}》 by @${author} | 👍 ${likes}`
      );
      if (url) {
        console.log(`   🔗 ${url}`);
      }
    });
  }

  if (queries.length === 0 && notes.length === 0) {
    console.log('未获取到数据，小红书可能更新了反爬策略。');
  }
}

// ═══════════════════════════════════════════════════════════════
// CLI 入口
// ═══════════════════════════════════════════════════════════════

function parseArgs() {
  const args = process.argv.slice(2);
  const result = { provider: null, limit: 20, json: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--provider' && args[i + 1]) {
      result.provider = args[i + 1];
      i++;
    } else if (args[i] === '--limit' && args[i + 1]) {
      result.limit = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--json') {
      result.json = true;
    }
  }
  return result;
}

const args = parseArgs();
const data = await fetchAll(args.provider, args.limit);

if (args.json) {
  console.log(JSON.stringify(data, null, 2));
} else {
  printResults(data);
}
