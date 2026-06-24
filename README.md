# xiaohongshu-dailytop

小红书（Xiaohongshu）每日热门数据抓取 Agent Skill。支持多数据源自动回退，零配置启动，无需强制依赖第三方付费 API。

## 核心特性

- **多数据源优先级回退**：RedFox API → 自定义 API → Playwright 本地抓取
- **零配置自启动**：首次运行时自动安装缺失的依赖和浏览器
- **双运行时支持**：Node.js + Python，根据环境自动选择
- **字段归一化**：无论哪个数据源，输出统一格式
- **附带原文链接**：每条笔记都包含可直接访问的小红书链接

## 快速开始

### 方式一：对话安装（推荐，零配置）

直接在 AI 对话中说：

```
安装小红书每日热门 Skill
```

或：

```
添加 Skill https://github.com/AIWhatYouNeed/xiaohongshu-dailytop
```

AI 会自动完成：
1. 克隆仓库到 `.lingma/skills/xiaohongshu-dailytop/`
2. 检测运行时环境（Node.js / Python）
3. 自动安装缺失的依赖（Playwright + Chromium）
4. 完成后直接说 **"看一下今天小红书热门"** 即可使用

> **无需手动下载、无需配环境变量、无需写代码。**

### 方式二：手动安装

将本仓库克隆到你的 AI Agent Skills 目录：

```bash
# Lingma / Claude Code 等 Agent 环境
git clone https://github.com/AIWhatYouNeed/xiaohongshu-dailytop.git .lingma/skills/xiaohongshu-dailytop

# 或 Codex 环境
git clone https://github.com/AIWhatYouNeed/xiaohongshu-dailytop.git .codex/skills/xiaohongshu-dailytop
```

安装完成后，直接对 AI 说：

```
看一下今天小红书热门
```

### 方式三：命令行直接运行

```bash
# Node.js 环境（推荐）
npm install
node scraper.mjs --limit 10

# Python 环境
pip install -r requirements.txt
playwright install chromium
python scraper.py --limit 10
```

### 方式四：使用 RedFox API（最稳定）

如果你需要更稳定、更快速的数据获取，可配置 RedFox API：

**1. 获取 API Key**

前往 [红狐 Hub - API 密钥管理](https://redfox.hk/settings/api-keys?source=github) 注册并创建 API Key。

**2. 配置环境变量**

```bash
# macOS / Linux
export REDFOX_API_KEY="sk_xxxx"

# Windows PowerShell
$env:REDFOX_API_KEY="sk_xxxx"
```

**3. 运行**

```bash
node scraper.mjs --provider redfox --limit 20
```

### 方式五：使用自定义 API

```bash
export CUSTOM_API_URL="https://your-api.com/xhs/hot"
node scraper.mjs --provider custom --limit 20
```

## 数据源配置

系统按以下优先级自动选择数据源：

| 优先级 | 环境变量 | 数据源 | 说明 |
|--------|----------|--------|------|
| 1 | `REDFOX_API_KEY` | RedFox API | 稳定、付费，返回结构化 JSON |
| 2 | `CUSTOM_API_URL` | 自定义第三方接口 | 用户自建的代理或替代 API |
| 3 | 无（默认） | Playwright 本地抓取 | 免费，需安装浏览器环境 |

## 输出示例

```
📊 小红书每日热门（数据来源：playwright）

--- 热门笔记 TOP 10 ---
1. 《万千惠这个是真的吗😭》 by @没事别内耗呀 | 👍 1234
   🔗 https://www.xiaohongshu.com/explore/6a1e5b35000000003502e919
2. 《没人觉得淑柔这段比正片还有感觉吗》 by @资深观众杜老撕 | 👍 4619
   🔗 https://www.xiaohongshu.com/explore/6a190a28000000000802671a
...
```

## 项目结构

```
.
├── SKILL.md              # Skill 定义文件（AI Agent 读取）
├── examples.md           # 使用范例
├── README.md             # 本文件
├── scraper.mjs           # Node.js 版抓取器（含依赖自修复）
├── scraper.py            # Python 版抓取器（含依赖自修复）
├── package.json          # Node.js 依赖配置
├── requirements.txt      # Python 依赖配置
├── .gitignore            # Git 忽略规则
└── LICENSE               # MIT 许可证
```

## 环境要求

- **Node.js**: >= 16.0.0（推荐 18+）
- **Python**: >= 3.10（可选，仅在 Python 环境下需要）
- **系统**: Windows / macOS / Linux

## 常见问题

**Q: 首次运行提示安装 Playwright？**
A: 正常现象。脚本会自动执行 `npm install playwright` 和 `playwright install chromium`，无需手动操作。

**Q: npm 安装证书错误？**
A: 如果使用的是旧版淘宝镜像，请切换至官方源：`npm install --registry=https://registry.npmjs.org/`

**Q: 抓取不到数据？**
A: 小红书反爬策略可能更新。建议配置 `REDFOX_API_KEY` 使用稳定 API，或检查网络连接。

**Q: 如何定时自动抓取？**
A: 可使用 cron（Linux/macOS）或 Windows 任务计划程序定时执行 `node scraper.mjs --json > data.json`。

## 许可

MIT License
