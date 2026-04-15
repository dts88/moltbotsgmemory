---
name: thai-news-monitor
description: 监控泰国五大英文新闻网站（Bangkok Post、The Thaiger、Thai PBS World、Nation Thailand、Khaosod English），按关键词过滤，推送到指定 Telegram 会话。触发词：泰国新闻监控、thai news monitor、启动泰国新闻、更新泰国新闻关键词。每小时由 cron 自动运行，也可手动触发。
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
```

输出 JSON 数组，字段：title, summary, url, source, publishedAt

## Cron 配置

- **目标**: Telegram 群组 -1003526235110, topic:7 (系统管理)
- **频率**: 每小时
- **模型**: Sonnet（默认）

## 手动触发 / 调整关键词

如需修改监控公司或话题关键词，编辑 `~/.config/thai-news-monitor/config.json`：

```json
{
  "keywords": ["AIS", "Gulf", "True Corp", ...]
}
```
