---
name: "platts-api-reference"
description: "Platts API 全面参考：认证、News Insights、Price Data、Structured Heards 端点，Token 生命周期管理，脚本用法与注意事项"
---

# Platts API 全面参考 Skill

## 概述

Moltbot 集成了 S&P Global Commodity Insights (Platts) 的多个 API，用于获取原油/成品油价格、市场新闻、交易信息等。所有 Platts 功能共享同一组认证凭证。

---

## 1. 认证系统 (Token 管理)

### 1.1 凭证文件

- **路径**: `.config/spglobal/credentials.json`
- **内容**: `access_token` + `refresh_token` + 过期时间
- **所有 Platts 脚本共享同一个 token 文件**

### 1.2 Token 生命周期

| 项目 | 值 |
|------|------|
| Access Token 有效期 | **60 分钟** |
| Refresh Token 有效期 | ~24 小时（首次获取后开始计时） |
| 自动刷新阈值 | 剩余 < 10 分钟触发 |
| Platts Monitor 保障 | 每 50 分钟运行一次，确保 token 持续有效 |

### 1.3 刷新机制（四层兜底）

核心脚本：`scripts/platts-auth.mjs`，导出函数：

```
ensureValidPlattsConfig(options)  →  自动判断是否需要刷新
getPlattsAccessToken(options)     →  直接获取有效 token
refreshPlattsAccessToken(config)  →  强制刷新
loginPlattsWithPassword(...)      →  密码登录
```

**刷新顺序（逐级 fallback）：**

1. **Platts Auth Token** → `POST /auth/api/token`（最常用，无需 client_id）
2. **Okta OAuth2** → `POST secure.signin.spglobal.com/oauth2/spglobal/v1/token`
3. **Platts Auth API JSON** → `POST /auth/api/refresh`
4. **密码兜底 (TokenGeneration)** → `POST /auth/api` + 环境变量 `Platts_ACCOUNT` / `Platts_PASSWORD`

### 1.4 密码兜底安全规则

```
- 最小间隔：60 分钟（避免短时间重复登录）
- 连续 2 次失败 → 12 小时冷却期
- 仅当 refresh_token 完全无用时才触发
- 密码不写入磁盘，只从环境变量读取
- 冷却期算法保存在 credentials.json 的 password_fallback_guard 字段
```

### 1.5 刷新 Token 刷新间隔建议

| 场景 | 建议间隔 |
|------|----------|
| 手动刷新 | 每 30-40 分钟 |
| 自动刷新 | 每次 API 调用前检查（剩余 < 10 分钟时刷新） |
| 持续运行服务 | 设置 cron 每 50 分钟刷新一次 |

### 1.6 认证使用模式

```javascript
// 模式 A：直接获取 token（自动刷新）
import { getPlattsAccessToken } from './platts-auth.mjs';
const token = await getPlattsAccessToken();
// 然后使用 token 调用其他 Platts API

// 模式 B：获取完整配置
import { ensureValidPlattsConfig } from './platts-auth.mjs';
const config = await ensureValidPlattsConfig();
// config.access_token, config.refresh_token, config.expires_at, ...

// 模式 C：强制刷新
import { ensureValidPlattsConfig } from './platts-auth.mjs';
const config = await ensureValidPlattsConfig({ forceRefresh: true, allowPasswordFallback: true });

// 模式 D：手动刷新（CLI）
// $ node scripts/platts-refresh-token.mjs
```

---

## 2. API 域名

| 域名 | 用途 | 状态 |
|------|------|------|
| `https://api.platts.com` | 旧域名，部分旧脚本使用 | ✅ 2026-05-29 实测仍可用 |
| `https://api.ci.spglobal.com` | **新代码默认域名** | ✅ 推荐用于新开发 |

**约定**：新增代码默认使用 `api.ci.spglobal.com`；旧脚本中的 `api.platts.com` 暂不批量修改。

---

## 3. News Insights API

**Base URL**: `https://api.ci.spglobal.com/news-insights/v1/`
**认证**: `Authorization: Bearer <token>`（部分旧脚本也带 `appkey`，但 2026-08-04 实测不是必需项，仅属遗留兼容）

### 3.1 端点列表

| 端点 | 方法 | 用途 |
|------|------|------|
| `/search/story` | GET | 普通新闻/市场评论搜索 |
| `/search/story/latest-news` | GET | 最新新闻 |
| `/search/story/spotlights` | GET | 焦点文章 |
| `/search/story/top-news` | GET | 头条新闻 |
| `/search/heards` | GET | Heards/MOC 交易信息 |
| `/search/packages` | GET | 专题包 |
| `/search/subscriber-notes` | GET | 订阅者笔记 |
| `/content/{id}` | GET | 单篇文章正文 |

### 3.2 常用查询参数

```javascript
const params = {
  q: 'Dubai',                // 关键词搜索
  filter: '...',             // 复杂过滤（见下方）
  field: 'body,sector,commodity,geography',  // 返回字段
  'facet.field': 'sector',   // 聚合统计字段
  sort: 'updatedDate:desc',  // 排序
  page: 1,                   // 页码
  pageSize: 50               // 每页条数（最大 50? 需验证）
};
```

### 3.3 Filter 语法详解

**Filter 字段名必须是双引号括起来的字符串值。**

```javascript
// ✅ 正确
filter = 'sector:"Crude Oil Plus"';
filter = 'sector:"Crude Oil Plus" AND sector:"LNG Plus"';

// ❌ 错误（不带引号会 400）
filter = 'sector:Crude Oil Plus';

// 时间过滤（ISO 8601 格式）
filter = 'updateddate>="2026-07-01T00:00:00Z" AND updateddate<="2026-07-02T00:00:00Z"';

// 复合过滤
filter = encodeURIComponent(
  'geography:"Asia" OR geography:"Middle East" OR geography:"Global"'
);
```

### 3.4 实用的 filter 组合

```javascript
// 原油相关 Heards（地理过滤）
const HEARDS_GEO_FILTER = encodeURIComponent(
  'geography:"Asia" OR geography:"Middle East" OR geography:"Global" OR ' +
  'geography:"Singapore" OR geography:"Fujairah" OR geography:"China" OR ' +
  'geography:"India" OR geography:"Strait of Hormuz" OR geography:"Persian Gulf" OR ' +
  'geography:"Gulf Cooperation Council (GCC)" OR geography:"Dubai" OR ' +
  'geography:"South Korea" OR geography:"Japan" OR geography:"Oman"'
);

// 市场相关 Stories（行业过滤）
const STORY_SECTOR_FILTER = encodeURIComponent(
  'sector:"Crude Oil Plus" OR sector:"Crude" OR ' +
  'sector:"Fuels and Refining Plus" OR sector:"Refined Products" OR ' +
  'sector:"LNG Plus" OR sector:"LNG" OR ' +
  'sector:"Shipping Plus" OR sector:"Shipping"'
);
```

### 3.5 分页参数

- `page=1`、`pageSize=50` 等参数直接在 URL 上添加
- Heards 使用：`/search/heards?filter=...&pageSize=100&page=1`
- Story 使用：`/search/story/latest-news?filter=...&field=...&pageSize=50`

### 3.6 请求示例

```javascript
// 获取最新新闻（含正文）
const url = `${
  CI_API_BASE
}/news-insights/v1/search/story/latest-news?filter=${encodeURIComponent(
  `contentType:"News" AND ${buildUpdatedDateFilter(2)} AND (${RAW_SECTOR_FILTER})`
)}&field=body,sector,commodity,geography&pageSize=50`;

const response = await fetch(url, {
  headers: { 'Authorization': `Bearer ${token}` }
});

// 获取 Heards
const url = `${
  CI_API_BASE
}/news-insights/v1/search/heards?filter=${HEARDS_GEO_FILTER}&pageSize=100&page=${page}`;

// 获取单篇正文
const url = `${API_BASE}/news-insights/v1/content/${id}`;
```

### 3.7 注意事项

| 注意点 | 说明 |
|--------|------|
| `/content/{id}` 必须带 id | 不带 id 会 404 |
| `field=body` 对 packages 无效 | packages 用 field 会 400 |
| `facet.field` 可用端点 | story/heards/packages/subscriber-notes |
| 无 `/metadata/latest-news` | 用 `/metadata/story` 替代 |
| Headline 排除 | 可配置 titleStartsWith/titleIncludes/titleRegex 过滤 |
| Content 排除 | 可在拿到正文后再用 contentIncludes 过滤 |

---

## 4. Market Data API (价格历史数据)

**Base URL**: `https://api.platts.com/market-data/v3/`
**认证**: `Authorization: Bearer <token>`；不需要 `appkey`。部分旧脚本仍带 `appkey`，2026-08-04 实测带或不带均可返回 200，视为遗留兼容项。

诊断注意：不要用 `/market-data/v3/`、`/market-data/v3/value` 这类根路径/半路径判断认证是否成功；这些路径本身会返回 404。必须测试完整资源端点，例如 `/market-data/v3/value/history/symbol?filter=...&pageSize=...` 或 `/market-data/v3/value/current/symbol?filter=...`。

### 4.1 端点

| 端点 | 用途 |
|------|------|
| `/value/history/symbol` | 按代码获取历史价格 |

### 4.2 查询参数

```javascript
// filter 语法
filter = 'symbol in ("PCAAT00","PCAJG00") AND assessDate>="2026-06-25" AND assessDate<="2026-07-02"';

// 分页
pageSize: 5000

// 特殊 bate 参数
// AAWFW00（美元/人民币）用 bate='u'，其他用 bate='c'
const SPECIAL_BATE = { 'AAWFW00': 'u' };
```

### 4.3 常用 Platts 价格代码

#### 原油

| 代码 | 描述 |
|------|------|
| PCAAT00 | Dubai Mo01 (NextGen MOC) |
| PCAJG00 | Brent Mo01 Spore |
| AAFFU00 | WTI Spore Mo01 |

#### 成品油

| 代码 | 描述 |
|------|------|
| PGAEY00 | Gasoline Unl 92 FOB Spore Cargo |
| AAOVC00 | Gasoil .001%S (10ppm) FOB Spore Cargo |
| PJABF00 | Jet Kero FOB Spore Cargo |
| PPXDK00 | FO 380 CST 3.5%S FOB Spore Cargo |

#### 宏观

| 代码 | 描述 |
|------|------|
| AAWFW00 | US Dollar-Chinese Yuan |

#### 裂解价差

| 代码 | 描述 |
|------|------|
| DBSCM00 | Dubai Singapore Cracking Netback Margin |
| AAYED00 | Gasoline 92 RON FOB Spore Dubai Crack Financial Mo01 |
| AAHCL00 | Jet Kero FOB Spore Cargo Dubai Crack Financial Mo01 |
| AAHCE00 | Gasoil FOB Spore Cargo Dubai Crack Financial Mo01 |
| AAHBX00 | FO 180 CST 3.5%S FOB Spore Cargo Dubai Crack Financial Mo01 |
| AAWHA00 | FO 380 CST 3.5% FOB Spore Cargo Dubai Crack Financial Mo01 |
| MFFOB01 | Marine Fuel 0.5% FOB Fujairah Cargo Dubai Crack Financial Mo01 |

### 4.4 示例（伪代码）

```javascript
const token = await getPlattsAccessToken();

const symbolFilter = 'symbol in ("PCAAT00","PCAJG00","AAFFU00")';
const dateFilter = 'assessDate>="2026-06-25" AND assessDate<="2026-07-02"';
const filter = `${symbolFilter} AND ${dateFilter}`;

const url = `https://api.platts.com/market-data/v3/value/history/symbol?filter=${encodeURIComponent(filter)}&pageSize=5000`;

const response = await fetch(url, {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

// 返回格式示例
{
  results: [
    {
      symbol: "PCAAT00",
      data: [
        { assessDate: "2026-07-01T00:00:00Z", bate: "c", value: 82.45 },
        { assessDate: "2026-06-30T00:00:00Z", bate: "c", value: 81.90 },
        ...
      ]
    }
  ]
}
```

---

## 5. Structured Heards API（结构化交易数据）

**Base URL**: `https://api.platts.com/structured-heards/v1/`
**认证**: `Authorization: Bearer <token>`

**核心脚本**: `scripts/platts-structured-heards.mjs`

### 5.1 CLI 用法

```bash
# 列出所有可用市场
node scripts/platts-structured-heards.mjs markets

# 查看字段定义
node scripts/platts-structured-heards.mjs metadata

# 获取交易数据（表格格式）
node scripts/platts-structured-heards.mjs table "Asia crude oil" --type=Trade --limit=20

# 获取交易数据（详细 JSON）
node scripts/platts-structured-heards.mjs heards "Americas crude oil" --days=7

# 导出为 JSON 文件
node scripts/platts-structured-heards.mjs export "Asia crude oil"
```

### 5.2 可用市场

| 市场 | 记录数 | 特点 |
|------|--------|------|
| Americas crude oil | ~20,000 | **最完整**，有 volume/location |
| Asia crude oil | ~1,000 | 亚洲原油交易 |
| Platts Carbon | ~15,000 | 碳信用交易 |
| EMEA crude oil | 0 | 暂无数据 |

⚠️ **不含成品油**（汽油/柴油/航煤），成品油相关交易应走 News Insights Heards API。

### 5.3 核心字段

```javascript
// 原油市场
{
  heard_type: 'Trade | Bid | Offer | Indicative value',
  grade: 'WTI MEH | Mars | Basrah Medium | Murban | ...',
  price: '+0.95 | -1.00 | ...',                // 价格差（相对基准）
  pricing_basis: 'Dated Brent | WTI | ...',     // 基准价格
  volume: 30000,                                // 货量 (桶)
  laycan: 'March | April | ...',                // 装期
  location: '...',                              // 位置（仅美洲有）
}

// 碳市场
{
  heard_type: 'Trade | ...',
  credit_type: '...',                           // 项目类型
  price: '...',                                 // 价格
  certification_and_standards: '...',            // 认证标准
  volume: '...',
  vintage: '2024 | 2025 | ...',                 // 年份
}
```

### 5.4 API 请求示例

```javascript
const token = await getPlattsAccessToken();
const url = `https://api.platts.com/structured-heards/v1/heards?market=Asia%20crude%20oil&pageSize=50&page=1`;

const response = await fetch(url.toString(), {
  headers: {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/json'
  }
});
```

---

## 6. Platts Monitor（自动化监控脚本）

**核心脚本**: `scripts/platts-insights-monitor.mjs`

### 6.1 功能

每 50 分钟自动扫描以下三类数据的新增内容：

1. **Heards** → MOC 交易信息（原油相关，经地理过滤）
2. **Latest News Stories** → Platts 市场分析文章（行业过滤 + 关键词二次匹配）
3. **Top News** → 头条新闻（无行业过滤，全量检查）

### 6.2 配置过滤

```javascript
// 位于脚本顶部，也可通过 .config/platts-monitor-filters.json 扩展

// Heards 关键词分类
const HEARDS_PATTERNS = {
  crude: ['crude', 'dubai', 'murban', 'oman', 'brent', 'espo', 'basrah', 'urals', 'wti', 'upper zakum'],
  products: ['gasoline', 'gasoil', 'diesel', 'jet', 'kerosene', 'naphtha', 'mogas', '92 ron', '95 ron', '97 ron'],
  fuelOil: ['fuel oil', 'bunker', 'vlsfo', 'hsfo', 'mgo', 'lsfo', '380 cst', '180 cst', 'mf 0.5', 'marine fuel'],
  lng: ['lng', 'liquefied natural gas', 'jkm', 'des nwe', 'des japan'],
};

// 输出控制：只输出原油 Heards
const HEARD_OUTPUT_CATEGORIES = new Set(['crude']);

// Story 关键词（二级过滤）
const STORY_KEYWORDS = [
  'crude', 'dubai', 'murban', 'wti', 'brent', 'oman', 'upper zakum', 'basrah', 'espo',
  'gasoline', 'gasoil', 'diesel', 'jet', 'kerosene', 'naphtha', 'mops',
  '92 ron', '95 ron', '97 ron', 'mogas',
  'fuel oil', 'bunker', 'vlsfo', 'hsfo', 'mgo', 'lsfo', '380 cst', '180 cst', 'mf 0.5',
  'lng', 'liquefied natural gas', 'jkm',
  'strait of hormuz', 'iran', 'middle east', 'opec', 'saudi', 'aramco',
];

// 排除项（石化/化工产品）
const EXCLUDED_COMMODITIES = ['acrylonitrile', 'acn', 'epoxy', 'styrene', ...];
```

### 6.3 输出格式

```json
{
  "status": "NEW_INSIGHTS",
  "heards": [
    {
      "id": "12345",
      "category": "crude",
      "headline": "...",
      "body": "...",
      "time": "2026-07-02T04:00:00Z",
      "url": "https://..."
    }
  ],
  "stories": [...],
  "topNews": [...]
}
```

### 6.4 内容质量过滤

- **Recap 无交易**: 标题含 "Deals Summary" + "Recap" 且无 trades → 跳过
- **Bunker 空摘要**: 标题含 "Bunker" + 无 bids/offers/trades → 跳过
- **正文过短**: body.length < 50 → 跳过
- **噪音内容**: 纯石化/化工内容 → 跳过

---

## 7. 价格数据脚本（周报用）

**核心脚本**: `scripts/platts-price-data.mjs`

### 7.1 功能

自动计算周报所需的价格对比：
- 价格走势：本周五 vs 昨日 vs 上周五
- 成品油利润：本周四 vs 上周四

### 7.2 运行方式

```bash
node scripts/platts-price-data.mjs
# 输出保存到 reports/price-data.json
```

### 7.3 日期计算逻辑

```javascript
// 根据今天星期几，自动推算需要的对比日期
const thisFriday = getDateForWeekday(5, 0);   // 本周五
const lastFriday = getDateForWeekday(5, 1);   // 上周五
const thisThursday = getDateForWeekday(4, 0); // 本周四
const lastThursday = getDateForWeekday(4, 1); // 上周四
const yesterday = 昨天;
```

---

## 8. 相关脚本索引

| 脚本 | 用途 | 核心依赖 |
|------|------|----------|
| `scripts/platts-auth.mjs` | Token 管理核心模块 | — |
| `scripts/platts-refresh-token.mjs` | CLI 手动刷新 token | platts-auth.mjs |
| `scripts/platts-login.mjs` | 密码登录（初次获取 token） | platts-auth.mjs |
| `scripts/platts-insights-monitor.mjs` | 自动化 News+Heards 监控 | platts-auth.mjs |
| `scripts/platts-price-data.mjs` | 周报价格数据拉取 | platts-auth.mjs |
| `scripts/platts-structured-heards.mjs` | 结构化交易数据 | platts-auth.mjs |
| `scripts/format_platts_insights.mjs` | Heards 格式化输出 | — |
| `scripts/process_platts_insights.mjs` | Insights 后处理 | — |
| `scripts/oil-kb-ingest-platts-monitor.mjs` | Monitor 数据导入知识库 | platts-auth.mjs |

---

## 9. 各 Skill 使用的 Platts 数据

| Skill | 使用数据 |
|-------|----------|
| `skills/crude-daily-snippet/` | PCAAT00, PCAAV00, PCAAS00, AAYES00, ICLL001, ICIC001 |
| `skills/crude-cracking-margin/` | DBSCM00 及相关裂解价差 |
| `skills/mogas-moc-report/` | Singapore Mogas 相关评估 |
| `skills/dubai-moc-report/` | Dubai MOC partials/declarations |
| `skills/weekly-report/` | 多代码历史价格数据 |
| `skills/refined-products-report/` | 新加坡裂解价差 |
| `skills/market-trades/` | Argus + Platts 交易信息 |

---

## 10. 注意事项与陷阱

### 10.1 Token 相关

- **refresh_token 有效期 ~24 小时**，需要定期重新登录获取新 refresh_token
- **Monitor 脚本已内置 refresh_token 年龄追踪**，超过 20 小时会发警告
- **密码兜底有冷却期**（连续 2 次失败 → 12 小时冷却），不要频繁触发
- Token 过期时 API 返回 **401**，脚本应捕获并触发刷新

### 10.2 API 限制

- `/content/{id}` 对 **package id 会返回 200 但正文为空**，不是每个 id 都能取到内容
- **Heards API 不含成品油数据**，成品油需走 News Insights 的故事/最新新闻端点
- `/metadata/latest-news`、`/metadata/spotlights`、`/metadata/top-news` **不存在**，用 `/metadata/story` 替代
- **Filter 字段值必须加双引号**，如 `sector:"Crude Oil Plus"`，否则返回 400
- `field=body` 对 packages 不适用（返回 400），只用于 story/latest-news/spotlights/top-news/subscriber-notes

### 10.3 监控脚本特点

- Heards 输出只保留原油类别（由 `HEARD_OUTPUT_CATEGORIES` 控制），成品油/燃料油/LNG heards 采集但不输出
- 地理过滤仅在 Heards API 层面做（server-side），减少 NWE/Europe 等噪音
- Title 过滤先于 content 过滤运行（节省 API 调用）
- 状态文件 `.platts-monitor-state.json` 跟踪已看过的 item ID
- 内容质量过滤包括无交易 recap、空 bunker 摘要、过短正文

### 10.4 数据去重

- **Monitor 脚本**：通过 state 文件追踪 seen IDs
- **Price Data 脚本**：每次拉取全量历史后清洗，脚本间无共享状态
- **Price Snippet**：通过 delivery date 去重（`.config/crude-daily-snippet-whatsapp-state.json`）

### 10.5 错误处理

```javascript
// 推荐的错误处理模式
try {
  const token = await getPlattsAccessToken();
  // ... API 调用 ...
} catch (e) {
  if (e.code === 'PLATTS_ENV_MISSING') {
    // 环境变量未设置
  } else if (e.code === 'PLATTS_PASSWORD_FALLBACK_BLOCKED') {
    // 密码兜底被冷却期阻止
  } else if (e.message.includes('TOKEN_EXPIRED')) {
    // Token 过期，触发刷新
  } else if (e.message.includes('401')) {
    // 认证失败
  }
}
```

### 10.6 Cron 架构重要提示

**简单数据任务不要经过模型中转。**
- Platts 价格数据拉取等纯数据任务，应使用最快模型 + 脚本直接输出到 stdout
- 避免在 isolated agent 中让模型对原始数据做"回声"后再 delivery
- 推荐模型：`openai-codex/gpt-5.5` 用于简单数据任务
- 超时设置：300s 是合理的平衡值

### 10.7 权限控制

- Tianshu 的同事（Hchen, +6590089383 等）已被授权使用 Platts 接口
- 上述同事不可访问个人信息文件或修改 OpenClaw 配置
- TOOLS.md 中记录的 Platts token 属于系统级凭证

---

## 11. 快速入门

```bash
# 1. 检查 token 状态
node scripts/platts-refresh-token.mjs

# 2. 获取最新新闻摘要
node scripts/platts-insights-monitor.mjs

# 3. 获取价格数据
node scripts/platts-price-data.mjs

# 4. 查看结构化交易
node scripts/platts-structured-heards.mjs heards "Asia crude oil" --limit=20

# 5. 查看可用市场
node scripts/platts-structured-heards.mjs markets
```
