---
name: eia-data
description: 查询美国能源信息署（EIA）周度数据，包括原油/汽油/馏分油库存、产量、炼厂开工率。触发词：EIA数据、美国库存、美国原油产量、EIA周报、炼厂开工率。
---

# EIA Data

脚本: `scripts/eia-data.mjs`
API端点: `https://api.eia.gov/v2/`
凭证: `.config/eia/credentials.json`

## 可查数据系列

| 系列名 | 说明 |
|--------|------|
| crudeStocksExSPR | 商业原油库存（除SPR） |
| crudeStocksSPR | 战略石油储备（SPR） |
| crudeProduction | 美国原油产量 |
| gasolineStocks | 汽油库存 |
| distillateStocks | 馏分油库存 |
| refineryRuns | 炼厂投料量 |
| refineryCapUtil | 炼厂开工率 |
| netImports | 原油净进口 |

## 用法

```bash
node scripts/eia-data.mjs <series> [--weeks=N]
```

## 数据特点

- 频率：周度数据
- 发布时间：**分两批**
  - **10:30 AM ET（约 22:30 SGT）**：库存、产量、炼厂、进出口总量等主要数据
  - **1:00 PM ET（约 01:00 SGT 次日）**：国别进口来源数据（Table 10 / WIMPC API）
- EIA 周报 cron 已自动执行（每周三 23:40 SGT）

## 国别进口数据处理逻辑

国别进口来源（加拿大/沙特/伊拉克等）**单独延迟发布**，处理方式：

1. **先尝试拉取**：查询 WIMPC API，检查最新 period 是否等于本周报告日期
2. **如果已更新**：直接使用，正常出报告
3. **如果未更新**（period 仍为上周）：
   - 在报告中注明"国别进口数据约 01:00 SGT 后更新，稍后补充"
   - 自动设置 cron，在 **01:15 SGT** 重新拉取国别数据，追加发送给用户
4. **追加发送格式**：
   ```
   📊 EIA 补充：主要进口来源（截至 YYYY-MM-DD）
   • 加拿大：X千桶/日（+/-X）
   ...
   ```

## 数据来源映射

| 数据 | 来源 |
|------|------|
| 库存（含Cushing） | ir.eia.gov/wpsr/table4.csv |
| 供需/进出口 | ir.eia.gov/wpsr/table1.csv |
| 炼厂/开工率 | ir.eia.gov/wpsr/table9.csv |
| 国别进口来源 | EIA API /petroleum/move/wimpc/data/ |

⚠️ **Cushing 库存**在 table4.csv 中（关键词 "Cushing"），不在 WIMPC API，每周三 10:30 AM 即可获取。

## 周报格式（固定）

格式：库存（含Cushing）→ 供应（产量/炼厂/开工率）→ 进出口 → 需求 → 国别进口来源 → 要点
单位：库存用万桶，流量用千桶/日（不用"M桶"）
规则：不加粗，用 • 符号，变化值用 (+/-X)
