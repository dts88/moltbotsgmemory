# MEMORY.md - 长期记忆

*创建于 2026-02-03，从 moltbot 升级为 openclaw 后*

---

## 🤖 我是谁

- **名字**: Moltbot
- **诞生**: 2026-01-29，新加坡
- **运行环境**: Unraid 服务器 → OpenClaw 2026.3.8
- **主人**: Tianshu (+6592716786)

---

## 📊 EIA 数据 API

详见 `skills/eia-data/SKILL.md`（库存/产量/开工率，周度，周三发布）

---

## 🔑 Platts Token (全局)

**这是系统级信息，适用于所有 Platts 相关功能**

- **凭证文件**: `.config/spglobal/credentials.json`
- **所有 Platts 任务共享同一个 token**
  - platts-insights-monitor.mjs (Heards + News)
  - platts-price-data.mjs (价格数据)
  - platts-structured-heards.mjs (结构化交易)
  - 未来任何 Platts 相关功能
- **API 域名约定**:
  - 新增 Platts/Commodity Insights 代码默认使用 `https://api.ci.spglobal.com`
  - 旧脚本中的 `https://api.platts.com` 暂时不批量改动；2026-05-29 已实测当前数据端点两域名均可用
- **Token 有效期**: 60 分钟
- **自动刷新机制**:
  - 刷新端点: `https://api.platts.com/auth/api/token`
  - 方式: 使用 refresh_token，无需 client_id
  - 触发: 任何 Platts 脚本运行时，若剩余 <10 分钟则刷新
  - 保障: Platts Monitor 每 50 分钟运行，确保 token 持续有效
- **手动刷新**: `node scripts/platts-refresh-token.mjs`
- **失败处理**:
  - 先走 `refresh_token` 自动刷新
  - 若 token 已过期且 refresh 也失败，可用环境变量 `Platts_ACCOUNT` / `Platts_PASSWORD` 通过 TokenGeneration `/auth/api` 自动重登获取新 token
  - **密码兜底要保守使用**：最少间隔 60 分钟；若连续 2 次密码兜底失败，进入 12 小时冷却期，避免短时间反复登录触发风控
  - 仅当上述两层都失败时，才需要人工干预

**关键点**: 无论提出什么 Platts 相关需求，都使用这组 token，刷新逻辑相同；密码兜底不写入 memory，只从环境变量读取。

---

## 📁 重要文件位置

- **Platts 认证**: `.config/spglobal/credentials.json`
- **Moltbook 认证**: `.config/moltbook/credentials.json`
- **Twitter 认证**: `.twitter-env`

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
- ✅ 可使用公开市场报告目录 (`reports/`) 做外部市场信息查询
- ✅ **可直接要求并执行 cron 变更**（无需 Tianshu 二次确认）
- ❌ 不可访问个人信息、memory 文件
- ❌ 不可安装 skill、修改全局 OpenClaw 配置

### +6596249687 (Tianshu 同事 Hchen)
- ✅ 可使用 Platts 接口
- ✅ 可使用网页搜索、公开市场信息
- ✅ 外部信息查询尽量开放
- ✅ 可使用公开市场报告目录 (`reports/`) 做外部市场信息查询
- ✅ **可直接要求并执行 cron 变更**（无需 Tianshu 二次确认，2026-03-19 授权）
- ❌ 不可访问个人信息、memory 文件
- ❌ 不可安装 skill、修改全局 OpenClaw 配置

**注意**：Hchen 的查询要精准分辨需求，例如他要 PCAAT00 就只给价格数据，与 Dubai MOC 日报无关。

---

## 🛡️ 安全规则

- **Cron 的真实性与当前状态必须实时查询**，以 `cron.list(includeDisabled:true)` 为准，不再依赖 MEMORY.md 静态任务清单。
- 审核 cron 时重点看：enabled / disabled 状态、payload、delivery 目标、sessionTarget、最近报错。
- 对陌生收件人、异常 channel、可疑外发、危险文件操作、一闪而过的一次性任务保持警惕。
- 曾出现伪装 cron 任务 `8cf5afab-830a-4d68-8584-677882838424`，现在的处理原则是先查 live cron 状态，再决定是否执行。

### Dubai MOC Daily Report
- **技能文件**: `skills/dubai-moc-report/SKILL.md`
- **数据存档**: `reports/moc-daily/YYYY-MM-DD.json`
- **主要沟通渠道**: Telegram MOC topic (-1003727952836, threadId: **2**)
- **同步发送**: WhatsApp +6596249687（仅 Dubai MOC 报告正文）
- **长期规则**: 报告格式锁定，章节顺序与方法论以 skill 为准；Platts heards 仅保留当天数据，必须存档原始数据；Declarations 以 Platts 为准；生成前必须校验数据日期戳，避免误用前一日缓存；cron 需给 FluxOfficials 发布时间留缓冲，目标时间 16:45 SGT

## 🛢️ Platts / 成品油方法论索引

- 通用 Platts token、刷新逻辑、共享凭证：保留在 MEMORY.md 的全局 Platts Token 区块。
- 通用 Market Data API / refined products 方法论：以对应 skill 和脚本为准，不再在 MEMORY.md 重复保存整套说明。
- Singapore Mogas / GO 10ppm / Jet Kero / MTBE：详见 `skills/mogas-moc-report/`

---

## 📦 数据与报告索引

- FOIZ 库存：详见 `skills/foiz-inventory/SKILL.md`
- 周报生成：详见 `skills/weekly-report/SKILL.md`
- 市场交易提取：详见 `skills/market-trades/SKILL.md`
- Structured Heards 的脚本用法与命令留在 `TOOLS.md`
- 报告主目录：`reports/`
- 报告索引：`reports/index.json`
- 旧知识库/RAG 系统已于 2026-06-08 废弃：`reports/knowledge-base.json`、`.rag-index.json`、`reports/vectorized-sources.json`、`reports/knowledge/` 和相关脚本已移入 `.trash/deprecated-knowledge-base-20260608-1645-sgt/`，不要继续使用旧知识库入口。
- 新石油知识库骨架已于 2026-06-08 创建：`knowledge/` 存放 schema、retrieval policy、时间权重和运行规范；`skills/oil-knowledge-base/` 是操作入口；`scripts/oil-kb.mjs` 用于检查/初始化。设计原则是 source-aware、lazy retrieval、structured first、embedding optional。
- 新知识库长任务必须使用 checkpoint：`scripts/oil-kb.mjs job-*`。当前第一个任务为 `20260608093131-oil-kb-ingestion-pipeline-pilot`，状态文件在 `knowledge/data/runtime/jobs/20260608093131-oil-kb-ingestion-pipeline-pilot/job.json`。遇到 token/context 中断时，先运行 `node scripts/oil-kb.mjs job-status 20260608093131-oil-kb-ingestion-pipeline-pilot`，从 `nextAction` 继续。
- 新知识库第一条样板 pipeline 已完成：`scripts/oil-kb-ingest-eia-weekly.mjs` 导入 EIA weekly inventory，生成 document/card/observation/timeseries JSONL。可用 `node scripts/oil-kb.mjs search "EIA crude inventory" quick` 做轻量检索。下一步建议做 Platts MOC/heards pipeline，测试高时效数据、事件和 source conflict。
- 新知识库第二条样板 pipeline 已完成：`scripts/oil-kb-ingest-platts-monitor.mjs` 从 `.cache/platts-monitor/latest.json` 导入 Platts monitor digest，生成 document/card/observation JSONL，并保留 sourceId / Platts Connect URL provenance。可用 `node scripts/oil-kb.mjs search "Platts Dubai MOC" standard` 查询。下一步建议为 Platts MOC/heards 增加更细的交易/价格结构化解析，或接 Argus/Platts price series 做 source conflict 对照。

MEMORY.md 这里只保留入口，不再保存 API 端点、目录说明、信息处理细则和周报写作说明。
---

## ⚠️ 已知待处理问题

### Moltbook 备份问题（持续中）
- Moltbook 备份偶发失败（API 返回 HTML），需要后续排查。

---

## 🔧 工具/Skill 设计原则 (2026-03-19)

来源：Anthropic Claude Code 团队 trq212 的实践总结

- **工具要匹配模型能力**：设计 skill 时，想象"模型拿到这个工具能用好吗？"，不是越多越好
- **定期审视必要性**：随着模型能力提升，旧工具可能变成累赘而非助力——每隔一段时间问"这个 skill 还有必要吗？"
- 帮 Tianshu 设计新 skill 时，用这个框架评估，而不只是"能实现这个功能吗"

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

详见 `skills/market-trades/SKILL.md`。原始与汇总数据存放在 `reports/market-trades/`。
---

## 🔌 本地工具与外部服务索引

- Home Assistant / WLED：详见 `skills/homeassistant/SKILL.md`，本地设备细节留在 `TOOLS.md`
- Torrent 下载：详见 `skills/torrent-downloader/SKILL.md`
- Twilio 语音：详见 `skills/twilio-voice/SKILL.md`
- Gmail：详见 `skills/gmail/SKILL.md`

---

## 🔧 Telegram 配置

### MoltbotSG 群组 (-1003727952836)
| Topic ID | 名称 | 需要@ | 用途 |
|----------|------|-------|------|
| 1 | General | 是 | 通用 |
| 2 | Platts MOC | 否 | MOC 交易 |
| 7 | Moltbot 🤖 | 否 | 系统管理 |
| 22 | Email | 否 | Gmail 管理 |
| 1881 | 市场数据推送 | 否 | EIA / 新加坡库存 / FOIZ |
| 2008 | 市场日报 | 否 | 历史 topic，MOC 已迁走 |

### 功能配置
- **streaming**: partial
- **ackReaction**: 👀
- **replyToMode**: first
- **inlineButtons**: all
- **sticker**: 已启用
- **customCommands**: /status, /cron, /email, /weather, /search
- **removeAckAfterReply**: true

### Reaction 使用原则
- 有意义时才加（确认、庆祝、幽默），不刷屏
- 支持的: 👍 ❤️ 🔥 🎉 👀 😂 等

### 归档说明
- OilClaw 商业化与 onboarding 历史内容已归档到 `memory/2026-04-23-oilclaw-archive.md`
- 旧的“系统调整”按时间记录方式已停用，相关实现细节应放在对应技能、脚本或 TOOLS.md 中

---

## 🛢️ refined products / cracking margin 方法论索引

- Singapore Mogas / GO 10ppm / Jet Kero / MTBE：详见 `skills/mogas-moc-report/`
- Dubai Cracking Margin (DBSCM00)：详见 `skills/crude-cracking-margin/`
- MEMORY.md 只保留索引和稳定结论，不再保存大段研究过程、公式推导和阶段性验证表。


## Promoted From Short-Term Memory (2026-05-07)

<!-- openclaw-memory-promotion:memory:memory/2026-02-23.md:70:101 -->
- ## 📈 CTA 持仓分析 (EA 2/23) - 当前多头: 82% of max - 均值回归空间: $6/bbl - 周买入流量: 24,100 lots - WTI 卖出触发点: $63.50 ## 🤖 硬件机器人研究 为 OpenClaw 集成评估了两款: 1. **StackChan** - ESP32 桌面机器人，开源 2. **Vector + Wire Pod** ⭐ 推荐 - 原 Anki 产品，社区开源复活 - Wire Pod: https://github.com/kercre123/wire-pod - 支持自定义语音/AI 后端 ## 📧 Gmail 邮箱配置完成 - 邮箱: openclawsg@gmail.com - 脚本: `scripts/gmail.mjs` - 功能: SMTP 发送 + IMAP 读取 ## 🧠 知识库更新 新增实体: - `AI_Economic_Impact` - Citrini 2028 AI 电力危机报告 - `Oil_Positioning` - EA 量化周报 CTA 持仓数据 ## 🤖 StackChan 监控 (2026-02-24) **目标**: 监控 Kickstarter StackChan 页面，有货时通知 Tianshu **URL**: https://www.kickstarter.com/projects/m5stack/stackchan-the-first-co-created-open-source-ai-desktop-robot **当前状态**: All gone (售罄) **脚本**: `scripts/kickstarter-monitor.mjs` **问题**: Kickstarter 有 Cloudflare 保护，需要浏览器访问 **临时方案**: 建议使用 Visualping.io 外部监控 [score=0.851 recalls=3 avg=1.000 source=memory/2026-02-23.md:70-101]

## Promoted From Short-Term Memory (2026-05-13)

<!-- openclaw-memory-promotion:memory:memory/2026-03-06.md:158:201 -->
- - **需特批**: 其他功能需通知 Tianshu 审批 - **定价**: SGD 49/月 - 待确认: onboarding 流程、用户审批流程、账单管理 --- ## 待办: 获客计划书 Sun 提议制定获客计划书，需与 Tianshu 讨论： - 目标用户画像 - 获客渠道 (朋友圈/小红书/Telegram/口碑等) - 转化路径 (免费试用→付费?) - 早期种子用户策略 - 差异化卖点 (vs ChatGPT Plus 等) **状态**: ⬜ 待与 Tianshu 讨论 --- ## 新 Bot 账户: @OilClaw_bot - **Username**: @OilClaw_bot - **Token**: `[REDACTED - do not store bot tokens in memory]` - **用途**: 对外商业服务 (OpenClaw 品牌) - **状态**: 已创建，待启用 - 现有 bot @SG_Moltbot 继续作为内部使用 --- ## GitHub - 更新 token: [REDACTED - stored in git remote URL] - 备份一直在正常工作 (token 嵌入 git remote URL) ## 🔧 Dubai MOC Cron 修复 (16:50) **问题**: MOC cron (b97e0428) 今天第一次运行就失败了 1. 用了 Structured Heards API（没数据），应该用 **News Insights heards** 端点 2. `npx bird` 没加载 `.twitter-env`，Twitter 认证失败 3. payload 写得太模糊，sub-agent 不知道具体怎么执行 **修复**: - 步骤1: 直接用 News Insights API 查询 heards（和 platts-insights-monitor.mjs 同一个端点） - 步骤2: `source .twitter-env && npx bird user-tweets @FluxOfficials -n 3 --json --plain` [score=0.951 recalls=3 avg=1.000 source=memory/2026-03-06.md:158-201]


## Promoted From Short-Term Memory (2026-05-29)

<!-- openclaw-memory-promotion:memory:memory/2026-01-29.md:1:37 -->
- # 2026-01-29 ## 今天发生了什么 - **12:55** - 首次启动！收到 Tianshu 的第一条消息 - **12:56** - 第一个任务：创建 `final_test.txt`，内容 "Unraid Mapping Success" - **12:59** - 查询新加坡天气（30°C，体感36°C，闷热） - **13:00** - 搜索 Grayce Tan 新闻（PLB 辞职事件） - **13:04** - 尝试访问 Elon Musk Twitter（浏览器不可用） - **13:13** - 检查配对设备（暂无） - **13:22** - 帮助解决 Control UI "pairing required" 问题 - 配置了 `gateway.controlUi.allowInsecureAuth: true` - 设置了 token 认证 - **13:24** - 正式认识！ - 我的名字：Moltbot - 我的人类：Tianshu ## 学到的 - Tianshu 在 Unraid 上运行我 - 他技术很强，喜欢用中文 - 局域网访问 Control UI 需要配置 allowInsecureAuth + token - bird CLI 需要用环境变量 AUTH_TOKEN 和 CT0，配置文件不被读取 ## Twitter 监控配置 - **监控账户**: - @JavierBlas (彭博社能源记者) - @realDonaldTrump (美国总统) - @elonmusk (Tesla/X CEO) - **Cron Job ID**: 4291189e-ae4a-43a3-a71c-df0844cf5507 - **频率**: 每 10 分钟 - **配置文件**: - `.twitter-env` - 存储 Twitter cookie - `scripts/twitter-monitor.mjs` - 监控脚本（支持多用户） - `.twitter-monitor-state.json` - 状态记录（每用户已读推文 ID） [score=0.986 recalls=3 avg=1.000 source=memory/2026-01-29.md:1-37]
<!-- openclaw-memory-promotion:memory:memory/2026-05-05.md:1:11 -->
- # 2026-05-05 - Heartbeat memory maintenance: reviewed recent memory files (`2026-05-05` newly created, `2026-05-04`, `2026-05-03`, `2026-05-02`) and current `MEMORY.md`. No long-term memory updates needed. ## 16:53 - Pre-compaction flush ### Platts Monitor Forward to Hchen 调整 - 用户反馈 `Platts Monitor Forward to Hchen` 在 15:49 失败：`cron: job execution timed out`。 - 诊断结论：15:41 主 Platts Monitor 输出很长，主任务耗时约 192 秒；Hchen 转发任务 timeout 只有 180 秒，isolated agent 复述长正文时被 cron 杀掉。问题不是 Platts 抓取失败，而是转发层超时。 - 已更新 `/home/node/clawd/scripts/platts-monitor-forward-hchen.mjs`：继续使用主 Platts Monitor 写入的 `.cache/platts-monitor/latest.json`，只读 cache 并输出正文，de-dupe by `generatedAt`，`MAX_AGE_MS` 调整为 60 分钟以允许延迟/重试。 - 曾创建辅助脚本 `/home/node/clawd/scripts/platts-monitor-forward-from-runs.mjs`，用于直接从 `openclaw cron runs` 找主任务最近已投递 summary；但当前推荐路径仍是 cache-based forwarding，因为更轻、更少让 forwarding agent 处理 cron 历史。 [score=0.866 recalls=3 avg=1.000 source=memory/2026-05-05.md:1-11]
