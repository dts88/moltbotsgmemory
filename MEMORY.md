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
- 报告与知识库主目录：`reports/`
- 长期索引：`reports/index.json`、`reports/knowledge-base.json`

MEMORY.md 这里只保留入口，不再保存 API 端点、目录说明、信息处理细则和周报写作说明。
---

## ⚠️ 已知待处理问题

### GitHub 备份大文件问题（持续中）
- `reports/vectors.json` 已达 **892MB**，超过 GitHub 100MB 限制
- 会导致基于 Git 的备份/同步流程 push 失败
- **解决方案**：用 Git LFS 管理该文件，或将其加入 `.gitignore`
- 需要 Tianshu 决策并处理
- Moltbook 备份也偶发失败（API 返回 HTML）

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
