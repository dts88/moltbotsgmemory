---
name: foiz-inventory
description: 查询富查伊拉（Fujairah）FOIZ 成品油库存数据。触发词：富查伊拉库存、FOIZ库存、Fujairah库存、富查伊拉库存数据。数据来源：fujairah.platts.com 公开 API，提供 light/medium/heavy 分类数据及 WoW 变化。
---

# FOIZ 库存查询

## API（均无需认证，直接 fetch）

**库存数据**（周度，每周二发布）
```
GET https://fujairah.platts.com/fujairah/rest/public/latest
```
返回字段（`data`）：`asOfDate`, `publishTime`, `light`, `medium`, `heavy`，单位**千桶**，÷1000 = MB

**船燃销售**（月度）
```
GET https://fujairah.platts.com/fujairah/rest/public/latestBunker
```
返回字段（`data`）：
- `symbol1`：进港船数（艘）
- `symbol2`：VLSFO 380cst 低硫重燃（mt）
- `symbol3`：HSFO 380cst 高硫重燃（mt）
- `symbol4`：Low Sulfur MGO（mt）
- `symbol5`：Lubricants 润滑油（mt）
- `symbol6`：Marine Gasoil（mt）

## 脚本

`scripts/foiz-inventory.mjs` — 包含 WoW 变化计算，输出 JSON `{ status, asOfDate, message, data, wow }`

```bash
cd /home/node/clawd && node scripts/foiz-inventory.mjs
```

解析输出的 `message` 字段直接发送即可。

## 格式示例

```
📦 富查伊拉 FOIZ 库存周报
数据截至: 2026-03-23  |  发布: Wed, 25 Mar 2026

总库存: 14.021 MB (-2.8% WoW)

  Light Distillates（轻馏分）: 6.803 MB
  Middle Distillates（中间馏分）: 1.865 MB
  Heavy Distillates（重质馏分/残渣油）: 5.353 MB

数据来源: fujairah.platts.com (FOIZ/S&P Global)
```

## 历史存档

脚本自动将每周数据存入 `.config/foiz/history.json`（保留最近 52 周），用于 WoW 计算。
历史端点 `gethistorystockdata` / `getweekgraphdata` 需登录（403），无法直接查。

## 发布规律

- 库存数据：每周二发布（数据截至上周日）
- 船燃销售：月度更新

Cron `e650493f` 周二/三 10:00 SGT 自动推送至 Telegram 市场数据推送 topic（-1003727952836, threadId=1881）。
