---
name: safeairspace
description: 查询 safeairspace.net 的实时空域风险与冲突区警告。触发词：空域情况、空域风险、空域警告、飞行限制、NOTAM、哪些国家空域关闭、中东空域、某国能不能飞。包含：按国家/地区查询、风险等级过滤、新增预警检测。不用于：实时航班追踪、气象信息（METAR/SIGMET）、常规禁飞区。
---

# Safe Airspace 空域风险查询

数据来源: https://safeairspace.net/ (Conflict Zone and Risk Database)
内容: 各国 NOTAM、EASA CZIB、FAA Background Notice 等官方空域警告

## 快速查询脚本

脚本位置: `skills/safeairspace/scripts/safeairspace-query.mjs`

```bash
# 中东地区（最常用）
node skills/safeairspace/scripts/safeairspace-query.mjs --region=mideast --days=14

# 指定国家
node skills/safeairspace/scripts/safeairspace-query.mjs --country=Iran

# 全部最新（默认30天）
node skills/safeairspace/scripts/safeairspace-query.mjs

# 仅新增条目（与上次查询对比）
node skills/safeairspace/scripts/safeairspace-query.mjs --region=mideast --new

# JSON 格式（供程序处理）
node skills/safeairspace/scripts/safeairspace-query.mjs --region=mideast --json
```

## 支持参数

| 参数 | 说明 | 示例 |
|------|------|------|
| `--region=X` | 按地区过滤 | mideast / caucasus / africa / europe / asia |
| `--country=X` | 按国家过滤（模糊匹配） | Iran / Saudi Arabia |
| `--days=N` | 最近N天（默认30） | --days=7 |
| `--new` | 仅首次出现的条目 | （需 state 文件） |
| `--json` | JSON 输出 | 供程序处理 |

地区分组详见 `references/regions.md`

## 与 Polymarket 监控集成

每4小时 Polymarket cron 会自动调用监控版脚本（状态追踪版）:
`scripts/safeairspace-monitor.mjs` — 输出新增条目 + 近7天中东汇总

用户手动查询时，使用本 skill 的 `safeairspace-query.mjs`（无状态追踪，适合按需查询）。

## 输出格式示例

```
✈️ Safe Airspace 空域风险查询
范围: mideast 地区 | 结果: 35条 / 共146条
来源: https://safeairspace.net/

⛔ Iran
  [11 Mar] France Notam: French operators should not enter the airspace of Iran.
  [02 Mar] Risk summary: OIIX/Tehran FIR closed amid US-Israel strikes and Iranian missile retaliation.

⚡ Saudi Arabia
  [16 Mar] France Notam: Should not enter except west of M999/L677 at or above FL320.
```

## 注意事项

- 日期无年份，自动推断当年（跨年12月数据可能误判）
- 仅覆盖冲突/战争风险，不含常规禁飞区
- 发布机构缩写: EASA=欧洲航空安全局, FAA=美国, CZIB=冲突区信息公告
