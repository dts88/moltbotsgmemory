---
name: refined-products-report
description: 生成国际成品油市场行情分析月报。从 Platts API 获取新加坡裂解价差数据，按固定四段式结构生成专业分析报告（约600字）。触发词：成品油月报、成品油行情分析、refined products report、成品油市场分析、月度成品油报告。
---

# Refined Products Report

## 工作流程

1. 刷新 Platts token（如需要）：`node scripts/platts-refresh-token.mjs`
2. 查询目标日期裂解价差数据（见下方 API 查询）
3. 查询该日原油和产品绝对价格（用于辅助描述）
4. 结合近期市场事件（来自 weekly-material、MOC daily 档案、记忆文件）
5. 按四段式模板生成报告

## Platts API 查询

```javascript
// 查询裂解价差（close值，bate="c"）
filter: 'symbol in ("DBSCM00","AAYED00","AAHCL00","AAHCE00","AAVUD00","AAHBX00","AAWHA00","MFFOB01","NBSSM01") AND assessDate>="YYYY-MM-DD" AND assessDate<="YYYY-MM-DD"'
endpoint: https://api.platts.com/market-data/v3/value/history/symbol
pageSize: 500

// 提取 close 值：results[].data[].bate === "c"
```

绝对价格（产品/原油）从 `reports/price-data.json` 或 platts-price-data.mjs 脚本获取。

## 核心 Platts 符号

| 符号 | 含义 |
|------|------|
| DBSCM00 | 迪拜新加坡复合裂解毛利（综合炼油毛利） |
| AAYED00 | 92 RON汽油 FOB新加坡 vs 迪拜裂解价差 |
| AAHCL00 | 航煤 FOB新加坡 vs 迪拜裂解价差 |
| AAHCE00 | 柴油10ppm FOB新加坡 vs 迪拜裂解价差 |
| AAVUD00 | 石脑油 CFR日本 vs 迪拜裂解价差 |
| NBSSM01 | 石脑油 FOB新加坡 vs 布伦特裂解价差 |
| AAHBX00 | 高硫燃料油180 FOB新加坡 vs 迪拜裂解价差 |
| AAWHA00 | 高硫燃料油380 FOB新加坡 vs 迪拜裂解价差 |
| MFFOB01 | VLSFO FOB富查伊拉 vs 迪拜裂解价差 |
| PCAAT00 | 迪拜原油 Mo01（绝对价） |
| PCAJG00 | 布伦特 Mo01（绝对价） |
| PGAEY00 | 92 RON FOB新加坡（绝对价） |
| AAOVC00 | 柴油10ppm FOB新加坡（绝对价） |
| PJABF00 | 航煤 FOB新加坡（绝对价） |

## 报告结构（四段式模板）

详见 `references/report-template.md`

## 撰写原则

- 开头固定格式：**"截至[日期]，亚洲地区炼油毛利为[DBSCM00]美元/桶……"**
- 字数控制在约600字
- 语言简明干练，专业术语准确
- 不加"建议"或"展望"等额外章节
- NWE/USGC数据若无Platts官方评估，注明为参考估算
- 数据来源行：*数据来源：Platts API（新加坡官方评估）；截至[日期]。*
