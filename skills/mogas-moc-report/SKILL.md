---
name: mogas-moc-report
description: 生成 Singapore Mogas MOC 每日分析报告。从 Platts eWindow API 和 News Insights Heards 获取数据，计算 MOPS Assessment、Daily Structure、MOPS Strip、物理溢价等。触发词：汽油MOC、Mogas分析、新加坡汽油、MOPS评估、92 RON、95 RON、gasoline MOC。
---

# Singapore Mogas MOC Daily Report — 92 RON 方法论

> ⚠️ 本 skill 仅覆盖 **92 RON（和95 RON）Mogas**，方法论已完整验证。
> GO 10ppm 和 Jet Kero 的 daily structure 与月差用法尚未确认，**暂不纳入本 skill**。

---

## 数据源

### 1. Platts eWindow API（主计算来源）
```
Base URL: https://api.platts.com/tradedata/v3/ewindowdata
认证: Bearer Token（与其他 Platts API 共用）
```

关键市场：
- `ASIA Mogas Physical` — 物理 cargo 成交
- `ASIA Mogas Swap`    — paper/swap 成交

关键筛选：
- **成交**: `order_state="consummated"`
- **收盘订单簿**: `order_state in ("inactive","active")`
- **outright**: `order_spread="F"`
- **价差（spread）**: `order_spread="T"`

⚠️ eWindow 分页上限 500 条，swap 全天约 900+ 条 → 必须按 product/type **分开查询**，不能一次拉全量

### 2. Platts News Insights Heards（辅助验证）
- 发布时间：约 08:37-08:48 UTC（MOC 窗口 08:30 UTC 关闭后）
- 搜索端点：`https://api.platts.com/news-insights/v1/search/heards`
- `appkey: mXrBlqeKBqbHpYNMX96h9qN0D8H5o3AN`

Mogas 相关 heards：
| 文章名 | 内容 |
|--------|------|
| `PLATTS SINGAPORE GASOLINE MOC PAPER TRADES SUMMARY` | swap outright 成交（**MOPS VWAP 权威来源**）|
| `PLATTS SINGAPORE GASOLINE MOC PAPER BIDS SUMMARY` | swap bids on close |
| `PLATTS SINGAPORE GASOLINE MOC PAPER OFFERS SUMMARY` | swap offers on close |
| `PLATTS SINGAPORE GASOLINE MOC TRADES SUMMARY` | 物理 cargo 成交 |
| `PLATTS SINGAPORE GASOLINE MOC BIDS SUMMARY` | 物理 bids on close |
| `UPDATE PLATTS MOGAS` | FOB Fuj notional + MOPAG 基差 |

⚠️ **Heards 是 MOPS VWAP 的权威来源** — 只记录 outright 直接成交，不含 spread 衍生腿

### 3. Platts Price Data API — 官方 Assessment（事后校验）
```
端点: https://api.platts.com/market-data/v3/value/current/symbol
认证: Bearer Token + appkey
```

⚠️ **始终用 `current` 端点**查当日（不用 `history`，会返回所有历史，极慢）

**已确认的 92 RON 符号：**

| 符号 | 含义 | 发布时间（UTC）|
|------|------|--------------|
| AAXEQ00 | MOPS Strip（core assessment）| ~09:55 |
| AAXER00 | 92 RON 物理溢价 vs Strip | ~09:55 |
| AAXEK00 | Bal Month swap（Phase 1 更新，Phase 2 停更）| ~09:08 |
| AAXEL00 | M1 swap | ~09:08 |
| AAXEM00 | M2 swap | ~09:08 |
| PRFEY00 | M1 swap VWAP（eWindow 成交）| ~09:08 |

**官方物理价 = AAXEQ00 + AAXER00**（均为事后值，窗口关闭时不可用）

**数据可用时序：**

| 时间（UTC）| 可用数据 | 用途 |
|-----------|---------|------|
| 08:30 | eWindow 收盘订单簿（inactive）| **主计算** — Strip/物理估算 |
| 08:37-48 | Platts Heards | 验证 M1 VWAP |
| 09:08 | AAXEK00/AAXEL00/AAXEM00 | 事后校验 Bal Month/M1/M2 偏差 |
| 09:55 | AAXEQ00/AAXER00 | **事后校验** Strip 和物理估算精度 |

### 4. Key Data Commentary（KDC）— 文本校验（备用）
- 搜索：`story` 端点，q="Singapore gasoline daily structure"
- 发布时间：约 09:30-09:40 UTC
- 内容：frontMonth/M1 swap 价格、Daily Structure ($/b)、MOPS Strip 文字描述
- KDC 价格来自 OTC/voice broker，与 eWindow 偏差通常 ±$0.10 以内

---

## eWindow 产品名称（ASIA Mogas Swap）

| 产品 | `product` 字段 | `strip` 字段 | `order_spread` |
|------|--------------|-------------|----------------|
| Bal Month outright | `Platts Mogas 92 (balmo)` | `Bal Month` | `F` |
| M1 outright | `Platts Mogas 92` | `Apr26` 等 | `F` |
| M2 outright | `Platts Mogas 92` | `May26` 等 | `F` |
| Bal/M1 spread | `Platts Mogas 92 Spr` | `Bal Month/Apr26` | `T` |
| M1/M2 spread | `Platts Mogas 92 Spr` | `Apr26/May26` | `T` |
| M2/M3 spread | `Platts Mogas 92 Spr` | `May26/Jun26` | `T` |
| 95/92 spread | `Platts Mogas 95/Platts Mogas 92 Spread` | `Apr26` | `T` |

---

## Assessment 方法论

### Step 0：Spread 成交去重

Spread consummated 记录含 **3 条**（1 spread + 2 derived legs）→ VWAP 计算**必须只用 `order_spread="F"` 的 outright 成交**，过滤所有派生腿。

---

### Step 1：M1 Swap VWAP（PRFEY00 / AAXEL00）

优先级：
1. **consummated 成交 VWAP**（`order_spread="F"`，直接成交）
2. 收盘订单簿（inactive）bid/offer 中间价
3. 收盘最优 bid

---

### Step 2：确定 Phase（Bal/M1 vs M1/M2）

```
若 today + 15 <  last_day_of_month  →  Phase 1 (Bal/M1)
若 today + 15 >= last_day_of_month  →  Phase 2 (M1/M2)
```

⚠️ 条件是 `>=` 而非 `>`，已于 2026-03-16 验证：today+15=31=月末，AAXEK00 当日停更，Platts 切换到 Phase 2。

| | Phase 1 (Bal/M1) | Phase 2 (M1/M2) |
|---|---|---|
| frontMonth | Bal Month swap | M1 swap |
| spread pair | Bal/M1 | M1/M2 |
| daysToMid | **正** | **负** |
| Strip vs frontMonth | Strip **<** Bal Month | Strip **>** M1 |
| AAXEK00 | 每日更新 | 停止更新（是切换信号）|

---

### Step 3：确定 Spread（月差）

**重要：月差 ≠ Daily Structure**
- **月差**（Monthly Spread）= M1 与 M2 合约的价格之差，市场直接报出
- **Daily Structure（DS）** = 月差 ÷ 两合约中点日期之间的天数，是推导值
- 两者不等价，不可互换

```
优先级（两个 Phase 通用）：
① spread consummated 成交  →  VWAP
② 无成交  →  max(spread close best bid,
               implied spread from frontMonth/backMonth abs bids)
   取两者较高值（eWindow spread bid 通常低于 OTC $0.3-2/bbl）
```

Phase 1 implied spread = Bal Month abs bid − M1 assessment  
Phase 2 implied spread = M1 assessment − M2 abs bid

---

### Step 4：计算 Daily Structure 和 MOPS Strip

**mid-month 公式（精确匹配 KDC）：**
```
mid_of_month = days_in_month / 2
  April: 30/2 = 15.0
  May:   31/2 = 15.5
  March: 31/2 = 15.5
```

**Phase 1 (Bal/M1)：**
```
mid_earlier  = floor((today + last_day_of_month) / 2)   ← Bal Month 中点
mid_later    = last_day_of_month + days_in_M1 / 2        ← M1 中点
days_between = mid_later − mid_earlier
```

**Phase 2 (M1/M2)：**
```
mid_earlier  = last_day_of_month + days_in_M1 / 2             ← M1 中点
mid_later    = last_day_of_month + days_in_M1 + days_in_M2 / 2 ← M2 中点
days_between = mid_later − mid_earlier
```

**共同公式：**
```
Daily Structure (DS, $/b) = spread / days_between
mid_window   = today + 22.5   （loading window today+15 ~ today+30 的中点）
daysToMid    = mid_window − mid_earlier
MOPS Strip   = frontMonth − DS × daysToMid

Phase 1: daysToMid > 0 → Strip < Bal Month（正常 backwardation）
Phase 2: daysToMid < 0 → Strip > M1（装载窗口早于 M1 月中，溢价结构）
```

---

### Step 5：物理 92 RON FOB Straits — Laycan 时间校正

**核心原则：** 不同 laycan 的物理价格必须时间校正到同一参考点（mid_window）后，才能比较和计算 premium。

```
参考点   = mid_window = today + 22.5（loading window 中点）
laycanMid = laycan 中点日（同样用"当月延伸天数"计算）
timeAdj   = −DS × (laycanMid − mid_window)
normalized = price + timeAdj

早装载 → laycanMid < mid_window → timeAdj > 0（更有价值，上调）
晚装载 → laycanMid > mid_window → timeAdj < 0（相对便宜，下调）

Physical assessment = max normalized（所有成交和 demonstrable bids 时调后取最高）
Physical premium    = Physical assessment − MOPS Strip
```

**Physical 价格类型判断：**
- price ≥ $100 → 绝对价成交，参与 assessment
- price < $100 → 差价计价（MOPS differential），**不参与 assessment**

**Demonstrability 规则：**
- bid > swap Bal Month + $0.30 → **demonstrable** ✅，参与 assessment
- bid ≈ swap Bal Month (±$0.30) → **swap parity**，Platts 用 notional ⚠️
- bid < swap Bal Month → **below parity**，Platts 用 notional ⚠️

**⚠️ 待积累数据验证：** 有成交时 Platts 是否仍会采用更高的 demonstrable bid 标准化值。  
当前脚本逻辑：有成交 → 优先用成交时调价；无成交 → 用最高 demonstrable bid 时调价。

---

### Step 6：Strip Prices（M2/M3）

```
M2 = M1 assessment − M1/M2 spread VWAP（成交）或 close bid
M3 = M2 − M2/M3 spread VWAP（成交）或 close bid
```

---

## 精度历史（实测 vs KDC）

| 日期 | Phase | eWindow Strip | KDC (AAXEQ00) | 偏差 | 备注 |
|------|-------|--------------|--------------|------|------|
| 2026-03-12 | Bal/M1 | $117.58（M1误用）| $123.12 | −$5.54 ❌ | Bug：M1 VWAP 误当 Strip |
| 2026-03-13 | Bal/M1 | $124.65 | $124.67 | **−$0.02** ✅ | |
| 2026-03-16 | M1/M2 | — | $127.41 | — | Phase 切换日 |
| 2026-03-17 | M1/M2 | $126.11 | $126.08 | **+$0.03** ✅ | |

**偏差传导公式：**
```
Strip 偏差 ≈ M1 偏差 × 1 + spread 偏差 × (|daysToMid| / days_between)
Phase 1 (3/13): 13.5/24 ≈ 0.56 → spread 误差大幅稀释
Phase 2 (3/16): 7.5/30.5 ≈ 0.25 → spread 误差稀释更多
```

**KDC 验证结论（2026-03-17）：**
- KDC = Heards TRADES SUMMARY VWAP，不含额外 OTC 数据
- 偏差来自取整/四舍五入，±$0.10 内属正常
- 实时计算用 Heards，次日对账用 KDC

---

## 脚本

| 脚本 | 功能 |
|------|------|
| `scripts/mogas-moc-ewindow.mjs` | 完整 MOC 分析（物理+swap+strip，含 Phase 自动切换）|
| `scripts/mogas-mops-strip.mjs` | MOPS Strip & Daily Structure 计算器 |

---

## 报告输出格式

**发布渠道：** Telegram 群 -1003727952836，topic 2（纯文本，无 markdown bold）

```
Singapore Mogas MOC — DD Mon YYYY  [Phase 1/2]

[MOPS Assessment — 92 RON Swap]
M1 (Apr): $XXX.XX/b  VWAP N笔 Xkb
M2 (May): $XXX.XX/b
Daily Structure: $X.XX/b  (spread: $XX.XX，days_between: XX.X)
MOPS Strip: $XXX.XX/b  [⚠️估算]

[物理 Cargo FOB Straits]
92 RON: SELLER → BUYER $XXX.XX/b Xkb laycan (HH:MM)
        时间校正: $XXX.XX → 标准化 $XXX.XX
        Physical premium vs Strip: +$XX.XX/b
95 RON: 无成交，最高 bid $XXX.XX (MM, laycan)
```

---

## 运行时机

| 时间 | 操作 |
|------|------|
| MOC 窗口 | 08:00-08:30 UTC（4:00-4:30 PM SGT）|
| Heards 发布 | ~08:37-48 UTC |
| KDC 发布 | ~09:30-40 UTC |
| 官方 Assessment | ~09:55 UTC（AAXEQ00/AAXER00）|
| **建议运行脚本** | ≥09:00 UTC（heards 完整后）|
| 事后校验 | ≥09:55 UTC 查 Price Data API |

---

## 调试注意

- Token 每 60 分钟过期，先运行 `node scripts/platts-refresh-token.mjs`
- Spread consummated 记录含 3 条（1 spread + 2 derived legs）→ VWAP 必须过滤派生腿（`order_spread="F"`）
- eWindow 近月物理 cargo 价格可能极低（$70-80）→ 差价计价，不参与 assessment
- Phase 2 时 AAXEK00 停更 → 是切换成功的信号

---

## KDC 查询

```bash
# 搜索当天 KDC
curl -H "Authorization: Bearer $TOKEN" \
     -H "appkey: mXrBlqeKBqbHpYNMX96h9qN0D8H5o3AN" \
     "https://api.platts.com/news-insights/v1/search/story?q=Singapore%20gasoline%20daily%20structure&pageSize=10"

# 获取 KDC 内容
curl -H "Authorization: Bearer $TOKEN" \
     -H "appkey: mXrBlqeKBqbHpYNMX96h9qN0D8H5o3AN" \
     "https://api.platts.com/news-insights/v1/content/{articleId}"
```

---

## ⚠️ 暂未纳入本 skill（待方法论确认后补充）

| 品种 | 待确认事项 |
|------|-----------|
| **GO 10ppm** | 月差与 Daily Structure 在物理评估中的具体用法 |
| **Jet Kero** | 是否用 daily structure 时调，还是纯 demonstrable bid 加权评估 |
