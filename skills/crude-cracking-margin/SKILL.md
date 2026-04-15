---
name: crude-cracking-margin
description: 分析原油裂解利润率（Cracking Margin / Netback）。包含 Dubai Singapore Cracking Margin（DBSCM00）的完整计算体系：GPW 产品符号表、产率、公式、数据拉取脚本。也可用于其他原油（如 Murban、阿曼、Brent）的类似分析。触发词：裂解利润、裂解价差、Cracking Margin、Cracking Netback、GPW、Dubai Margin、DBSCM00、炼厂利润、产率分析。
---

# Crude Cracking Margin 分析

## 核心公式

```
Cracking Margin = GPW − Freight − Crude_Price
GPW (Gross Product Worth) = Σ yield_i × product_price_i
```

对于 Dubai Singapore：
```
DBSCM00 = DBSCY00 − TDDCQ00 − PCAAT00
```
（9天验证误差 ≤ 0.01 $/bbl，完美精确）

## 关键符号

| 符号 | 含义 | 备注 |
|------|------|------|
| DBSCM00 | Dubai Singapore Cracking Margin | 最终结果 $/bbl |
| DBSCY00 | GPW（Gross Product Worth） | 直接可用 |
| TDDCQ00 | 运费 | $/bbl，bate=u，直接用 |
| PCAAT00 | Dubai Mo01 原油价格 | $/bbl |

**优先使用 DBSCY00**，无需手动计算 GPW。手动计算用于拆解产品贡献或做其他原油分析。

## Dubai Singapore 产品符号与产率

详见 `references/dubai-product-slate.md`

产率来源：无约束 NNLS 回归（307天数据，RMSE=0.179 $/bbl）

## 分析其他原油

对其他原油（Murban、Oman、Brent 等）做类似分析的步骤：

1. **确定产品符号**：向 Platts 询问该原油对应的 GPW 符号（如 `XXXX_GPW00`）或直接用通用产品符号
2. **确认原油符号**：找到该原油的 spot daily assessment 符号
3. **产率回归**：用脚本 `scripts/yield_regression.mjs` 拉历史数据、反推产率
4. **验证**：对比回归 GPW 与官方 GPW（如有）

## 脚本

- `scripts/yield_regression.mjs` — 无约束 NNLS 产率回归（输入：产品符号列表 + GPW 符号）
- `scripts/gpw_calculator.mjs` — 用给定产率计算最近 N 天 GPW + Margin

## 数据 API

Platts Market Data API：
```
GET https://api.platts.com/market-data/v3/value/history/symbol
  ?filter=symbol:"XXX00" AND assessDate>="YYYY-MM-DD" AND assessDate<="YYYY-MM-DD"
  &pageSize=500
```
- 认证：Bearer token + appkey（见 `.config/spglobal/credentials.json`）
- 每符号最多 167 条/次，超过需分段查询（见脚本）
- bate=`c`（close）用于大多数产品；bate=`u` 用于 TDDCQ00（运费）
