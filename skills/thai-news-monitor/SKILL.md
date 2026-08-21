---
name: thai-news-monitor
description: 监控泰国五大英文新闻网站（Bangkok Post、The Thaiger、Thai PBS World、Nation Thailand、Khaosod English），按关键词过滤并生成可投递文本，交由 OpenClaw delivery 发送到指定目标。触发词：泰国新闻监控、thai news monitor、启动泰国新闻、更新泰国新闻关键词。每小时由 cron 自动运行，也可手动触发。
---

# Thai News Monitor

## 数据源

| 网站 | 抓取方式 | URL |
|------|---------|-----|
| Bangkok Post | RSS (topstories + business) | bangkokpost.com/rss/data/*.xml |
| The Thaiger | RSS | thethaiger.com/feed |
| Thai PBS World | RSS | world.thaipbs.or.th/feed |
| Nation Thailand | JSON API | api.nationthailand.com/v1.0/categories/news |
| Khaosod English | HTML 解析 | khaosodenglish.com（403 则跳过）|

## 关键词过滤（两层）

**第一层（公司）**: AIS, Advanced Info Service, ADVANC, Gulf Energy, Gulf Development, GULF, True Corp, True Corporation, True Move

**第二层（宏观/电信）**: telecom, telecommunications, mobile network, 5G, spectrum, GDP, inflation, baht, Bank of Thailand, BOT, interest rate, fiscal, budget, SET, stock exchange, economy, economic

关键词配置在 `~/.config/thai-news-monitor/config.json`（可选覆盖）。

## 去重机制

已推送文章 ID 缓存在 `~/.config/thai-news-monitor/seen.json`（最多 2000 条），防止重复推送。

## 输出格式

每条新闻单独描述，多条时加 [1][2] 编号，末尾附链接：

```
[1] AIS announces 5G expansion in 10 new provinces, targeting 80% national coverage by Q3 2026.
https://www.bangkokpost.com/...

[2] Bank of Thailand holds rate at 2.5% amid inflation concerns.
https://thethaiger.com/...
```

## 运行脚本

```bash
node scripts/thai-news-monitor.mjs
node scripts/thai-news-monitor.mjs --delivery
```

- 默认输出 JSON 数组，字段：title, summary, url, source, publishedAt
- `--delivery` 输出可直接投递的纯文本正文；若无新消息，输出 `📭 YYYY-MM-DD HH:mm SGT — 暂无匹配新闻` 通知

## Cron / Delivery 配置

- **目标**: Telegram 群组 -1003526235110, topic 7（系统管理）
- **频率**: 每小时
- **执行方式**: 用 isolated `agentTurn` 运行脚本并生成最终正文，不要让脚本自己发消息
- **发送方式**: 顶层 `delivery.mode="announce"`，例如 `channel=telegram`, `to=-1003526235110:topic:7`
- **模型**: 不指定，由系统默认决定

## 手动触发 / 调整关键词

如需修改监控公司或话题关键词，编辑 `~/.config/thai-news-monitor/config.json`：

```json
{
  "keywords": ["AIS", "Gulf", "True Corp", ...]
}
```
