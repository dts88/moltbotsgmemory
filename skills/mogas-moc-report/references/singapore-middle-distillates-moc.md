# Singapore GO 10ppm / Jet Kero MOC 方法论

## 适用范围

用于 Singapore middle distillates MOC 的方法论参考，覆盖：
- GO 10ppm FOB Singapore
- Jet Kero FOB Singapore

这是 **最新整理版**，用来替代早期分散在 MEMORY.md 的研究笔记。

## 市场与数据源

### eWindow 市场
- **Paper**: `ASIA MidDist Swap`
- **Physical**: `ASIA MD (PVO)`
- Physical 的报价结构是 `c1_price_basis + c1_price`，本质是对 MOPS 的 differential，不是绝对价

### Heards 对应文章
- GO paper: `PLATTS ASIA & MID EAST GASOIL PAPER TRADES/BIDS/OFFERS SUMMARY`
- GO physical: `PLATTS ASIA MIDDLE EASTERN GASOIL CARGO BIDS/OFFERS TRADES`
- Jet physical: `PLATTS SINGAPORE JET KERO BIDS OFFERS TRADES`

⚠️ GO / Jet **没有独立 KDC 文章**，paper trades summary / close bid-offer 基本就是 paper 侧的权威参考。

## 已确认符号

| 符号 | 含义 | 备注 |
|------|------|------|
| PRFBY00 | GO 10ppm Swap M1 | paper |
| AAPJZ00 | Jet Kero Swap M1 | 最新确认，取代早期误记的 PRFGT00 |
| AAOVC00 | GO 10ppm FOB Singapore Physical | 窗口后约 40 分钟发布，用于事后校验 |
| PJABF00 | Jet Kero FOB Singapore Physical | 同上 |

### Price Data API 读取提醒
```http
GET /market-data/v3/value/history/symbol
  ?filter=symbol in ("AAPJZ00") AND assessDate>="2026-03-20" AND assessDate<="2026-03-20"
  &pageSize=20
```
- 取 `results[].data[]`
- 用 `bate="c"` 取收盘
- `results[].value` 常为空，不要误读

## 关键方法论

### 1. MOPS 与 paper swap 不是同一概念
Physical PVO 合约里的 `MOPS Gasoil` / `MOPS Jet` 是 **装货月的月度平均结算价**，不是当天的 paper swap。

因此：
- Physical cash diff（例如 +$34 到 +$40）不等于真实 physical premium vs same-day paper
- 实际 physical vs paper 的正常交割 premium 通常只有 **+$2 到 +$5/bbl**

### 2. 正确评估公式
```text
physical price = paper swap VWAP + physical cash diff
```
这是最新确认版。早期“从 swap 减去 differential”的理解是错的。

### 3. 与 Mogas 的关键区别
- **GO / Jet 不用 Mogas 那套 Daily Structure / MOPS Strip 插值**
- Paper 端直接取 M1 swap VWAP，或无成交时取 close bid/offer 中点
- Physical 端取 `MOPS + highest demonstrable diff`
- Physical differential 已内含时间价值，通常**不再做 Mogas 式 laycan 时间校正**

## 评估框架

### Paper
1. 有成交 → 用 M1 swap VWAP
2. 无成交 → 用 active / inactive close bid-offer 中点
3. 若只有单边 → 用 best demonstrable bid 或 offer，并明确标注

### Physical
1. 识别 demonstrable bids / trades
2. 以 `MOPS + diff` 表示成 absolute equivalent
3. 取最高可证明的 physical level 作为日内 physical assessment 参考

## 已验证结论

### 2026-03-19 验证
- Jet: paper $163.25 + Vitol close bid +$38 = $201.25
  - vs 官方 PJABF00 $201.07，偏差 **-$0.18** ✅
- GO: paper $153.50 + Ampol flat bid +$41 = $194.50
  - vs 官方 AAOVC00 $198.88，偏差 **-$4.38** ⚠️
  - 原因：GO 近端 deemed bid 可能采用更高的近端 MOPS 基准，而非 OTC 全月均值

### 2026-03-20 校验
- AAPJZ00 = $184.44
- PJABF00 = $222.52
- 差值 = $38.08，和 eWindow 的 `MOPS + 38` 一致 ✅

## 2026-03-18 基准快照

| 品种 | Paper VWAP | 收盘特征 | Physical diff | Physical 估算 |
|------|-----------|---------|---------------|---------------|
| GO 10ppm | $153.35 | bid $152.75 / offer $153.50 | +$35 vs MOPS | $155-157 |
| Jet Kero | $163.25 | offer $168（无 bid） | +$34 成交 / +$37 bid | $165-168 |

### 当天情形判断
- GO: 价格交叉，VITOLSG bid $35 = TRAFI offer $35，窗口关闭前未撮合
- Jet: 有实货成交，AMPOLSG → VITOLSG +$34，100kb，08:29:04

## lot size 备注
- GO / Jet physical: `lot_unit=bbl`
- `order_quantity` = 手数，`order_quantity_total` = 总桶数
- Mogas 92 `(100kb)` 的传统写法不要直接套到 GO / Jet 上

## 使用建议
- **实时分析**: eWindow + Heards
- **事后校验**: Price Data API（AAOVC00 / PJABF00 / PRFBY00 / AAPJZ00）
- 如果和 Mogas 方法冲突，以这里为准，因为 GO / Jet 的 MOC 结构不同于汽油
