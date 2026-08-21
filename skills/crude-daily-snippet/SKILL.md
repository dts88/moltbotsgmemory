---
name: crude-daily-snippet
description: 生成固定格式的「原油每日价格文字片段」。查询 6 个 Platts 代码——迪拜（PCAAT00）、迪拜 Mo3（PCAAV00，用于 M1-M3 价差）、Dated 现货布伦特（PCAAS00）、ICE 布伦特伦敦16:30（AAYES00）、ICE 布伦特期货收盘（ICLL001）、ICE WTI 期货收盘（ICIC001）——自动取最近一个完整交易日，对比前一交易日，按新加坡16:30 / 伦敦16:30 / 期货收盘结算价三段中文格式输出。触发词：原油每日片段、原油价格片段、迪拜片段、每日油价、daily crude snippet、crude price snippet、原油价格简讯。
---

# 原油每日价格片段 Skill

按用户固定格式生成上一日原油价格文字片段，可直接复制到日报/群消息，也可由 OpenClaw cron 每天投递。

## 输出格式（严格）

```
6月23日 
新加坡16:30
迪拜 71.77（跌1.1）
迪拜M1-M3 0.89（持平）

伦敦16:30
Dated现货布伦特 75.39（跌0.875）
ICE布伦特 77（跌0.64）

期货收盘结算价
ICE布伦特 77.08（跌0.82）
WTI  73.21（跌0.65）
```

## 代码映射

| 行 | 代码 | 说明 |
|---|---|---|
| 迪拜 | PCAAT00 | Dubai Mo1（新加坡 16:30） |
| 迪拜M1-M3 | PCAAT00 − PCAAV00 | Mo1 减 Mo3 价差 |
| Dated现货布伦特 | PCAAS00 | 北海现货基准（伦敦 16:30） |
| ICE布伦特（伦敦16:30） | AAYES00 | ICE Brent at London MOC |
| ICE布伦特（期货收盘） | ICLL001 | ICE Brent 结算 |
| WTI（期货收盘） | ICIC001 | ICE WTI 结算 |

## 用法

```bash
# OpenClaw 推荐入口：自动取新加坡日期的上一日
node /home/node/clawd/skills/crude-daily-snippet/scripts/generate.mjs

# 指定评估日期
node /home/node/clawd/skills/crude-daily-snippet/scripts/generate.mjs 2026-06-23
```

脚本将片段直接打印到 stdout（UTF-8）。保留 `scripts/generate.py` 仅作原始 Claude 版本参考；OpenClaw 任务使用 Node.js 入口。

## 规则

- **涨跌**：对比该代码前一个有数据的交易日；`涨X` / `跌X` / 数值相同时 `持平`。
- **取数日**：默认取新加坡日期的上一日。例如 6月26日 09:00 SGT 运行时，目标日期是 6月25日。若上一日伦敦/期货锚定代码（PCAAS00 / AAYES00 / ICLL001 / ICIC001）未齐，脚本报错，不静默改成更早日期。
- **数字精度**：保留 Platts 原始精度，去掉尾随 0（如 78.90→78.9，0.8750→0.875）。
- **定时投递**：不要再用 OpenClaw cron + isolated agent 跑这个任务。2026-07-28 已确认模型/工具 lane 会造成假成功或模型版本问题。2026-07-29 又确认从 Codex 工具会话启动的后台 Node scheduler 会被清理，不能作为持久定时器。当前可靠入口是脚本直发 + OpenClaw 主会话 cron 触发：
  - `scripts/crude-daily-snippet-send-whatsapp.mjs`：生成片段、按 SGT delivery date 去重，并通过 `openclaw message send --channel whatsapp --target +6592716786` 直发。
  - OpenClaw cron `e1670577-9770-4beb-889f-87744e55eec7`：周二至周六 08:00 SGT 向主会话注入 systemEvent，要求本地 exec 运行 `node scripts/crude-daily-snippet-send-whatsapp.mjs`。脚本自己发送 WhatsApp，cron delivery 为 `none`。
  - `scripts/crude-daily-snippet-scheduler.mjs` 仅保留作手动/实验工具，不要用它承担正式每日投递。
  - 状态检查：`openclaw cron get e1670577-9770-4beb-889f-87744e55eec7`；发送日志：`logs/crude-daily-snippet-direct.log`。
- **旧 OpenClaw cron**：`571fb419-b6a9-4542-91f6-9550bbceab09` 已禁用，仅保留作历史记录，不要重新启用，除非 OpenClaw/Codex runtime 升级后重新设计并通过 force run 验证。

## 认证

OpenClaw 版本通过 `scripts/platts-auth.mjs` 读取并刷新 `.config/spglobal/credentials.json`，与其他 Platts 任务共享同一套 token。Token 刷新失败时，脚本会以非零退出并让 cron failure alert 通知用户。
