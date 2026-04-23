# OilClaw 商业化相关归档

归档时间：2026-04-23
原因：Tianshu 明确表示这条商务服务路线预计不会继续推进，不再占用 MEMORY.md 主空间；如后续需要，可从本文件调取。

## OilClaw 商业服务 (2026-03-10)

**Bot**: @OilClaw_bot
**模式**: `dmPolicy: "pairing"` (用户需批准)
**定价**: SGD 49/月，2天免费试用

### 已批准用户
| # | Telegram ID | 名字 | 批准日期 | 到期日期 |
|---|------------|------|---------|---------|
| 1 | 8438057858 | Henry | 2026-03-10 | 2026-05-10 |
| 2 | 7128355985 | InSg | 2026-03-10 | 2026-05-10 |

### 授权规则
- pairing 批准 = 完成授权，不需要额外通知 owner 或二次确认
- 用户通过 pairing 后即可正常使用，按当时的用户权限列表执行
- 不要向 owner 发送新用户访问请求之类的通知
- 到期后需要 owner 手动续期或移除

### 用户权限
- Web 搜索、天气、PDF 分析
- Twitter 搜索（不允许自动跟踪，共享凭证有频率限制）
- EIA API（库存、产量等公开数据）
- 股票查询（A股+美股，scripts/stock.mjs）
- 中国期货数据（scripts/futures.py，AKShare，免认证）
- 市场数据查询（scripts/market.py，AKShare，免认证）
- Polymarket 查询 + 自动监控（用户可自行设置 cron 推送）
- 日历、邮箱工具
- Platts API（包括内部系统凭证）
- 禁止访问个人信息、memory 文件
- 可为自己的账号设置 cron，限权限范围内功能
- 禁止 OpenClaw 系统设置、全局 cron 管理、Torrent、Home Assistant

### 用量追踪
- **脚本**: `scripts/usage-tracker.mjs`
- **日志**: `.config/usage/usage-log.jsonl`
- **命令**: `node scripts/usage-tracker.mjs report|summary|limits`
- **追踪服务**: Claude tokens, Twitter, EIA, Platts, Brave Search, Polymarket, Stock, Gmail
- **per-user 追踪**: 所有脚本支持 `--user=telegramID`
- **11 个脚本已集成**: twitter-monitor, eia-data, eia-weekly-report, platts-insights-monitor, platts-price-data, platts-structured-heards, platts-refresh-token, stock, polymarket-monitor, foiz-monitor, gmail
- **用户级 Cron**: 暂不开放，未来按需设计（需在 payload 中带 --user）

### 用户自带 API Key 规则
- 用户可提供自己的 API key（如 Platts token），存储在 `.config/users/<telegramID>/credentials.json`
- 有自带 key 的服务 → 用用户自己的凭证，不受系统级限制
- 无自带 key 的服务 → 按默认权限判断
- 用量无论用谁的凭证都要追踪

### Bot 设置
- **Description**: AI energy market intelligence (原油/成品油/LNG/地缘政治)
- **菜单命令**: /start, /help, /guide, /subscribe
- **文本命令**: /new, /status, /whoami
- **native=false**: 隐藏内置命令菜单
- **nativeSkills=false**: 隐藏 skill 命令
- **订阅数据**: `.config/oilclaw/subscribers.json`
- **allowFrom 文件**: `/home/node/.openclaw/credentials/telegram-oilclaw-allowFrom.json`

### 命令响应规范
- /start: 欢迎消息 + 功能概览 + 可用命令列表
- /help: 详细命令说明
- /guide: 创建 Telegram 群组 + 开启 Topics + 设置 bot 为 admin 的步骤
- /subscribe: 读取 subscribers.json，显示当前用户的订阅状态、有效期、续期方式

## OilClaw Onboarding 文案 (2026-03-13)
- `clients/onboarding-flow.md`：`Free trial: 2 days` → `Trial: 2 days`（去掉 Free 字样）
