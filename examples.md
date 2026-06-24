# xiaohongshu-dailytop 使用范例

## 范例 1：基础触发（默认使用 Playwright）

**用户输入：**
> 看一下今天小红书热门

**系统行为：**
1. 检测无 `REDFOX_API_KEY` 和 `CUSTOM_API_URL`
2. 使用 Playwright 启动 Chromium，访问小红书发现页
3. 拦截 `/api/sns/web/v1/search/trending` 响应
4. 归一化数据并输出

**输出示例：**
```
📊 小红书每日热门（数据来源：Playwright 本地抓取）

--- 热搜词 TOP 10 ---
1. AI 编程入门 🔥 985000
2. 暑期旅游攻略 🔥 872000
3. 减脂餐打卡 🔥 765000
...

--- 热门笔记 TOP 10 ---
1. 《我用 AI 三天做了一个 App》 by @程序员小王 | 👍 12.5w
   🔗 https://www.xiaohongshu.com/explore/abc123
2. 《大理旅居一个月花了多少钱》 by @流浪猫 | 👍 8.3w
   🔗 https://www.xiaohongshu.com/explore/def456
```

---

## 范例 2：使用 RedFox API（环境变量已配置）

**前置条件：**
```bash
export REDFOX_API_KEY="sk_live_xxxxxxxx"
```

**用户输入：**
> 小红书最近三天关于 AI 的热门笔记

**系统行为：**
1. 检测到 `REDFOX_API_KEY`，选用 RedFox Provider
2. 调用 `https://api.redfox.hk/v1/xiaohongshu/daily-hot?keyword=AI&days=3`
3. 过滤并返回结果

**输出示例：**
```
📊 小红书 AI 热门笔记（数据来源：RedFox API）

| 排名 | 标题 | 作者 | 点赞 | 评论 | 收藏 | 链接 |
|------|------|------|------|------|------|------|
| 1 | 2026 年最值得学的 AI 工具清单 | @科技前沿 | 45.2w | 3200 | 12w | [查看](https://www.xiaohongshu.com/explore/xxx) |
| 2 | 我用 Claude 自动化了全部工作流 | @效率达人 | 38w | 2800 | 9.5w | [查看](https://www.xiaohongshu.com/explore/yyy) |
```

---

## 范例 3：使用自定义 API

**前置条件：**
```bash
export CUSTOM_API_URL="https://my-proxy.internal/xhs/hot"
```

**用户输入：**
> 获取小红书热门，按点赞数排序

**系统行为：**
1. 检测到 `CUSTOM_API_URL`，选用 Custom Provider
2. GET 请求用户指定接口
3. 对返回数据按 `like_count` 降序排序

---

## 范例 4：Playwright 未安装时的引导

**用户输入：**
> 小红书热门

**系统行为：**
1. 默认尝试 Playwright，发现未安装
2. 向用户输出安装指引：

```
⚠️ 未检测到 REDFOX_API_KEY 与 CUSTOM_API_URL，默认使用 Playwright 本地抓取。
检测到 Playwright 未安装，请运行以下命令：

  pip install playwright requests
  playwright install chromium

安装完成后重新提问即可。
如需更稳定体验，可访问 https://redfox.hk 获取 API Key。
```

---

## 范例 5：结合 AI 分析热点

**用户输入：**
> 今天小红书热门里，哪些适合我这种编程博主跟进？

**系统行为：**
1. 先通过 Skill 获取当日热门数据
2. 将前 20 条热门笔记标题、标签、互动数据作为上下文
3. 用 LLM 分析哪些话题与编程/科技相关，给出内容创作建议

**输出示例：**
```
📊 今日小红书热门数据采集完成（20 条）

🎯 适合你跟进的热点：
1. "AI 编程入门" — 可出教程系列，竞争适中
2. "独立开发者月入过万" — 故事型内容，易引发共鸣
3. "Cursor  vs Windsurf 测评" — 时效性强，建议 48h 内发布

💡 内容角度建议：
- 用真实项目演示而非纯工具介绍
- 标题加入数字和结果（如"3天、0成本、1w用户"）
- 封面用分屏对比图（Before/After）
```

---

## 范例 6：多平台对比（配合其他 Skill）

**用户输入：**
> 对比今天小红书和抖音的热门话题

**系统行为：**
1. 调用本 Skill 获取小红书热门
2. 调用 `douyin-dailytop` Skill（假设存在）获取抖音热门
3. 对比两个平台的重叠话题与差异话题

**输出示例：**
```
🔥 跨平台热门对比（2026-06-23）

【双平台同时上榜】
- AI 编程：小红书 #2  |  抖音 #1
- 暑期旅游：小红书 #5  |  抖音 #3

【小红书独有】
- 减脂餐打卡、极简生活、租房改造

【抖音独有】
- 短剧解说、农村生活、汽车测评
```
