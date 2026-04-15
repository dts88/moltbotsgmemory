---
name: dubai-moc-report
description: 生成 Dubai MOC (Market on Close) 每日报告。从 Platts News Insights API 和 @FluxOfficials 推文获取数据，按固定格式生成报告。触发词：MOC报告、Dubai MOC、MOC日报、partials、declarations、Cash Murban/Oman。用于 cron 自动执行或手动生成。
---

# Dubai MOC Daily Report

## 数据源

### 0. eWindow API (Partials 卖盘/成交，首选)

eWindow API 支持直接 filter，**Partials 的 offer range、成交、最后1分钟竞价全部从这里取，不走 heards**。

```bash
# 全天 Offers 统计（各家次数 + 最低价）
node --input-type=module << 'EOF'
import { readFileSync } from 'fs';
const creds = JSON.parse(readFileSync('.config/spglobal/credentials.json', 'utf8'));
const token = creds.access_token;
const today = new Date().toISOString().slice(0,10);

async function fetchAll(extraFilter) {
  let page = 1, rows = [];
  while (true) {
    const url = new URL('https://api.platts.com/tradedata/v3/ewindowdata');
    url.searchParams.set('filter', `market in ("ASIA Crude Partial") AND order_date>="${today}"${extraFilter}`);
    url.searchParams.set('pageSize', '500');
    url.searchParams.set('page', page);
    url.searchParams.set('sort', 'order_time:asc');
    const d = await fetch(url, { headers: { Authorization: 'Bearer ' + token } }).then(r => r.json());
    if (d.error) { console.error(d.error, d.cause); break; }
    rows.push(...(d.results || []));
    if (page >= (d.metadata?.total_pages || 1)) break;
    page++;
  }
  return rows;
}

// 全天 offers
const offers = await fetchAll(' AND order_type="Offer"');
const byCompany = {};
for (const r of offers) {
  const mm = r.market_maker_mnemonic || '?';
  if (!byCompany[mm]) byCompany[mm] = { count: 0, prices: [] };
  byCompany[mm].count++;
  byCompany[mm].prices.push(r.price);
}
console.log('=== All-day Offers ===');
for (const [mm, d] of Object.entries(byCompany).sort((a,b) => b[1].count - a[1].count)) {
  console.log(`${mm}: ${d.count}次 | min $${Math.min(...d.prices)} | max $${Math.max(...d.prices)}`);
}

// 最后1分钟 offers（MOC 08:29~08:30 GMT）
const lastMin = offers.filter(r => r.order_time >= `${today}T08:29:00` && r.order_time < `${today}T08:30:00`);
const byLast = {};
for (const r of lastMin) {
  const mm = r.market_maker_mnemonic || '?';
  if (!byLast[mm]) byLast[mm] = { count: 0, prices: [] };
  byLast[mm].count++;
  byLast[mm].prices.push(r.price);
}
console.log('\n=== Last-minute Offers (08:29 GMT) ===');
for (const [mm, d] of Object.entries(byLast).sort((a,b) => b[1].count - a[1].count)) {
  const prices = d.prices;
  console.log(`${mm}: ${d.count}次 | min $${Math.min(...prices)} | last $${prices[prices.length-1]}`);
}

// 成交
const trades = await fetchAll(' AND order_state="consummated"');
console.log('\n=== Trades ===');
if (!trades.length) console.log('无成交');
for (const r of trades) {
  console.log(`${r.seller_mnemonic||r.market_maker_mnemonic} → ${r.buyer_mnemonic||r.counterparty_mnemonic}: $${r.price} @ ${r.order_time?.slice(11,19)} GMT`);
}
EOF
```

**可过滤字段**（已验证）：`market`、`order_date`、`order_time`、`order_type`、`order_state`、`order_spread`
**不可过滤**：`trade_date`（用 `order_date` 替代）

**Partials 报告用法**：
- 成交价 → `order_state="consummated"` 里的 price
- 收盘 offer range → 最后1分钟（08:29 GMT）各家最低 offer
- 全天最低 offer → 全天 `order_type="Offer"` 的 min price

### 1. Platts News Insights API (Heards)
```bash
# ✅ 推荐：4个精确 q= 查询，替代全量 heards 翻页扫描
cd /home/node/clawd && node -e "
const { readFileSync } = require('fs');
const creds = JSON.parse(readFileSync('.config/spglobal/credentials.json', 'utf8'));
const token = creds.access_token;
const today = new Date().toISOString().slice(0,10);
const get = q => fetch('https://api.platts.com/news-insights/v1/search/heards?pageSize=50&q=' + q,
  { headers: { 'Authorization': 'Bearer ' + token } }).then(r=>r.json())
  .then(d => (d.results||[]).filter(i=>(i.updatedDate||'').startsWith(today))
    .sort((a,b)=>new Date(a.updatedDate)-new Date(b.updatedDate)));

Promise.all([
  get('declares+crude'),                  // 1. 每条 = 1船 declaration
  get('DUBAI+PARTIALS'),                  // 2. 分块成交汇总，headline含价格/卖方/买方/时间
  get('Cash+Murban+Heard+At'),            // 3. Cash Murban 走势
  get('Cash+Oman+Heard+At'),             // 4. Cash Oman 走势
]).then(([decl, deals, murban, oman]) => {
  console.log('=== DECLARATIONS ===');
  decl.forEach(i => console.log(i.updatedDate + ' | ' + i.headline));
  console.log('=== DEALS SUMMARY (latest) ===');
  deals.slice(-1).forEach(i => console.log(i.updatedDate + ' | ' + i.headline));
  console.log('=== CASH MURBAN ===');
  murban.forEach(i => console.log(i.updatedDate + ' | ' + i.headline));
  console.log('=== CASH OMAN ===');
  oman.forEach(i => console.log(i.updatedDate + ' | ' + i.headline));
});
"
```

**关键：DEALS SUMMARY headline 直接包含 convergence 价格**
```
PLATTS ASIA DEALS SUMMARY: DUBAI PARTIALS: 88 TRADES: PART 9/9:
SHELL SELLS TO TOTAL* AT $166.80 FOR 25KB (08:29:38)
```
→ 不需要读正文，从 headline 即可解析出：价格($166.80)、卖方(Shell)、买方(Total)、手数(25KB)

⚠️ **注意**：
- `q=declares+crude` 不要加买方名（买方每月不同，本月 TotalEnergies 只是恰好）
- DEALS SUMMARY 分多 PART 发布，取最新的 `PART N/N`（总部分最后一条）即含最终 convergence 信息

⚠️ **API 数据保留窗口仅当天** — 过了次日就查不到，必须在 cron 执行时存档原始数据。

关键 headline 模式：
- `declares a cargo of May {油种} crude to {买方}` → Declarations
- `Cash Murban Heard At` → Cash Murban 价格
- `Cash Oman Heard At` → Cash Oman 价格 (有时不发布，如 Oman partials 无成交时)
- `executed in error` → 错误交易
- `Mideast Sour Crude Convergences` → 汇总所有 declarations
- `DEALS SUMMARY: DUBAI PARTIALS` → 完整成交记录
- `CRUDE MARKETS: FINALS ON CLOSE` → 收盘买卖盘

获取文章正文（提取错误交易详情等）：
```bash
node -e "
const { readFileSync } = require('fs');
const creds = JSON.parse(readFileSync('.config/spglobal/credentials.json', 'utf8'));
fetch('https://api.platts.com/news-insights/v1/content/{articleId}', {
  headers: { 'Authorization': 'Bearer ' + creds.access_token, 'appkey': 'mXrBlqeKBqbHpYNMX96h9qN0D8H5o3AN' }
}).then(r => r.json()).then(data => {
  const body = data?.envelope?.content?.body || '';
  console.log(body.replace(/<[^>]+>/g, '').trim());
}).catch(e => console.error(e.message));
"
```

### 2. @FluxOfficials 推文
```bash
cd /home/node/clawd && export $(grep -v '^#' .twitter-env | xargs) && npx bird user-tweets @FluxOfficials -n 5 --json --plain
```

关键字段：
- `Dubai Assessment: $XXX.XX/bbl`
- `Physical premium: $XX.XX/bbl`
- `convergences` — 数量和参与方

⚠️ FluxOfficials 有时少计 declarations，以 Platts API 逐条计数为准。

## 数据提取规则

### Declarations 计数
**首选**：`q=declares+crude` 精确搜索，筛选今日日期，每条 headline = 1船，按时间排序。
- 买方每月不同，不要在 q= 中写死买方名称
- 同一卖方可能多条（如 Unipec 今日2船）
- 不依赖 FluxOfficials 的汇总数字（FluxOfficials 有时少计）

**收盘后校验**：`Mideast Sour Crude Convergences` 聚合文章（窗口关闭约40分钟后发布），星号数 = 船数，可做完整性核对。

### Cash 窗口
- 从 heards 中提取所有 `Cash Murban Heard At` 和 `Cash Oman Heard At`
- 按时间排序，显示走势（如 +$20.17 → +$20.20 → +$20.00）
- 如当天某品种无数据，写"数据待更新"

### 错误交易
- `executed in error` + `agreed to unwind` = 已撤销
- `executed in error` + `confirmed the trade stands` = 交易有效
- `being informed` = 审查中
- 需获取文章正文确认具体状态

### 收盘买卖盘
- `ME SOUR CRUDE BIDS: FINALS ON CLOSE` → 收盘买盘
- `ME SOUR CRUDE OFFERS: FINALS ON CLOSE` → 收盘卖盘
- 提取参与公司、价格、手数

## 数据存档

Cron 执行时将原始数据保存到 `reports/moc-daily/YYYY-MM-DD.json`：
```json
{
  "date": "2026-03-10",
  "fluxOfficials": { "assessment": 115.20, "premium": 33.41, "text": "..." },
  "declarations": [ { "seller": "Vitol", "buyer": "TOTSA", "grade": "Murban", "time": "08:35:25Z" } ],
  "cashMurban": [ { "value": 20.17, "time": "08:40:13Z" } ],
  "cashOman": [ { "value": 28.70, "time": "08:33:12Z" } ],
  "errorTrades": [ { "seller": "P66", "buyer": "Mercuria", "price": 111.00, "status": "unwound" } ],
  "finalsOnClose": { "bids": "...", "offers": "..." }
}
```

## 报告格式 (严格锁定 ⚠️)

**禁止修改格式结构、禁止增减章节、禁止调整顺序。修改需经 Tianshu 批准。**
**黄金模板: 3月9日输出**

```
🛢️ *Dubai MOC Daily Report — {DD Mon YYYY}*

*Dubai Assessment:* ${价格}/bbl
*Physical Premium:* ${溢价}/bbl

📊 *Partials 交易*
合约: {合约月}Dubai Partials @ ${价格}/bbl × {手数}kb
唯一买家: *{买家名}*
卖家: {卖家列表}
{其他竞价信息，如 Mercuria 在 $124.70 竞价但未成交}

⚓ *Cargo Declarations ({N}船)*
• *{卖方}* → *{买方}*: {数量}船 {月份} *{油种}*
• *{卖方}* → *{买方}*: {数量}船 {月份} *{油种}*
• ...
(均为20手partials convergence触发)

💰 *Cash窗口*
• {月份} Cash Oman: +${价格}/bbl vs {月份} Dubai期货
• {月份} Cash Murban: +${价格1} → +${价格2}/bbl vs {月份} Dubai期货

🔍 *市场观察*
• {观察1}
• {观察2}
• {观察3}
• {观察4}

📎 数据源: Platts MOC + @FluxOfficials
```

### 格式规则
- **不可推迟发布**，数据不全照样按时出报告
- 缺数据用"数据待更新"占位，不删章节
- 后续数据到位后可补发一条更新
- 无数据章节保留标题写"今日无"
- 不添加模板外章节（如"建议""展望""特殊情况说明"等）
- *加粗*关键公司名和油种
- Declarations 按 Platts 时间顺序排列
- 同一卖方多船合并显示（如 *Vitol* → *TOTSA*: 2船）
- 油轮运费须注明船型和航线，不可笼统写"TD3C"：
  - 80kt = Aframax，Gulf of Oman→East
  - 130kt = Suezmax，Gulf of Oman→East
  - 270kt = VLCC，PG→China/Japan（才是真正的 TD3C 参考）

## 发送目标

1. Telegram: 群组 -1003727952836, threadId: **2** (MOC topic，本 topic) — **主要沟通渠道**
2. WhatsApp: +6592716786
3. WhatsApp: +6596249687 (仅 Dubai MOC 报告正文，不含其他内容)

### 跨 channel 发送方法

在任何 session/channel 中，跨 channel 发送用 CLI，不用 `message` tool（受 session context 限制）：

```bash
# 发 WhatsApp
openclaw message send --channel whatsapp --target +6596249687 --message "内容"

# 发 Telegram topic
openclaw message send --channel telegram --target "-1003727952836" --thread-id 2008 --message "内容"
```

## Cron 配置

- **ID**: `b97e0428-3da9-464e-8e88-2d5033f46e65`
- **时间**: 周一至周五 16:36 SGT
- **模型**: Opus

## 数据源优先级

| 数据 | 主来源 | 备用来源 |
|------|--------|----------|
| Dubai Assessment | FluxOfficials | Platts PCAAT00 |
| Physical Premium | FluxOfficials | — |
| **Partials 成交** | **eWindow API (`order_state="consummated"`)** | heards |
| **Partials offer range** | **eWindow API 最后1分钟 (08:29 GMT)** | heards |
| Declarations | Platts heards (逐条) | FluxOfficials (汇总) |
| Cash Oman | Platts heard | — |
| Cash Murban | Platts heard | — |
| 买卖盘 | Platts Finals on Close heard | — |
| 错误交易 | Platts heard + 文章正文 | — |

⚠️ **Partials 相关数据必须走 eWindow，不从 heards 提取 offer 价格区间**
