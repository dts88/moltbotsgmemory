# Dubai Singapore Cracking — 产品符号与产率

## 产品符号完整表（Platts 官方，2026-03-30 确认）

| 产品 | Symbol | 单位 | $/bbl 换算 | 产率 |
|------|--------|------|-----------|------|
| Propane Refrigerated CFR Japan | AAVAK00 | $/mt | ÷ 12.480 | 2.15% |
| Butane Refrigerated CFR Japan | AAVAN00 | $/mt | ÷ 10.749 | 3.67% |
| Naphtha FOB Singapore Cargo | PAAAP00 | $/bbl | 直接 | 10.23% |
| Gasoline 92 RON FOB Singapore Cargo | PGAEY00 | $/bbl | 直接 | 8.68% |
| Gasoline 97 RON FOB Singapore Cargo | PGAMS00 | $/bbl | 直接 | 6.65% |
| Jet Kero FOB Singapore Cargo | PJABF00 | $/bbl | 直接 | 13.80% |
| Gasoil 10ppm FOB Singapore Cargo | AAOVC00 | $/bbl | 直接 | 14.76% |
| Gasoil 500ppm FOB Singapore Cargo | AAPPF00 | $/bbl | 直接 | 9.54% |
| Gasoil 2500ppm FOB Singapore Cargo | AACUE00 | $/bbl | 直接 | 8.68% |
| FO 180 CST 2.0%S FOB Singapore Cargo | PUAXS00 | $/mt | ÷ 6.35 | 2.59% |
| FO 180 CST 3.5%S FOB Singapore Cargo | PUADV00 | $/mt | ÷ 6.35 | 3.33% |
| FO 380 CST 3.5%S FOB Singapore Cargo | PPXDK00 | $/mt | ÷ 6.35 | 5.84% |
| LSWR → Marine Fuel 0.5% FOB Singapore | AMFSA00 | $/mt | ÷ 6.80 **+ $1/b** | 6.94% |
| **合计** | | | | **96.87%** |
| Petcoke FOB US Gulf 6.5%S + Loss | — | — | — | 3.13% |

## 产率说明

- **方法**：无约束 NNLS 回归（Non-Negative Least Squares）
- **数据**：307 个交易日（2025-01-02 ~ 2026-03-27）
- **RMSE**：0.179 $/bbl
- **算法**：投影梯度法，仅约束 yield ≥ 0

### 产率稳健性

| 稳定性 | 产品 |
|-------|------|
| ✅ 高（跨数据集差 < 0.5%） | 92 RON (8.68%)、Jet (13.80%)、GO10 (14.76%)、GO500 (9.54%)、GO2500 (8.68%) |
| ⚠️ 中等 | Naphtha (~10%)、LSWR (~7-10%，随数据集变化）、Gas97 (~4-7%）|
| ❌ 不稳定（互相替代） | FO180_2S / FO180_3.5S（总和 ~5.9% 稳定，单独值不稳定）|

## LSWR 替代说明

FOB Indonesia LSWR 于 **2019-04-01 停止报价**。

Platts 官方推荐替代：
- FOB Indonesia LSWR：`AMFSA00 − $3.5/b`
- **FOB Indonesia LSWR Mixed/Cracked：`AMFSA00 + $1/b`**（Platts GPW 计算使用此版本）

换算系数：6.80 bbl/mt（原 LSWR Mixed/Cracked 规格）

## 最近10天验证（2026-03-16 ~ 2026-03-27）

| 日期 | 估算Margin | 实际DBSCM00 | 误差 |
|------|-----------|------------|------|
| 3/16 | -5.98 | -6.00 | +0.02 |
| 3/17 | -9.85 | -9.88 | +0.03 |
| 3/18 | -6.87 | -7.11 | +0.24 |
| 3/19 | +0.00 | -0.38 | +0.38 |
| 3/20 | +4.20 | +4.28 | -0.08 |
| 3/23 | +3.78 | +4.18 | -0.40 |
| 3/24 | -1.56 | -1.22 | -0.34 |
| 3/25 | +1.42 | +1.70 | -0.29 |
| 3/26 | +38.86 | +38.79 | +0.07 |
| 3/27 | +42.61 | +42.70 | -0.09 |

所有误差 < ±0.4 $/bbl ✅
