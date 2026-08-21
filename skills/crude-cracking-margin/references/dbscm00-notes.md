# DBSCM00 方法论与验证备注

这是 Dubai Singapore Cracking Margin（DBSCM00）的最新整理版，用来替代早期研究过程中分散的 MEMORY.md 笔记。

## 1. 官方公式

```text
DBSCM00 = DBSCY00 − TDDCQ00 − PCAAT00
```

同时：
```text
DBSCN00 = DBSCY00 − TDDCQ00
```

结论：
- `DBSCY00` = GPW（Gross Product Worth）
- `TDDCQ00` = freight，`bate=u`，单位已经是 **$/bbl**，直接使用
- `PCAAT00` = Dubai Mo01 / NextGen MOC 原油价格

## 2. 关键方法论

### 优先级
- **优先直接使用 DBSCY00**，不要重复手算 GPW
- 手算 GPW 只用于拆解产品贡献、做别的 crude margin、或做研究验证

### LSWR 最新结论
- 印尼 LSWR 自 2019-04-01 起已停止报价
- DBSCM00 / GPW 计算中，LSWR 的官方替代应视为：
```text
AMFSA00 ÷ 6.80 + $1/bbl
```
- `AALRX00` 仍可能有数据，但**已不是** GPW 计算里的正确替代

### 产率与 OPEX
- 产率来自 Turner, Mason TMMS，官方不公开
- 现有产率是基于历史回归的高拟合近似值
- OPEX 包含电力与催化剂/化学品，不是单独从 margin 公式里再加一个固定项

## 3. crack symbol cross-check

这些是常用的 Dubai crack symbol，用于拆解产品贡献，不是 GPW 绝对价本身：

| 产品 | crack symbol |
|------|--------------|
| 石脑油 | AAHCS00 |
| 汽油 92 RON | AAYED00 |
| 汽油 97 RON | AAHCO00 |
| 航煤 | AAHCL00 |
| GO 10ppm | AAHCE00 |
| GO 500ppm | AAHCM00 |
| GO 2500ppm | AAHCN00 |
| FO 180 2.0%S | AAHCA00 |
| FO 180 3.5%S | AAHBX00 |
| FO 380 3.5%S | AAWHA00 |

如果要复原 GPW，更稳妥的是读 `references/dubai-product-slate.md` 里的**绝对价 symbol**，不要只靠 crack symbol 反推。

## 4. 历史验证

### 2026-03-17 ~ 2026-03-27
最新验证显示：
- 用 `DBSCY00 − TDDCQ00 − PCAAT00` 计算
- 连续多日误差可做到 **≤ 0.01 $/bbl**

### 代表性日期

| 日期 | DBSCY00 | TDDCQ00 | PCAAT00 | DBSCM00 | 误差 |
|------|---------|---------|---------|---------|------|
| 2026-03-17 | 156.25 | 8.47 | 157.66 | -9.88 | 0.00 |
| 2026-03-18 | 156.56 | 8.12 | 155.55 | -7.11 | 0.00 |
| 2026-03-20 | 170.68 | 7.55 | 158.85 | +4.28 | 0.00 |
| 2026-03-26 | 157.62 | 5.79 | 113.04 | +38.79 | 0.00 |
| 2026-03-27 | 170.66 | 5.82 | 122.14 | +42.70 | 0.00 |

## 5. 研究中曾修正的关键认知

- `TDDCQ00` 不需要吨桶换算，直接就是 $/bbl
- LSWR 不再用旧的 Indonesia LSWR 绝对价逻辑，统一改为 `AMFSA00 + $1/b`
- 产率回归是研究工具，不是日常计算必需步骤

## 6. 使用建议

- **日常问 DBSCM00**: 直接查 `DBSCM00` 或按公式用 `DBSCY00 / TDDCQ00 / PCAAT00`
- **问产品贡献**: 读 `references/dubai-product-slate.md`
- **问研究过程中的旧结论**: 以本文件和 `dubai-product-slate.md` 为准，不再回退到早期 MEMORY 版本
