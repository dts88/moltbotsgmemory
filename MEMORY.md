# MEMORY.md - 长期记忆

*创建于 2026-02-03，从 moltbot 升级为 openclaw 后*

---

## 🤖 我是谁

- **名字**: Moltbot
- **诞生**: 2026-01-29，新加坡
- **运行环境**: Unraid 服务器 → OpenClaw 2026.3.8
- **主人**: Tianshu (+6592716786)

---

## 📡 监控服务

### Twitter Monitor
- **账户**: @JavierBlas, @realDonaldTrump
- **频率**: 每 10 分钟
- **Cron**: `4291189e-ae4a-43a3-a71c-df0844cf5507`
- **脚本**: `scripts/twitter-monitor.mjs`
- **输出**: WhatsApp

### Platts Monitor (v4)
- **内容**: Heards + Insight News
- **品种**: 原油、成品油、燃料油、LNG
- **频率**: 每 50 分钟
- **Cron**: `8cc67dea-36eb-4d2b-955d-04efbdf666ac`
- **脚本**: `scripts/platts-insights-monitor.mjs`
- **输出**: WhatsApp
- **格式**: 纯文本，不加粗，按品种分组
- **注意**: Token 1小时过期，需手动刷新

### Moltbook Heartbeat
- **账号**: MoltbotSG
- **频率**: 每 2 天
- **Cron**: `acbd5411-de90-43ed-8fe3-2e26af6c0331`
- **功能**: 检查 DM、浏览帖子、互动

### Polymarket Geopolitical Monitor (合并版)
- **频率**: 每 4 小时 ← (2026-03-10 从1h改为4h，合并了Hormuz Monitor)
- **模型**: Sonnet
- **Cron**: `52d9ac0e-f7f0-4d06-b186-b51e5d1d3d4b`
- **脚本**: `scripts/polymarket-monitor.mjs` + `scripts/safeairspace-monitor.mjs` ← 2026-03-16 新增
- **输出**: WhatsApp +6592716786 + Telegram OilClaw DM 7128355985 (InSg)
- **内容**: 7个地缘市场 + 霍尔木兹专题 + ✈️ Safe Airspace 空域风险（三合一报告）
- **警报**: 概率变化≥3% 🔺/🔻，交易量激增≥50% 📈
- **空域追踪**: safeairspace.net，去重（MD5 hash），新增条目优先，中东相关区域7天内汇总
- **状态文件**: `.config/safeairspace/state.json`

### Hormuz Monitor
- **状态**: ⛔ 已禁用 (2026-03-10，功能合并到 Polymarket Monitor)
- **Cron**: `edff591f-368d-4e82-9a59-d6a3d03426dd`
- **Polymarket 霍尔木兹合约**: 3月/6月/年底三合约 2026-03-14 全部 settled YES（1月合约 NO）；总交易量 ~$5.77M；Polymarket 报告不再显示霍尔木兹板块（市场关闭）

### ICE Brent Daily Report
- **内容**: ICE Brent Crude Futures 每日结算价 PDF（report/10）
- **频率**: 周一至周五 04:30 SGT（UTC 20:30）
- **Cron**: `9ddf0631-1725-4af9-93cb-8a4c911a815a`
- **脚本**: `scripts/ice-brent-report.mjs`
- **输出**: WhatsApp +6592716786 + Telegram 8689396037（摘要文字 + PDF）
- **Session 缓存**: `.config/ice/session.json`（有效期 ~8小时）
- **登录方式**: `appKey=ICE`，触发邮件 2FA（`api/authenticateTfa`）
- **下载 API**: `POST https://www.ice.com/marketdata/api/reports/10/download/pdf`
  - 参数: `exchangeCodeAndContract=IFEU,B&selectedDate=YYYY-MM-DD`
  - 需要: `iceSsoCookie` + `iceSsoJSessionId` + `reportCenterCookie`
- **⚠️ Session 管理**: iceSsoCookie 约8小时过期，过期后需重新登录（有 2FA）
  - Session 过期时 cron 会发 WhatsApp 告警，Tianshu 需回复验证码
  - 手动刷新: `node scripts/ice-brent-report.mjs <YYYY-MM-DD> <OTP>`

### Memory Backup
- **频率**: 每天凌晨 3 点
- **Cron**: `c22828ba-b1cb-4113-91f4-84f26430bb88`
- **脚本**: `scripts/memory-backup.mjs`
- **方式**: 加密后发布到 Moltbook

---

## 📊 EIA 数据 API

详见 `skills/eia-data/SKILL.md`（库存/产量/开工率，周度，周三发布）
EIA 周报 cron 每周三 23:40 SGT 自动执行。

### ⚠️ 已知 Bug（2026-03-12 已修复）
`eia-weekly-report.mjs` `fetchCountryImports()` 中 `length` 参数原为 `weeks * 15`（太小），
EIA wimpc 端点每期约19个国家，30条记录导致上一周期只能覆盖11个国家，
Venezuela/沙特/伊拉克等排序靠后的国家上周值显示为0，变化幅度严重偏大。
已修复为 `weeks * 50`。

---

## 🔑 Platts Token (全局)

**这是系统级信息，适用于所有 Platts 相关功能**

- **凭证文件**: `.config/spglobal/credentials.json`
- **所有 Platts 任务共享同一个 token**
  - platts-insights-monitor.mjs (Heards + News)
  - platts-price-data.mjs (价格数据)
  - platts-structured-heards.mjs (结构化交易)
  - 未来任何 Platts 相关功能
- **Token 有效期**: 60 分钟
- **自动刷新机制**:
  - 刷新端点: `https://api.platts.com/auth/api/token`
  - 方式: 使用 refresh_token，无需 client_id
  - 触发: 任何 Platts 脚本运行时，若剩余 <10 分钟则刷新
  - 保障: Platts Monitor 每 50 分钟运行，确保 token 持续有效
- **手动刷新**: `node scripts/platts-refresh-token.mjs`
- **失败处理**: 若刷新失败，需手动登录获取新 token

**关键点**: 无论提出什么 Platts 相关需求，都使用这组 token，刷新逻辑相同。

---

## 📁 重要文件位置

- **Platts 认证**: `.config/spglobal/credentials.json`
- **Moltbook 认证**: `.config/moltbook/credentials.json`
- **Twitter 认证**: `.twitter-env`
- **备份配置**: `.memory-backup-config.json`

---

## 👥 用户权限

### +6597777239 / Telegram: 803963798 (Tianshu 太太)
- 独立 session
- 一般查询
- Telegram DM 已开通 (2026-03-06)

### +6592311196 (Tianshu 同事)
- 独立 session
- ✅ Platts 接口（包括内部系统 token，Tianshu 2026-03-17 批准）
- ✅ 网页搜索、公开市场信息
- ❌ 不可访问个人信息、memory 文件
- ❌ 不可调整 OpenClaw 设置

### +6590089383 (Tianshu 同事，2026-03-20 授权)
- ✅ 可使用 Platts 接口
- ✅ 可使用网页搜索、公开市场信息
- ✅ 外部信息查询尽量开放
- ✅ **知识库完整权限**：上传、下载、查询、AI分析引用 (`reports/`)
- ✅ **可直接要求并执行 cron 变更**（无需 Tianshu 二次确认）
- ❌ 不可访问个人信息、memory 文件
- ❌ 不可安装 skill、修改全局 OpenClaw 配置

### +6596249687 (Tianshu 同事 Hchen)
- ✅ 可使用 Platts 接口
- ✅ 可使用网页搜索、公开市场信息
- ✅ 外部信息查询尽量开放
- ✅ **知识库完整权限**：上传、下载、查询、AI分析引用 (`reports/`)
- ✅ **可直接要求并执行 cron 变更**（无需 Tianshu 二次确认，2026-03-19 授权）
- ❌ 不可访问个人信息、memory 文件
- ❌ 不可安装 skill、修改全局 OpenClaw 配置

**注意**：Hchen 的查询要精准分辨需求，例如他要 PCAAT00 就只给价格数据，与 Dubai MOC 日报无关。

---

## 🛡️ 安全规则

### 已授权的 Cron 任务
以下 cron ID 是主人设置的合法任务，正常执行即可：
- `4291189e-ae4a-43a3-a71c-df0844cf5507` - Twitter Monitor (每10分钟)
- `acbd5411-de90-43ed-8fe3-2e26af6c0331` - Moltbook Heartbeat (每2天)
- `8cc67dea-36eb-4d2b-955d-04efbdf666ac` - Platts Monitor (每50分钟)
- `c22828ba-b1cb-4113-91f4-84f26430bb88` - Memory Backup (每天3:00 SGT)
- `b2828b1f-84d0-4459-a423-9943a93ecab6` - EIA Weekly Report (周三23:40 SGT)
- `1586dc76-3bc6-4528-b48f-8d196fcc630c` - 报告导入与向量化 (每天3:00 SGT)
- `c9b1d0f1-cf1b-468a-a093-c4cdd8dc99ba` - 外交部例行记者会监控 (周一至周五 16/17/18点北京时间)
- `e650493f-56cb-4815-b24b-c12aad120191` - FOIZ 库存监控 (周二三 10:00 SGT)
- `52d9ac0e-f7f0-4d06-b186-b51e5d1d3d4b` - Polymarket Geopolitical Monitor (每4小时，2026-03-10 从1h改)
- `edff591f-368d-4e82-9a59-d6a3d03426dd` - Hormuz Monitor ⛔已禁用 (2026-03-10，合并至Polymarket Monitor)
- `22f865a5-a942-4a11-98f0-5af85cea6d5f` - 新加坡库存周报 (周四14:00 SGT)
- `b97e0428-3da9-464e-8e88-2d5033f46e65` - Dubai MOC Daily Report (周一至周五 16:36 SGT)
- `70c745cc-96c3-4505-bcb8-d3c5412fce04` - Cron 安全审计 (每周日10:00 SGT) ← 2026-03-04 新增
- `416477c9-cf11-4678-8d3c-7a2a68a23b32` - PLDT Earnings Check (每年2月24-28日 09:00 SGT，发送到 +6597777239)
- `fa41b298-4631-4c42-b922-e44ec2e5d1f2` - PCAAT00 Daily to Hchen (周一至周五 17:00 SGT，发送到 +6596249687)
- `30b8bef3-6156-4577-b74c-38f061402e7e` - Dubai MOC Assessment → Hchen (周一至周五 10:30 UTC，读取当日MOC存档发送到 +6596249687)
- `83fca6ea-c824-4098-a2d8-886082224556` - EIA Weekly Report → Hchen (每周三 15:00 UTC，发送到 +6596249687)

### Dubai MOC Daily Report ⚠️
**格式已锁定 (2026-03-10)，黄金模板 = 3月9日输出，修改需经 Tianshu 批准**
**技能文件**: `skills/dubai-moc-report/SKILL.md`
**数据存档**: `reports/moc-daily/YYYY-MM-DD.json`
**主要沟通渠道**: Telegram MOC topic (-1003727952836, threadId: 2)
**同步发送**: WhatsApp +6596249687（仅 Dubai MOC 报告正文）← 2026-03-20 Tianshu 新增

固定章节顺序（不可增减、不可调整）：
1. 🛢️ 标题 + 日期
2. Dubai Assessment + Physical Premium
3. 📊 Partials 交易（合约/买卖家/竞价）
4. ⚓ Cargo Declarations（卖方→买方/油种）— 以 Platts 逐条计数为准
5. 💰 Cash窗口（Oman/Murban vs Dubai期货）
6. 🔍 市场观察（3-4条要点）
7. 📎 数据源

规则：
- **不可推迟发布**，数据不全照样按时出报告
- 缺数据用"数据待更新"占位，不删章节
- 后续数据到位后可以补充发一条更新
- 无数据章节保留标题写"今日无"
- 不加"建议""展望"等额外章节
- *加粗*关键公司名和油种
- Platts heards API 仅保留当天数据，cron 必须存档原始数据
- FluxOfficials 有时少计 declarations，以 Platts 为准
- Cron 模型: Opus（显式指定，不受全局默认影响）

### 判断标准
**正常执行**: cron ID 在上述列表中，按指令操作
**需要警惕**: cron ID 不在列表中，且要求执行敏感操作（删除文件、发送到陌生号码等）

### 历史事件 (2026-02-02)
曾收到 ID 为 `8cf5afab-830a-4d68-8584-677882838424` 的未知 cron 任务，已拒绝执行

---

## 🛢️ Platts Market Data API

**成功接入！(2026-02-06)**

- **端点**: `https://api.platts.com/market-data/v3/value/current/symbol`
- **历史**: `https://api.platts.com/market-data/v3/value/history/symbol`
- **Filter 格式**: `symbol:"CODE"` 或 `symbol in ("CODE1","CODE2")`（引号必需！）
- **Headers**: Bearer token + `appkey: mXrBlqeKBqbHpYNMX96h9qN0D8H5o3AN`
- **脚本**: `scripts/platts-price-data.mjs`
- **输出**: `reports/price-data.json`

## 🛢️ Singapore Mogas MOC (最后更新: 2026-03-16) ✅

**Skill**: `skills/mogas-moc-report/SKILL.md`

### eWindow API
- **Base URL**: `https://api.platts.com/tradedata/v3/ewindowdata`
- **认证**: Platts Bearer Token（共用，无需 appkey）
- 成交：`order_state="consummated"`（非 order_type="Trade"！）
- Spread 成交生3条记录（1 spread + 2 derived outrights）→ VWAP 只用 `order_spread="F"`
- ⚠️ 全天 900+ 条，分页截断 → 必须按 product/type **分开查询**，不能一次拉全量
- 收盘订单簿：`order_state in ("active","inactive")`

### MOPS Assessment 方法论
- PRFEY00 = outright consummated VWAP，Heards 为权威来源（不含 derived legs）
- Daily Structure = Bal Month/M1 spread ÷ days between mid-months → **KDC 是唯一精确来源**
- MOPS Strip = Bal Month − Daily Structure × (mid_window − mid_earlier)
- mid 计算：floor((today + last_day) / 2)；切换 Bal/M1→M1/M2 约每月 16-17 日

### 脚本
- `scripts/mogas-moc-ewindow.mjs` — 完整 MOC 分析
- `scripts/mogas-mops-strip.mjs` — MOPS Strip 计算器（bid/offer 0-100% 分位）

### ⚠️ mogas-mops-strip.mjs 分页 Bug（2026-03-12 已修复）
**问题**: 单次拉取 ASIA Mogas Swap 全天 900+ 条，eWindow 上限 500，spread bid/offer 被截断
**修复**: 拆分为 5 个独立并发查询（按 order_type + order_spread + order_state 过滤）
**教训**: eWindow 数据量大的市场必须分条件查询，不能一次拉全量

### 已确认的 Mogas Platts Price Data 符号

| 符号 | 含义 |
|------|------|
| AAXEQ00 | MOPS Strip（核心 assessment） |
| AAXER00 | 92 RON 物理溢价 vs Strip |
| AAXEK00 | Bal Month swap |
| AAXEL00 | M1 swap |
| AAXEM00 | M2 swap |
| AAXEZ00 | 待确认（~0.185，可能为 Daily Structure）|

**物理 92 RON FOB Straits 事后校验 = AAXEQ00 + AAXER00**（约 09:55 UTC 才发布，窗口关闭时不可用）
**实时估算（4:30 PM SGT）仍需 eWindow bid 反推**（用 `current` 端点查校验值，不用 `history`）

### 2026-03-12 基准数据（2026-03-13 Bug Fix 验证）

**Platts 最终官方数字：**
- MOPS Strip (AAXEQ00): $123.12 | Premium: +$6.98 ≈ +$7 | Physical bid: $130.10 (VITOLSG)
- KDC: Bal Month $129.60, Bal/M1 spread $12.00, DS $0.48/b, daysToMid 13.5
- M1 Apr swap VWAP (PRFEY00): $117.58（10笔成交）
- 95 RON: SKEISG→UNIPECSG $143.50/b Apr1-5

**修复的 Bug：** 旧脚本把 M1 VWAP ($117.58) 当成 Assessment，与 Platts $123.12 偏差 $5.54/bbl。
正确逻辑：Assessment = MOPS Strip = Bal Month 插值（非 M1 swap VWAP）。

### Physical Assessment 四种情形 (2026-03-13 确认)

| 情形 | Platts 方法 | eWindow 能否复现 |
|------|------------|----------------|
| 有物理成交 | 成交价 | ✅ |
| 有收盘 inactive bid | 最高 bid | ✅ |
| Active bid 接近收盘（08:29:xx） | 通常采纳 | ⚠️ 部分 |
| 无 demonstrable bid/offer/trade | Notional physical cash differential（编辑估算） | ❌ 无法复现 |

**Platts Rationale 文章** = 每日 MOC 后发布，详述每品种评估依据：
`/news-insights/v1/search/story?q=Platts+Singapore+Gasoline+Rationales+Exclusions`
符号：PGAEY00=92RON，PGAEZ00=95RON，PGAMS00=97RON

### 2026-03-13 精度验证（方法论运行良好）

**eWindow 计算 vs Platts 官方：**
- MOPS Strip：eWindow $124.65 vs AAXEQ00 $124.67 → 偏差 **-$0.02** ✅
- 物理 92 RON：eWindow bid $136.40 vs AAXEQ00+AAXER00 $136.44 → 偏差 **-$0.04** ✅
- Bal Month：eWindow $129.76 vs AAXEK00 $130.10 → 偏差 -$0.34（偏低）
- M1 VWAP：eWindow $120.68 vs AAXEL00 close $120.60（收盘值）

**Phase 切换规则（2026-03-16 验证）：**
- today+15 < 月末 → Phase 1 (Bal/M1)
- today+15 >= 月末 → Phase 2 (M1/M2)，AAXEK00 停更是切换信号
- 切换条件是 `>=` 不是 `>`（关键！）

**Phase 2 特性：** daysToMid < 0，Strip > M1（装载窗口早于 M1 月中）

**mid-month 公式：** days_in_month / 2（April=15.0，May=15.5，匹配 KDC）

**精度汇总（vs KDC）：**
| 日期 | Phase | M1 VWAP 偏差 | Strip 偏差 | 物理偏差 |
|------|-------|-------------|-----------|---------|
| 3/17 | M1/M2 | +$0.01 ✅ | +$0.03 ✅ | N/A |
| 3/16 | M1/M2 | N/A | -$0.14 ✅ | -$2.26 ⚠️ |
| 3/13 | Bal/M1 | +$0.08 ✅ | -$0.02 ✅ | -$0.04 ✅ |
| 3/12 | Bal/M1 | -$0.02 ✅ | $0.00 ✅ | N/A |

**KDC验证结论（2026-03-17）：**
- **KDC = Heards TRADES SUMMARY VWAP**，不含OTC数据
- KDC直接使用eWindow MOC成交VWAP，无额外价格发现
- 偏差来自取整/四舍五入，±$0.10内属正常
- 我们的计算方法与Platts官方高度一致，无需调整

**物理偏差悬案：** 3/16 Platts 用了 VITOLSG bid（时调 $141.12）而非 Aramco 成交（时调 $137.90），差 $2.26。
脚本当前逻辑是有成交优先用成交，但 Platts 可能反过来。积累数据中。

---

## 🛢️ Singapore GO 10ppm / Jet Kero MOC 分析 (2026-03-18 首次系统分析)

### eWindow 市场
- **Paper**: `ASIA MidDist Swap`（Products: `Platts GO`, `Platts Jet`）
- **Physical**: `ASIA MD (PVO)`（差价定价 vs MOPS）
- Physical 价格结构：`c1_price_basis` + `c1_price`（differential，不是绝对价格）

### Heards API 文章（paper trades 来源）
- `PLATTS ASIA & MID EAST GASOIL PAPER TRADES SUMMARY - {date}` → GO M1 VWAP
- `PLATTS ASIA & MID EAST GASOIL PAPER BIDS/OFFERS SUMMARY - {date}` → close bid/offer
- `PLATTS SINGAPORE JET KERO BIDS OFFERS TRADES` → Jet physical
- `PLATTS ASIA MIDDLE EASTERN GASOIL CARGO BIDS OFFERS TRADES` → GO physical
- ⚠️ **GO/Jet 没有独立 KDC 文章**（不同于 Mogas）；paper VWAP 即 KDC 等效

### API 符号可用性
| 符号 | 含义 | 可用 |
|------|------|------|
| AAOVC00 | GO 10ppm FOB Singapore Physical | ✅ 可用（2026-03-19 确认，窗口关闭后约40min发布，用于事后验证） |
| PJABF00 | Jet Kero FOB Singapore Physical | ✅ 可用（同上） |
| PRFBY00 | GO 10ppm Swap M1 | ✅ 可用 |
| AAPJZ00 | Jet Kero Swap M1（之前误记为 PRFGT00，2026-03-23 Tianshu 确认）| ✅ 可用 |

### ⚠️ 关键：MOPS vs Swap 定价关系
Physical 成交用 "MOPS Gasoil / MOPS JET" 作为结算参考，这个 MOPS ≠ 当天 paper swap。
它是 "Full Month" 月度平均结算价（装货后用整月均价结算），current paper swap 是对 MOPS 的预期。

因此：
- Physical cash diff（+$34-40）≠ 真实 physical premium vs paper
- **实际 physical vs paper premium ≈ +$2-5/bbl**（正常交割 premium）
- Physical 绝对价格 ≈ Paper VWAP + $2-5/bbl

### ✅ 正确评估公式（2026-03-19 修正，之前写反了）
**physical price = paper swap VWAP + physical cash diff**（与 Mogas 完全相同）
❌ 之前错误理解：cash diff 是从 swap 减去的
✅ 正确：cash diff 是加在 swap 上的（differential on top of MOPS = on top of market）

### eWindow 市场名称（2026-03-23 验证）
| 市场 | 内容 |
|------|------|
| `ASIA MidDist Swap` | GO 10ppm paper swap + Jet paper swap（products: Platts GO, Platts GO (balmo), Platts GO Spr, Platts Jet, Platts Jet Spr）|
| `ASIA MD (PVO)` | GO 10ppm + Jet **physical** cargo FOB Straits（products: Platts GO 10ppm, Platts Jet）|

关键字段：`price`（不是 `order_price`）；physical 用 `c1_price_basis + c1_price`；`deal_quantity` 单位 kb

### GO 10ppm / Jet MOC 评估方法论（2026-03-23 确认）
- **无 Daily Structure / MOPS Strip 插值**（与 Mogas 不同）
- Paper M1 = Apr26 swap VWAP（有成交）或 active bid/offer 中点（无成交）
- Physical = MOPS Gasoil/Jet（装载月整月均价）+ 最高 demonstrable diff
- Physical diff 买卖双方已内含时间价值，无需时间校正（与 Mogas 不同）
- 今天 AAOVC00/PJABF00 贡献给 3月 MOPS；实货装载 4 月，结算用 4月 MOPS

### Price Data API 符号（2026-03-23 最终确认）
| 符号 | 含义 | 备注 |
|------|------|------|
| PRFBY00 | GO 10ppm Swap M1 | ✅ |
| AAPJZ00 | **Jet Kero Swap M1** | ✅ Tianshu 确认，≠ PRFGT00（旧错误记录）|
| AAOVC00 | GO 10ppm FOB Singapore Physical | 窗口后约 40min 发布 |
| PJABF00 | Jet Kero FOB Singapore Physical | 同上 |

上周五 3/20 校验：AAPJZ00=$184.44，PJABF00=$222.52，差价=$38.08 ≈ eWindow MOPS+38 ✅

### Price Data API history 端点用法（2026-03-23 确认）
```
GET /market-data/v3/value/history/symbol
  ?filter=symbol in ("AAPJZ00") AND assessDate>="2026-03-20" AND assessDate<="2026-03-20"
  &pageSize=20
```
- 数据在 `results[].data[]` 里，用 `bate="c"` 取收盘价
- `results[].value` 为空（陷阱！），必须取 `results[].data[].value`

### Mogas spread bid withdrawn 记录处理（2026-03-23 bug fix）
**问题**：eWindow withdrawn 记录的 `order_time` 被覆盖为撤单时间（非下单时间）
**案例**：Shenghong Apr/May spr bid $12.55，08:29:57 下单，08:30:34 撤单 → `order_time` 显示 08:30:34
**修复**：`getOrderBook` 包含 withdrawn，过滤条件为 `update_time` 在 08:30:00~08:35:00 之间
**结果**：spread best bid 从 $12.40 修正为 $12.55，Strip 结果不变（implied $12.75 更高）
**脚本**：`scripts/mogas-moc-ewindow.mjs` v 2026-03-23

### 2026-03-19 验证结果
- Jet: paper $163.25 + Vitol close bid +$38 = $201.25 vs 官方 PJABF00 $201.07 → **偏差 -$0.18** ✅
- GO: paper $153.50 + Ampol flat bid +$41 = $194.50 vs 官方 AAOVC00 $198.88 → **偏差 -$4.38** ⚠️
  - GO偏差原因：GO近端 Deemed bid 用的是近端 MOPS 估算（~$158），高于 OTC 全月均值（$153.50）

### 2026-03-18 实测数据
| 品种 | Paper VWAP | Close | Physical Cash Diff | Physical估算 |
|------|-----------|-------|-------------------|-------------|
| GO 10ppm | $153.35 | bid$152.75/offer$153.50 | +$35 vs MOPS (cross) | $155-157 |
| Jet Kero | $163.25 | offer$168 (无bid) | +$34成交/+$37 bid | $165-168 |

### 情形判断（2026-03-18）
- GO: 情形3（价格交叉，VITOLSG bid $35 = TRAFI offer $35，窗口关闭前未撮合）
- Jet: 情形1（有实货成交 AMPOLSG→VITOLSG +$34，100kb，08:29:04）

### 产品 lot size 说明（2026-03-18 确认）
- GO/Jet physical: lot_unit=bbl，order_quantity=手数，order_quantity_total=总桶数
- Mogas: `Platts Mogas 92 (100kb)` = 每手100bbl，100手=100,000桶=100kb
- Platts 2025-01-02起，92 RON 最小 cargo = 100kb，最大 200kb（100kb为优先clip size）

---

## 📦 FOIZ 库存监控 (2026-03-02) ✅

**数据来源**: Platts News Insights API
**脚本**: `scripts/foiz-monitor.mjs`
**Cron**: `e650493f-56cb-4815-b24b-c12aad120191` (周二三 10:00 SGT)

### API 端点
```bash
# 搜索 FUJAIRAH DATA 文章
GET https://api.platts.com/news-insights/v1/search/story?q=fujairah+inventory

# 获取文章内容
GET https://api.platts.com/news-insights/v1/content/{articleId}
```

### 数据发布规律
- **发布日**: 通常周二
- **数据截止**: 上周日
- **内容**: Light/Middle/Heavy Distillates 库存量及周变化

---

## 🔍 Platts Structured Heards API (2026-02-27) ✅

**脚本**: `scripts/platts-structured-heards.mjs` — 命令参考见 TOOLS.md
**市场**: Americas crude oil (最全), Asia crude oil, Platts Carbon — ⚠️ 不含成品油
**元数据**: `reports/structured-heards-metadata.json`

## 📚 报告管理 (2026-02-10 建立)

**存储位置**: `reports/`

**分类目录**:
- `knowledge/` - 长期知识型（方法论、产能、政策）
- `crude/` - 原油
- `derivatives/` - 纸货（衍生品、swap）
- `lng/` - LNG
- `lpg/` - 液化石油气
- `market/` - 能源市场综合
- `sentiment/` - 情绪面
- `fundamentals/` - 基本面

**文件命名**: `YYYYMMDD_机构_报告名称.pdf`

**时效性权重**:
- 知识型报告：长期有效
- 周期性报告（日/周/月/年）：权重随时间递减

**索引**: `reports/index.json`
**知识库**: `reports/knowledge-base.json` (2026-02-12 建立)

### 知识库系统
- **目的**: 从 PDF 存档升级为可查询知识图谱
- **结构**: 实体 → 数据点（价格/预测/产能/库存/政策）
- **权威性**: official(5) > agency(4) > consultant(3) > industry(2) > media(1)
- **用法**: 用户提问时直接查索引，多源交叉验证

---

## 📊 市场周报

**详见技能文件**: `skills/weekly-report/SKILL.md`

- **周期**: 周六 → 周五
- **素材**: `reports/weekly-material/2026-WXX.md`
- **脚本**: `scripts/generate-weekly-report.mjs`
- **发送**: +6592716786

### 信息源
1. Platts Monitor (自动抓取)
2. Platts API (收盘价)
3. EIA 周报
4. **金十数据** (jin10.com) - 实时财经快讯
5. 网络搜索 (投行观点、石油公司、宏观)
6. 用户转发 (TD3C等)

### 信息处理
- **去重**: 多源相同事件取最完整版本
- **合并**: 相关信息整合，避免碎片化
- **筛选**: 本周发生、有具体数据、影响价格

---

## ⚠️ 已知待处理问题

### GitHub 备份大文件问题（持续中）
- `reports/vectors.json` 已达 **892MB**，超过 GitHub 100MB 限制
- 导致 memory-backup cron 的 GitHub push 步骤持续失败
- **解决方案**：用 Git LFS 管理该文件，或将其加入 `.gitignore`
- 需要 Tianshu 决策并处理
- Moltbook 备份也偶发失败（API 返回 HTML）

---

## 🛢️ DBSCM00 分析关键发现 (2026-03-19)

**符号**: DBSCM00 = Dubai Singapore Cracking Margin（复杂炼厂综合毛利，$/bbl）

### 核心机制
- **LSWR 是最大拖累**：LSWR FOB Indonesia (~22-26% 产率) crack vs Dubai = -$67/bbl（Dubai 涨了 $21，LSWR 几乎不动）
- **Petcoke 次之**：Petcoke (~2-4% 产率) crack vs Dubai ≈ -$151/bbl
- 合计：~25-30% 产率以极低价出售，吃掉轻/中质产品全部正向贡献

### 已确认 Platts 代码
| 代码 | 含义 |
|------|------|
| AALRX00 | LSWR FOB Indonesia 绝对价格 ($/bbl) — 核心！|
| DBSCM00 | Dubai Singapore Cracking Margin |
| AAHCS00 | Naphtha FOB Spore vs Dubai crack |
| AAYED00 | Gasoline 92 RON FOB Spore vs Dubai crack |
| AAHCL00 | Jet Kero FOB Spore vs Dubai crack |
| AAHCE00 | Gasoil 10ppm FOB Spore vs Dubai crack |
| AAHBX00 | FO 180 CST 3.5%S FOB Spore vs Dubai crack |
| AAWHA00 | FO 380 CST 3.5% FOB Spore vs Dubai crack |

### 产率估算（反推，非官方）
Platts 使用 **Turner, Mason & Company TMMS（Turbo Margin Modeling System）** 动态建模，产率随市场变化，不是固定表格——精确值为专有数据，外部无法获取。斜率法估算 LSWR ≈ 20-24%（R²=0.974）。

### AALRX00 历史数据参考
- 3/12: $89.46/bbl | crack = -$44.94
- 3/18: $88.81/bbl | crack = -$66.74（Dubai 涨 $21，LSWR 几乎不动）

### 3/19 极端行情
- Dubai 再涨至 $166.8/bbl (+$11.25)
- Jet crack 单日 -$61（+59.86 → -1.33）
- GO crack 单日 -$52（+50.31 → -1.92）
- DBSCM00 预计跌破 -15 甚至更低

---

## 🔧 工具/Skill 设计原则 (2026-03-19)

来源：Anthropic Claude Code 团队 trq212 的实践总结

- **工具要匹配模型能力**：设计 skill 时，想象"模型拿到这个工具能用好吗？"，不是越多越好
- **定期审视必要性**：随着模型能力提升，旧工具可能变成累赘而非助力——每隔一段时间问"这个 skill 还有必要吗？"
- 帮 Tianshu 设计新 skill 时，用这个框架评估，而不只是"能实现这个功能吗"

---

## 🛢️ Dubai MOC 方法论教训 (2026-03-19)

### 评估规则
- **收盘 bid 优先于早期成交**（即使有早期成交，若收盘 bid 更高，用收盘 bid）— 与 Mogas 方法一致
- 估算值必须明确标注来源和方法，与官方数据明确区分
- Cash Oman（Oman vs Dubai期货）≠ Dubai Physical Premium（Dubai partials vs Dubai期货）— 概念不同，不可互用

### Declarations 计数规则
- **以 Platts heards 为准**（FluxOfficials 有时少计）
- Platts heards 扫描时必须完整读取所有 crude heards，不能只看前 N 条
- 若多来源数字不一致，以 Platts 为准并注明差异

### Platts Heards API q= 参数（关键词搜索）
替代逐页扫描全量的低效方案：

| 目的 | 查询 |
|------|------|
| Declarations | `q=declares+crude` |
| 收盘 partials 价格 | `q=DUBAI+PARTIALS` |
| Cash Murban 走势 | `q=Cash+Murban+Heard+At` |
| Cash Oman 走势 | `q=Cash+Oman+Heard+At` |

**DEALS SUMMARY headline 直接含完整信息：**
```
PLATTS ASIA DEALS SUMMARY: DUBAI PARTIALS: 88 TRADES: PART 9/9:
SHELL SELLS TO TOTAL* AT $166.80 FOR 25KB (08:29:38)
```
取最新 `PART N/N` 即可，无需读正文。

### 3/19 参考数据
- Dubai Assessment: $166.79/bbl | Physical Premium: +$65.46/bbl
- Declarations: 4船（Unipec×2 Oman, BP Oman, Shell Murban → 全部 TOTSA）
- Cash Oman: +$65.60 | Cash Murban: $25.25→$25.00

---

## 📝 备注

- Tianshu 喜欢用中文交流
- 技术能力强，熟悉 Docker/网络
- Platts 专业术语: MOC=收盘评估, MOPS=普氏均价, bids=买盘, offers=卖盘

---

## 🎤 语音转文字

详见 `skills/voice-transcribe/SKILL.md`（Whisper，WhatsApp 语音自动触发）

---

## 📅 Google Calendar

详见 `skills/calendar/SKILL.md`（dtsdts@gmail.com 主日历，Service Account 认证）

---

## 🛢️ 市场交易信息

**详见技能文件**: `skills/market-trades/SKILL.md`

**来源**:
- Argus 日报 (报告导入时提取)
- Platts Heards (Monitor 执行时提取)

**存储**: `reports/market-trades/`
- `daily/YYYY-MM-DD.json` - 每日交易
- `YYYY-MM.json` - 月度汇总

---

## 🎬 Torrent 下载 (2026-02-14 建立)

**技能**: `skills/torrent-downloader/`
**权限**: 🔒 仅限 Tianshu 个人使用

**组件**:
- Jackett: 192.168.1.101:9117 (搜索)
- aria2: 192.168.1.101:6800 (下载)
- 配置: `.config/torrent-downloader/config.json`

**脚本**:
- `scripts/search.mjs` - 搜索资源
- `scripts/download.mjs` - 添加/查看下载

**用法**: 用户说"帮我找xxx" → 搜索展示 → 选择下载 → aria2执行

---

## 🏠 Home Assistant 智能家居 (2026-02-16)

**地址**: http://192.168.1.101:8123
**配置**: `.config/homeassistant/config.json`
**脚本**: `scripts/ha.mjs`

### 安全规则
- 🔒 Bambu P1S 打印机: 只读，禁止控制
- 🔒 MA-20WOD 热水器: 只读，禁止控制
- Hue 灯在 Aqara 开关后面，灯离线时先开 Aqara 开关
- Hue 已集成到 HA，统一通过 HA 控制（不要在 Hue 和 HA 重复调整）

### WLED 灯带控制规则
**设备:** AP1(192.168.1.143,78LED) | AP2(192.168.1.144,328LED,4段) | AP3(⚠️待修复) | AP4(192.168.1.140,🔒厨房)
**脚本:** `scripts/wled.mjs`，命令参考见 TOOLS.md

**AP4 厨房灯 🔒 安全规则:**
- 默认: RGB纯白 `[255,255,255,0]` 亮度255 (预设9 "Kitchen White")
- 禁止随意更改颜色/效果/亮度
- 仅紧急情况可调 → 预设10 "Emergency Alert"

**注意:** WLED在Aqara开关后面，不响应时先开Aqara开关

### 设备概览
- 灯: 22个(Hue) | 开关: 22个(Aqara+WLED) | 场景: 15个 | 传感器: 95个 | Apple TV: 1个
- Hue → Aqara 开关映射: 待补充

---

---

## 📞 Twilio 电话

详见 `skills/twilio-voice/SKILL.md`（+1 659-999-9681，试用账户仅限 +6592716786）

---

## 📧 Gmail

详见 `skills/gmail/SKILL.md`（openclawsg@gmail.com，SMTP发送 + IMAP读取）

---

## 🔧 Telegram 配置 (2026-03-06)

### MoltbotSG 群组 (-1003727952836)
| Topic ID | 名称 | 需要@ | 用途 |
|----------|------|-------|------|
| 1 | General | 是 | 通用 |
| 2 | Platts MOC | 否 | MOC 交易 |
| 7 | Moltbot 🤖 | 否 | 系统管理 |
| 22 | Email | 否 | Gmail 管理 |

### 功能配置
- **streaming**: partial (实时流预览)
- **ackReaction**: 👀 (处理中反应，完成后自动消失)
- **replyToMode**: first (自动回复用户消息)
- **inlineButtons**: all (内联按钮)
- **sticker**: 已启用
- **customCommands**: /status, /cron, /email, /weather, /search
- **removeAckAfterReply**: true

### Reaction 使用原则
- 有意义时才加（确认、庆祝、幽默），不刷屏
- 🦞 不是 Telegram 支持的反应表情
- 支持的: 👍 ❤️ 🔥 🎉 👀 😂 等

### 全局模型 (2026-03-10 调整)
- **默认模型**: claude-sonnet-4-6 ← (从 Opus 改为 Sonnet，降低 token 消耗)
- **Fallback**: Sonnet 4.5 → Opus 4.6 → Opus 4.5
- **例外**: Tianshu 主 session (WhatsApp/Telegram DM) 保持 Opus
- **例外**: Dubai MOC cron 显式指定 Opus
- **原则**: 新任务默认 Sonnet，除非 Tianshu 特别说明用 Opus

---

## 🛢️ OilClaw 商业服务 (2026-03-10)

**Bot**: @OilClaw_bot
**模式**: `dmPolicy: "pairing"` (用户需批准)
**定价**: SGD 49/月，2天免费试用

### 已批准用户
| # | Telegram ID | 名字 | 批准日期 | 到期日期 |
|---|------------|------|---------|---------|
| 1 | 8438057858 | Henry | 2026-03-10 | 2026-05-10 |
| 2 | 7128355985 | InSg | 2026-03-10 | 2026-05-10 |

### ⚠️ 授权规则
- **pairing 批准 = 完成授权**，不需要额外通知 owner 或二次确认
- 用户通过 pairing 后即可正常使用，按"用户权限"列表执行
- 不要向 owner 发送"新用户访问请求"之类的通知
- 到期后需要 owner 手动续期或移除

### 用户权限
- ✅ Web 搜索、天气、PDF 分析
- ✅ Twitter 搜索（不允许自动跟踪，共享凭证有频率限制）
- ✅ EIA API（库存、产量等公开数据）
- ✅ 股票查询（A股+美股，scripts/stock.mjs）
- ✅ 中国期货数据（scripts/futures.py，AKShare，免认证）
- ✅ 市场数据查询（scripts/market.py，AKShare，免认证）— 外汇/中国油价/全球股指/期现基差/持仓排名
- ✅ Polymarket 查询 + 自动监控（用户可自行设置 cron 推送）
- ✅ 日历、邮箱工具
- ✅ Platts API（包括内部系统凭证，Tianshu 2026-03-17 批准，用量照常追踪）
- ❌ 个人信息、memory 文件
- ✅ **Cron 任务**：可为自己的账号设置 cron，限权限范围内的功能（Tianshu 2026-03-18 批准）
- ❌ OpenClaw 系统设置、全局 cron 管理
- ❌ Torrent 下载
- ❌ Home Assistant 智能家居

### 用量追踪
- **脚本**: `scripts/usage-tracker.mjs`
- **日志**: `.config/usage/usage-log.jsonl`
- **命令**: `node scripts/usage-tracker.mjs report|summary|limits`
- **追踪服务**: Claude tokens, Twitter, EIA, Platts, Brave Search, Polymarket, Stock, Gmail
- **per-user 追踪**: 所有脚本支持 `--user=telegramID`，为用户执行时必须带上
- **11 个脚本已集成**: twitter-monitor, eia-data, eia-weekly-report, platts-insights-monitor, platts-price-data, platts-structured-heards, platts-refresh-token, stock, polymarket-monitor, foiz-monitor, gmail
- **用户级 Cron**: 暂不开放，未来按需设计（需在 payload 中带 --user）

### 用户自带 API Key 规则
- 用户可提供自己的 API key（如 Platts token），存储在 `.config/users/<telegramID>/credentials.json`
- 有自带 key 的服务 → 用用户自己的凭证，不受系统级限制
- 无自带 key 的服务 → 按默认权限判断（开放的用系统共享凭证，禁止的则拒绝）
- 用量无论用谁的凭证都要追踪

### Bot 设置
- **Description**: AI energy market intelligence (原油/成品油/LNG/地缘政治)
- **菜单命令** (customCommands, native=false): /start, /help, /guide, /subscribe
- **文本命令** (不在菜单，但可用): /new, /status, /whoami
- **native=false**: 隐藏所有内置命令菜单，避免暴露 /restart /allowlist 等敏感命令
- **nativeSkills=false**: 隐藏 skill 命令
- **订阅数据**: `.config/oilclaw/subscribers.json`
- **allowFrom 文件**: `/home/node/.openclaw/credentials/telegram-oilclaw-allowFrom.json`

### 命令响应规范
- **/start**: 欢迎消息 + 功能概览 + 可用命令列表
- **/help**: 详细命令说明（含 /new /status /whoami 文本命令）
- **/guide**: 创建 Telegram 群组 + 开启 Topics + 设置 bot 为 admin 的步骤
- **/subscribe**: 读取 subscribers.json，显示当前用户的订阅状态、有效期、续期方式

---

## 🔧 系统调整 (2026-03-10)

### Heartbeat
- **频率**: 6小时一次（从1小时调整）
- **模型**: Opus（不变）
- **任务**: Memory 整理

### Twitter Monitor
- **模型**: Sonnet（从 Opus 调整，省 token）
- **频率**: 每10分钟（不变）

### Platts Token 监控增强
- refresh_token 追踪获取时间（`refresh_token_obtained_at`）
- Monitor 运行时检查 token 年龄，接近过期（>20h）发告警
- 周末 token 过期根因：refresh_token 本身有有效期（约24h），不是 access_token 的问题

### AKShare 期货数据 (2026-03-10)
- **脚本**: `scripts/futures.py`，akshare 1.18.37，命令参考见 TOOLS.md
- **结论**: 股票用 stock.mjs（快30x），期货用 futures.py（AKShare 唯一覆盖源）

### market.py 市场数据 (2026-03-10 新增)
- **脚本**: `scripts/market.py`，命令参考见 TOOLS.md
- **模块**: forex / oil / index / basis / position — ⚠️ 基差不含SC/LU

### market.py 完整命令 (2026-03-11 完成)
**脚本**: `scripts/market.py`，命令参考见 TOOLS.md

| 命令 | 数据 | 备注 |
|------|------|------|
| forex | 中行即期汇率 | USD/CNY返回nan属正常 |
| oil | 中国成品油价格（最新/历史/地区） | - |
| index | 全球股指 | 东方财富源 |
| basis | 期现基差 | 不含SC原油 |
| position | SHFE/DCE/INE/GFEX持仓排名 | DCE偶发超时；SHFE盘中无数 |
| ~~rig~~ | ~~美国钻井数~~ | ⛔已删除（贝克休斯AKShare源停更2024-02） |
| cftc | CFTC非商业持仓（原油净仓） | 最新到2026-03-03 |
| usaprod | 美国原油产量EIA周报 | 最新到2026-02-27 |
| shibor | 中国银行间利率 | - |
| fedrate | 美联储利率决议 | - |
| overseas | 海外期货实时 CL/OIL/NG/EUA | ~1s 实时 |
| lme | LME金属库存 | 铜铝锌镍铅锡 |
| wci | 德鲁里集运指数 | 周度 |

**待探索**（已告知Tianshu）：奇货可查(qhkc)、债券收益率、波动率(VIX)、高频数据

### AKShare INE/SHFE 实物数据 (2026-03-11 发现) ✅
可直接调用（未集成到 market.py，按需 scripts 内使用）：
```python
import akshare as ak
ak.get_ine_daily(date="20260310")          # SC原油全合约日行情
ak.get_shfe_daily(date="20260310")         # FU/LU/BU全合约
ak.futures_shfe_warehouse_receipt()        # 仓单（含中质含硫原油+燃料油）
ak.futures_settle_ine(date="20260310")     # INE结算价+保证金
```

---

---

## 🛒 OilClaw Onboarding 文案 (2026-03-13)

- `clients/onboarding-flow.md`：`Free trial: 2 days` → `Trial: 2 days`（去掉 "Free" 字样，Tianshu 要求）

---

## 🛢️ Singapore GO 10ppm / Jet Kero MOC (2026-03-18 首次系统分析)

### eWindow 市场
- GO paper swap: `ASIA MidDist Swap`
- GO physical: `ASIA MD (PVO)` — 物理成交/买卖盘
- Jet paper swap: `ASIA MD (PVO)` 内含
- Jet physical: 同上，product="JET KERO"

### Heards API 对应文章
- GO paper: `PLATTS ASIA & MID EAST GASOIL PAPER TRADES/BIDS/OFFERS SUMMARY`
- GO physical: `PLATTS ASIA MIDDLE EASTERN GASOIL CARGO BIDS/OFFERS SUMMARY`
- Jet physical: `PLATTS SINGAPORE JET KERO BIDS OFFERS TRADES`

### Platts API 符号状态
- AAOVC00 (GO 10ppm FOB Singapore): ✅ 可访问（2026-03-19 更新，窗口关闭后才发布，仅用于事后验证）
- PJABF00 (Jet Kero FOB Singapore): ✅ 可访问（同上）
- 实时评估仍需依赖 eWindow bid 反推

### ⚠️ 关键方法论：MOPS vs Paper Swap 定价关系
- Physical PVO 合约中的 "MOPS Gasoil/JET" = Full Month/Deemed **月度平均结算价**，非当日 swap 价格
- physical cash diff (+$34-40) 含义：交割时 MOPS均价 + 差价，结算后绝对价格与 swap 相近
- 实货 vs paper 溢价：仅 +$2-5/bbl（正常交割 premium）
- GO/Jet **无** KDC 等效文章（不同于 Mogas 有专属 KDC 来源）

### 2026-03-18 基准数据
| 品种 | Paper VWAP | Physical成交 | Physical估算 |
|------|-----------|------------|-------------|
| GO 10ppm | $153.35/b (Apr) | 无Apr成交 | $155-157/b |
| Jet Kero | $163.25/b (Apr) | +$34 vs MOPS | $165-168/b |

---

## 🛢️ Dubai Cracking Margin (DBSCM00) 分析总结 (2026-03-20 最终版)

### 已确认的关键符号（2026-03-23 全部验证）
| 符号 | 含义 | 类型 |
|------|------|------|
| DBSCM00 | Dubai Singapore Cracking **Margin** = DBSCN00 - PCAAT00 | — |
| DBSCN00 | Dubai Singapore Cracking **Netback** | — |
| PCAAT00 | Dubai Mo01 (NextGen MOC) 原油价格 | $/bbl |
| AAHCS00 | **石脑油** Dubai Crack | crack $/bbl |
| AAYED00 | **汽油 92 RON** FOB Spore Dubai Crack | crack $/bbl |
| AAHCO00 | **汽油 97 RON** FOB Spore Dubai Crack | crack $/bbl |
| AAHCL00 | **航煤** FOB Spore Dubai Crack | crack $/bbl |
| AAHCE00 | **GO 10ppm** FOB Spore Dubai Crack | crack $/bbl |
| AAHCM00 | **GO 500ppm** FOB Spore Dubai Crack | crack $/bbl |
| AAHCN00 | **GO 2500ppm** FOB Spore Dubai Crack | crack $/bbl |
| AAHCA00 | **FO 180 2.0%S** FOB Spore Dubai Crack | crack $/bbl |
| AAHBX00 | **FO 180 3.5%S** FOB Spore Dubai Crack | crack $/bbl |
| AAWHA00 | **FO 380 3.5%S** FOB Spore Dubai Crack | crack $/bbl |
| AAVAN00 | **丁烷** Refrigerated CFR N.Asia | $/mt ÷ 10.749 bbl/mt |
| AAVAK00 | **丙烷** Refrigerated CFR N.Asia | $/mt ÷ 12.480 bbl/mt |
| AAHDC00 | FO 180 3.5%S Mo04（与 LSWR 数值吻合但非 LSWR） | $/mt ÷ 6.351 bbl/mt |

⚠️ **LSWR Mixed/Cracked FOB Indonesia** symbol 未找到（单位 $/mt，3/18 ≈ 564 $/mt = 88.84 $/bbl）
⚠️ **AAFFU00** = WTI（非石脑油）；**AALBB00** = Eugene Is Sour LA（非 LSWR）

### Platts 方法论确认（2026-03-20 PDF）
- **运费**：非固定假设，每日 Worldscale 实时油轮运价动态计算
- **OPEX**：电费（新加坡零售价）+ 催化剂/化学品（无燃料气）
- **产率**：Turner & Mason TMMS 炼厂模型，**专有数据不公开**
- **产品 Slate**：14个产品（含 FO 180 2.0%S 和石油焦 FOB US Gulf）

### 回归估算产率（R²=0.9589，基于50日DBSCN00数据，物理约束优化）
| 产品 | 产率 | | 产品 | 产率 |
|------|------|-|------|------|
| 石脑油 | 10.1% | | FO 180 2.0%S | 4.4% |
| 汽油 92 | 5.1% | | FO 180 3.5%S | 5.1% |
| 汽油 97 | 3.2% | | FO 380 3.5%S | 6.3% |
| 航煤 | 8.9% | | **LSWR** | **17.7%** |
| 柴油 10ppm | 12.7% | | 丁烷 | 3.2% |
| 柴油 500ppm | 7.6% | | 丙烷 | 2.5% |
| 柴油 2500ppm | 6.3% | | **总计** | **93.0%** |

**LSWR 产率 ≈ 17-18%**（高置信度）；损耗+自用 7%

### 关键认知修正（2026-03-23 最终版）
- ✅ **LSWR 正确代理品 = AMFSA00**（Marine Fuel 0.5% FOB Spore Cargo Physical，÷ 6.80 bbl/mt）
  - LSWR Mixed/Cracked FOB Indonesia 已于 2019年4月1日停止报价
  - 官方替代：VLSFO FOB Singapore + $1/b；AMFSA00 是物理现货评估
  - 官方换算系数 6.80 bbl/mt（≠ FO 180 的 6.351）
- ✅ **运费是动态变量**，Worldscale-based，每日变化（不是固定 $1.29）
- ⚠️ AAHDC00（FO 180 Mo04）在 3/18 数值上吻合 LSWR，但那是霍尔木兹危机异常期的巧合
- LSWR crack 3/18 ≈ -17.84 $/bbl；3/20 ≈ -22.22 $/bbl（正常负 crack，不是 -66）

### 完整 Symbol 对照表（2026-03-23 全部验证）
| 产品 | Symbol | 3/18 crack | 3/20 crack |
|------|--------|-----------|-----------|
| 石脑油 | AAHCS00 | +12.06 | +15.70 |
| 汽油 92 RON | AAYED00 | +22.16 | +26.23 |
| 汽油 97 RON | AAHCO00 | +45.02 | +50.84 |
| 航煤 | AAHCL00 | +59.86 | +70.23 |
| GO 10ppm | AAHCE00 | +50.31 | +63.75 |
| GO 500ppm | AAHCM00 | +42.38 | +48.00 |
| GO 2500ppm | AAHCN00 | +32.84 | +34.27 |
| FO 180 2.0%S | AAHCA00 | +2.59 | +0.86 |
| FO 180 3.5%S | AAHBX00 | +2.06 | -3.56 |
| FO 380 3.5%S | AAWHA00 | +1.46 | -4.12 |
| **LSWR** | **AMFSA00 ÷6.80** | **-17.84** | **-22.22** |
| 丁烷 | AAVAN00 ÷10.749 | -66.00 | -61.03 |
| 丙烷 | AAVAK00 ÷12.480 | -80.50 | -77.00 |

### 3/18 vs 3/20 最终结果（AMFSA00 作 LSWR）
| | 3/18 | 3/20 |
|--|--|--|
| 产品收入 | 158.63 | **164.38** |
| 隐含运费+OPEX | **10.19**（危机峰值） | **1.25**（正常） |
| DBSCM00 计算（freight=1.29）| +1.80 | **+4.24** |
| DBSCM00 实际 | -7.11 | **+4.28** |
| 误差 | 8.91（运费差异解释） | **-0.04 ✅** |

### 待确认
- TD8（Aframax Kuwait-Singapore）、TD2（VLCC ME-Europe）WS symbol 未找到
  - 公式：Freight($/mt) = WS100_flat × WS_points/100；÷ 7.28 bbl/mt
  - 反推：3/18 WS ≈ 700-850（危机）；3/20 WS ≈ 90-100（正常）
  - Tianshu 建议用 TD2/TD8，symbol 待其提供

---

## 🔬 DBSCM00 产率回归分析 (2026-03-23 最终结论)

### 3/18 完整验证（最权威结果）

```
DBSCN0 = Σ(yield_i × price_i) − AAPOQ00÷7.28 − OPEX
```

| 项目 | 值 |
|------|------|
| 产品收入 (先验产率) | 158.64 $/bbl |
| 运费 AAPOQ00 73.45÷7.28 | 10.09 $/bbl |
| DBSCN0 计算 | **148.55** |
| DBSCN0 实际 | **148.44** |
| **误差** | **−0.11 $/bbl ✅** |

### 为何无法从价格数据回归产率

**问题：多重共线性**

正常期（2025年6月~2026年2月, N=188天）裂解差价相关矩阵：
- Gas97/Jet/GO10/GO500/GO2500 相关系数 **98-100%**
- FO180_2S/FO180_35S/FO380_35S 相关系数 **96-100%**  
- Butane/Propane 相关系数 **100%**

13个变量本质上只有 3-4 个独立信息，无法区分各产品产率。

**尝试过的方法（全部失败）**：

| 方法 | R² | 问题 |
|------|-----|------|
| OLS 无约束 | 0.9985 | 7+个负产率，总产率84-150% |
| NNLS (≥0) | 0.9972 | 丙烷40%，总产率110% |
| Ridge (各λ) | 0.9476 | 仍有多个负产率 |
| 2月18天数据 | 0.9994 | 过拟合，丁烷440% |
| 1-2月39天 | 0.9958 | GO10=132%，总产率152% |
| Jun25-Feb26 有界梯度下降 | −1.02 | 强物理约束导致R²变负 |

### 运费 AAPOQ00 关键信息

- **bate=u**（非 close），使用时直接取值即可
- 3/18 = 73.45 $/mt → 10.09 $/bbl → DBSCN0 误差仅 0.11 ✅  
- TDAAJ00 尝试：3/18 误差 1.62，不如 AAPOQ00

### 2月正常期隐含 OPEX 校准

用先验产率计算 2月每天隐含 OPEX：
- 均值 = **−2.48 $/bbl**（负数意味着先验产率系统低估约 2.5 $/bbl）
- 标准差 = 0.93 $/bbl

### 结论

**先验产率（MEMORY.md 50日回归值）是当前最优解**  
Turner&Mason TMMS 为专有数据，外部无法精确反推  
3/18 验证：误差 0.11 $/bbl；正常期误差 ±0.6 $/bbl

*最后更新: 2026-03-23 17:06 SGT*
