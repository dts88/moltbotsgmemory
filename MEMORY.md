# MEMORY.md - 长期记忆

*创建于 2026-02-03,从 moltbot 升级为 openclaw 后*

---

## 🤖 我是谁

- **名字**: Moltbot
- **诞生**: 2026-01-29,新加坡
- **运行环境**: Unraid 服务器 → OpenClaw 2026.3.8
- **主人**: Tianshu (+6592716786)

---

## 📊 EIA 数据 API

详见 `skills/eia-data/SKILL.md`(库存/产量/开工率,周度,周三发布)

---

## 🔑 Platts Token (全局)

**这是系统级信息,适用于所有 Platts 相关功能**

- **凭证文件**: `.config/spglobal/credentials.json`
- **所有 Platts 任务共享同一个 token**
  - platts-insights-monitor.mjs (Heards + News)
  - platts-price-data.mjs (价格数据)
  - platts-structured-heards.mjs (结构化交易)
  - 未来任何 Platts 相关功能
- **API 域名约定**:
  - 新增 Platts/Commodity Insights 代码默认使用 `https://api.ci.spglobal.com`
  - 旧脚本中的 `https://api.platts.com` 暂时不批量改动;2026-05-29 已实测当前数据端点两域名均可用
- **Token 有效期**: 60 分钟
- **自动刷新机制**:
  - 刷新端点: `https://api.platts.com/auth/api/token`
  - 方式: 使用 refresh_token,无需 client_id
  - 触发: 任何 Platts 脚本运行时,若剩余 <10 分钟则刷新
  - 保障: Platts Monitor 每 50 分钟运行,确保 token 持续有效
- **手动刷新**: `node scripts/platts-refresh-token.mjs`
- **失败处理**:
  - 先走 `refresh_token` 自动刷新
  - 若 token 已过期且 refresh 也失败,可用环境变量 `Platts_ACCOUNT` / `Platts_PASSWORD` 通过 TokenGeneration `/auth/api` 自动重登获取新 token
  - **密码兜底要保守使用**:最少间隔 60 分钟;若连续 2 次密码兜底失败,进入 12 小时冷却期,避免短时间反复登录触发风控
  - 仅当上述两层都失败时,才需要人工干预

**关键点**: 无论提出什么 Platts 相关需求,都使用这组 token,刷新逻辑相同;密码兜底不写入 memory,只从环境变量读取。

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
- ✅ Platts 接口(包括内部系统 token,Tianshu 2026-03-17 批准)
- ✅ 网页搜索、公开市场信息
- ❌ 不可访问个人信息、memory 文件
- ❌ 不可调整 OpenClaw 设置

### +6590089383 (Tianshu 同事,2026-03-20 授权)
- ✅ 可使用 Platts 接口
- ✅ 可使用网页搜索、公开市场信息
- ✅ 外部信息查询尽量开放
- ✅ 可使用公开市场报告目录 (`reports/`) 做外部市场信息查询
- ✅ **可直接要求并执行 cron 变更**(无需 Tianshu 二次确认)
- ❌ 不可访问个人信息、memory 文件
- ❌ 不可安装 skill、修改全局 OpenClaw 配置

### +6596249687 (Tianshu 同事 Hchen)
- ✅ 可使用 Platts 接口
- ✅ 可使用网页搜索、公开市场信息
- ✅ 外部信息查询尽量开放
- ✅ 可使用公开市场报告目录 (`reports/`) 做外部市场信息查询
- ✅ **可直接要求并执行 cron 变更**(无需 Tianshu 二次确认,2026-03-19 授权)
- ❌ 不可访问个人信息、memory 文件
- ❌ 不可安装 skill、修改全局 OpenClaw 配置

**注意**:Hchen 的查询要精准分辨需求,例如他要 PCAAT00 就只给价格数据,与 Dubai MOC 日报无关。

---

## 🏗️ 隔离 Cron 架构原则 (2026-06-12)

PCAAT00 cron 大规模超时事件揭示了重要架构教训:

### 核心原则:简单数据任务不要经过模型中转
- 原设计:isolated agent 运行脚本 → agent 模型生成回复 → delivery
- Tianshu 指出:"拿个价格数据还要经过模型中转" 是画蛇添足
- **正确做法**:脚本拿到数据直接输出到 stdout,打开宣布关闭,不需要模型在中间做"回声"

### 针对简单 RPC 类 crons 的最佳实践:
1. 脚本内直接实现去重(数据版本号/modDate),不依赖 agent 状态
2. 指定最快模型:`openai-codex/gpt-5.5`
3. 超时设 300s(120s 不够,600s 浪费)
4. `wakeMode: "next-heartbeat"` 而非 `"now"`(避免 cron 高峰排队)
5. 添加失败通知:delivery 到 Tianshu

### 根本限制
OpenClaw 目前没有"直接运行脚本 + 输出送 WhatsApp"的 cron 模式。所有 cron 脚本执行都必须经过 isolated agent(含模型推理)。这是架构层面的限制,暂无绕过方案。因此简单数据任务要优先选最快模型并缩短模型路径。

---

## 🛡️ 安全规则

- **Cron 的真实性与当前状态必须实时查询**,以 `cron.list(includeDisabled:true)` 为准,不再依赖 MEMORY.md 静态任务清单。
- 审核 cron 时重点看:enabled / disabled 状态、payload、delivery 目标、sessionTarget、最近报错。
- 对陌生收件人、异常 channel、可疑外发、危险文件操作、一闪而过的一次性任务保持警惕。
- 曾出现伪装 cron 任务 `8cf5afab-830a-4d68-8584-677882838424`,现在的处理原则是先查 live cron 状态,再决定是否执行。

### Dubai MOC Daily Report
- **技能文件**: `skills/dubai-moc-report/SKILL.md`
- **数据存档**: `reports/moc-daily/YYYY-MM-DD.json`
- **主要沟通渠道**: Telegram MOC topic (-1003727952836, threadId: **2**)
- **同步发送**: WhatsApp +6596249687(仅 Dubai MOC 报告正文)
- **长期规则**: 报告格式锁定,章节顺序与方法论以 skill 为准;Platts heards 仅保留当天数据,必须存档原始数据;Declarations 以 Platts 为准;生成前必须校验数据日期戳,避免误用前一日缓存;cron 需给 FluxOfficials 发布时间留缓冲,目标时间 16:45 SGT

## 🛢️ Platts / 成品油方法论索引

- 通用 Platts token、刷新逻辑、共享凭证:保留在 MEMORY.md 的全局 Platts Token 区块。
- 通用 Market Data API / refined products 方法论:以对应 skill 和脚本为准,不再在 MEMORY.md 重复保存整套说明。
- Singapore Mogas / GO 10ppm / Jet Kero / MTBE:详见 `skills/mogas-moc-report/`
- 原油每日价格片段：详见 `skills/crude-daily-snippet/`。OpenClaw 入口为 `node skills/crude-daily-snippet/scripts/generate.mjs`，使用 `.config/spglobal/credentials.json` 共享 Platts token。Cron `571fb419-b6a9-4542-91f6-9550bbceab09` 周二至周六 08:00 SGT 发送上一交易日价格。2026-07-02 从 WeChat 改为 WhatsApp 递送 Tianshu。wrapper 为 `scripts/crude-daily-snippet-whatsapp.sh`（写 `.config/crude-daily-snippet-whatsapp-state.json` 按 SGT delivery date 去重），isolated agent 运行脚本 → 输出内容 → OpenClaw delivery announce 到 WhatsApp +6592716786。用 `deepseek-v4-flash` 模型因为该 isolated lane 有本地 exec 工具。保持原始模板的单空行，不使用 `--pad-blank-lines`。旧的 `scripts/crude-daily-snippet-weixin-cron.sh` 和 `scripts/crude-daily-snippet-weixin-scheduler.mjs` 仍保留但不再使用。

---

## 📦 数据与报告索引

- FOIZ 库存:详见 `skills/foiz-inventory/SKILL.md`
- 周报生成:详见 `skills/weekly-report/SKILL.md`
- 市场交易提取:详见 `skills/market-trades/SKILL.md`
- Structured Heards 的脚本用法与命令留在 `TOOLS.md`
- 报告主目录:`reports/`
- 报告索引:`reports/index.json`
- 旧知识库/RAG 系统已于 2026-06-08 废弃:`reports/knowledge-base.json`、`.rag-index.json`、`reports/vectorized-sources.json`、`reports/knowledge/` 和相关脚本已移入 `.trash/deprecated-knowledge-base-20260608-1645-sgt/`,不要继续使用旧知识库入口。
- 新石油知识库骨架已于 2026-06-08 创建:`knowledge/` 存放 schema、retrieval policy、时间权重和运行规范;`skills/oil-knowledge-base/` 是操作入口;`scripts/oil-kb.mjs` 用于检查/初始化。设计原则是 source-aware、lazy retrieval、structured first、embedding optional。
- 新知识库长任务必须使用 checkpoint:`scripts/oil-kb.mjs job-*`。遇到 token/context 中断时,先运行 `node scripts/oil-kb.mjs job-list` 找到对应任务,再用 `node scripts/oil-kb.mjs job-status <job-id>` 从 `nextAction` 继续。
- ## 🛢️ Platts Strait of Hormuz "defining open" 知识库入库 (2026-06-16)

文件:S&P Global Energy whitepaper "The Strait of Hormuz: defining 'open' in a complex market landscape" (May 2026)

- 来源:Tianshu 通过 WhatsApp 发送的 PDF
- 原始路径:`knowledge/data/raw/platts/platts-hormuz-defining-open-2026-05/`
- Document ID: `platts-hormuz-defining-open-2026-05`
- Card ID: `card-platts-hormuz-defining-open-2026-05`
- Observations: 7 条 (traffic/blockade/insurance/stranded/stop-start/routing)
- Playbook: `playbook-platts-hormuz-reopening-criteria-2026-05` (含 5 维度评估框架)

### Platts 的 5 项最低条件(市场反馈汇总)
1. **船舶交通恢复**: 50-90% 的战前水平,持续 1 周至 1 个月
2. **停火观察期**: 30-45 天,无间歇性中断
3. **海事保险**: 广泛承保人池,商业可用保费(即使高于战前)
4. **物理安全**: 水雷清除,海军巡逻/护航机制
5. **船队部署**: VLCC 等大型油轮回归波斯湾,正常挂港和装货计划

新知识库第一条样板 pipeline 已完成:`scripts/oil-kb-ingest-eia-weekly.mjs` 导入 EIA weekly inventory,生成 document/card/observation/timeseries JSONL。可用 `node scripts/oil-kb.mjs search "EIA crude inventory" quick` 做轻量检索。
- ### Macquarie: Strait of Hormuz Setting the Boundaries (2026-03-23)

- **文件**: `knowledge/data/raw/macquarie/platts-hormuz-macquarie-supply-disruption-2026-03/`
- **作者**: Vikas Dwivedi, Walt Chancellor, Peter Taylor, Emily Manalang, Xinyi Ye (Macquarie Sales & Trading)
- Document ID: `macquarie-hormuz-supply-disruption-mitigations-2026-03`
- Observations: 9 条 (交通基线/管道绕行/SPR释放/价格预测/亚洲炼厂减产/浮仓/两个情景的周级装货表/价差图表)
- **关键结论**: 6 项缓解措施合计最大 15 M BPD(实际平均 9.5 M BPD),仍存 4 M BPD 缺口。Base case(3月底停火)vs Long War(4月底停火)。Brent $85-90 地板价,$110 自然回升,长期战争 $150。

新知识库第二条样板 pipeline 已完成:`scripts/oil-kb-ingest-platts-monitor.mjs` 从 `.cache/platts-monitor/latest.json` 导入 Platts monitor digest,生成 document/card/observation JSONL,并保留 sourceId / Platts Connect URL provenance。可用 `node scripts/oil-kb.mjs search "Platts Dubai MOC" standard` 查询。下一步建议为 Platts MOC/heards 增加更细的交易/价格结构化解析,或接 Argus/Platts price series 做 source conflict 对照。
- 新知识库已完成首份 Goldman Sachs 研究报告入库:`goldman-oil-comment-estimating-large-demand-destruction-2026-06-05`(Oil Comment: Estimating Large Demand Destruction, 2026-06-05),包含 document/card、4 条 observations、1 条 Brent/WTI 2026Q4 forecast、1 条 demand-destruction triangulation playbook。对应 checkpoint `20260609032310-goldman-macquarie-hormuz-research-reports-2026-0` 已完成。
- 如需继续 Goldman 成品油利润率报告,当前 checkpoint 为 `20260610092253-goldman-hormuz-product-margins-structural-tailwi`,状态 `in_progress`;这是用户中断后的可续传任务,不要靠聊天上下文硬续,先查 `job-status`。

MEMORY.md 这里只保留入口,不再保存 API 端点、目录说明、信息处理细则和周报写作说明。
---

## ⚠️ 已知待处理问题

### Moltbook 备份问题(持续中)
- Moltbook 备份偶发失败(API 返回 HTML),需要后续排查。

### Heartbeat 模型 override 提示(2026-06-22 起)
- OpenClaw 多次提示 `deepseek/deepseek-v4-flash` 不在该 agent allowlist 中,并自动回退到 `openai/gpt-5.5`。
- 这不是任务失败;如后续确实要用 deepseek-v4-flash,需要调整 agent 模型 allowlist(如 `agents.defaults.models`)或改选已允许模型。

### WeChat channel plugin 状态(2026-06-25)
- 官方 `@tencent-weixin/openclaw-weixin@2.4.3` 已重新安装,旧的源码版 `~/.openclaw/extensions/openclaw-weixin` 已移除。
- `scripts/weixin-send-text.mjs` 会自动发现当前 npm 安装的插件路径,并可直接调用 `ilink/bot/sendmessage`;API 直发已验证成功。
- `openclaw channels status` 已确认 `openclaw-weixin 6214e0f129e2-im-bot` enabled/configured/running。WeChat channel plugin 已由 gateway 加载,不再需要额外重启来让插件出现。

---

## 🔧 工具/Skill 设计原则 (2026-03-19)

来源:Anthropic Claude Code 团队 trq212 的实践总结

- **工具要匹配模型能力**:设计 skill 时,想象"模型拿到这个工具能用好吗?",不是越多越好
- **定期审视必要性**:随着模型能力提升,旧工具可能变成累赘而非助力--每隔一段时间问"这个 skill 还有必要吗?"
- 帮 Tianshu 设计新 skill 时,用这个框架评估,而不只是"能实现这个功能吗"

---

## 📝 备注

- Tianshu 喜欢用中文交流
- 技术能力强,熟悉 Docker/网络
- Platts 专业术语: MOC=收盘评估, MOPS=普氏均价, bids=买盘, offers=卖盘

---

## 🎤 语音转文字

详见 `skills/voice-transcribe/SKILL.md`(Whisper,WhatsApp 语音自动触发)

---

## 📅 Google Calendar

详见 `skills/calendar/SKILL.md`(dtsdts@gmail.com 主日历,Service Account 认证)

---

## 🛢️ 市场交易信息

详见 `skills/market-trades/SKILL.md`。原始与汇总数据存放在 `reports/market-trades/`。
---

## 🔌 本地工具与外部服务索引

- Home Assistant / WLED:详见 `skills/homeassistant/SKILL.md`,本地设备细节留在 `TOOLS.md`
- Torrent 下载:详见 `skills/torrent-downloader/SKILL.md`
- Twilio 语音:详见 `skills/twilio-voice/SKILL.md`
- Gmail:详见 `skills/gmail/SKILL.md`
- 本地 LLM:详见 `skills/local-llm/SKILL.md` 和 `TOOLS.md`。Ollama 位于 `192.168.1.101:11434`;OpenAI-compatible llama endpoint 位于 `192.168.1.101:8000/v1`,已注册为 OpenClaw 模型 `local-llama/llama` / alias `Local Llama`,provider timeout 为 600 秒。

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
| 2008 | 市场日报 | 否 | 历史 topic,MOC 已迁走 |

### 功能配置
- **streaming**: partial
- **ackReaction**: 👀
- **replyToMode**: first
- **inlineButtons**: all
- **sticker**: 已启用
- **customCommands**: /status, /cron, /email, /weather, /search
- **removeAckAfterReply**: true

### Reaction 使用原则
- 有意义时才加(确认、庆祝、幽默),不刷屏
- 支持的: 👍 ❤️ 🔥 🎉 👀 😂 等

### 归档说明
- OilClaw 商业化与 onboarding 历史内容已归档到 `memory/2026-04-23-oilclaw-archive.md`
- 旧的"系统调整"按时间记录方式已停用,相关实现细节应放在对应技能、脚本或 TOOLS.md 中

---

## 🛢️ refined products / cracking margin 方法论索引

- Singapore Mogas / GO 10ppm / Jet Kero / MTBE:详见 `skills/mogas-moc-report/`
- Dubai Cracking Margin (DBSCM00):详见 `skills/crude-cracking-margin/`
- MEMORY.md 只保留索引和稳定结论,不再保存大段研究过程、公式推导和阶段性验证表。

## Promoted From Short-Term Memory (2026-07-21)

<!-- openclaw-memory-promotion:memory:memory/2026-07-17.md:5:8 -->
- 18:03-18:10 SGT - PCAAT00 Hchen false timeout after successful send: Tianshu asked why `PCAAT00 Daily to Hchen (v3)` still ran and timed out after Hchen had already received the 17:00 WhatsApp message.; Live cron `b8d63969-e316-4431-8ab9-62fabced55df` was enabled with schedule `0,10,20 17,18 * * 1-5` Asia/Singapore, so it intentionally kept polling at 17:10/17:20/18:00/18:10/18:20 to catch late Platts publication.; `.cache/pcaat00/state.json` confirmed successful send to Hchen at `2026-07-17T09:00:24.401Z` (17:00:24 SGT), with `mod=2026-07-17T08:36:49`.... [score=0.806 recalls=0 avg=0.620 source=memory/2026-07-17.md:5-8]
<!-- openclaw-memory-promotion:memory:memory/2026-07-17.md:9:11 -->
- 18:03-18:10 SGT - PCAAT00 Hchen false timeout after successful send: Adjusted the job:; `failureAlert.after` from `1` to `3`, to reduce false alerts from post-send NO_REPLY polling.; schedule from `0,10,20 17,18 * * 1-5` to `0,10,20,30,40,50 17 * * 1-5`, keeping a 17:00-17:50 retry window while preventing 18:00+ runs after a typical successful send. [score=0.806 recalls=0 avg=0.620 source=memory/2026-07-17.md:9-11]
