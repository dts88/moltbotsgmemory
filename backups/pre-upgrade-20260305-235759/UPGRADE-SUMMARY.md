# 升级前备份摘要

**备份时间**: 2026-03-05 23:58 SGT
**当前版本**: 2026.2.14
**目标版本**: 2026.3.2

## 备份内容清单

### 配置文件
- [x] openclaw.json - Gateway 配置

### 工作区文件
- [x] MEMORY.md - 长期记忆
- [x] AGENTS.md - Agent 行为规范
- [x] SOUL.md - 人格设定
- [x] USER.md - 用户信息
- [x] TOOLS.md - 工具配置笔记
- [x] IDENTITY.md - 身份信息
- [x] HEARTBEAT.md - 心跳配置

### 目录
- [x] memory/ - 每日记忆文件 (26 files)
- [x] .config/ - 各种服务凭证和配置

## Cron 任务 (14个)

| 任务 | 频率 | 状态 |
|------|------|------|
| Twitter Monitor | 10min | ✅ |
| Polymarket Monitor | 1h | ✅ |
| Platts Monitor | 50min | ✅ |
| Hormuz Monitor | 4h | ✅ |
| Memory Backup | 每天3:00 | ✅ |
| 报告导入向量化 | 每天3:00 | ✅ |
| 外交部记者会 | 周一至五 16-18点 | ✅ |
| Dubai MOC Report | 周一至五 16:36 | ✅ |
| Moltbook Heartbeat | 2天 | ✅ |
| Cron 安全审计 | 每周日 10:00 | ✅ |
| FOIZ Monitor | 周二三 10:00 | ✅ |
| EIA Weekly | 周三 23:40 | ✅ |
| 新加坡库存周报 | 周四 14:00 | ✅ |
| PLDT Earnings | 2月24-28日 9:00 | ✅ |

## Telegram Topics 配置

| Topic ID | 名称 | 需要@ |
|----------|------|-------|
| 1 | General | 是 |
| 2 | Platts MOC | 否 |
| 7 | 系统管理 | 否 |
| 22 | Email | 否 |

## 重要凭证位置

- Platts: `.config/spglobal/credentials.json`
- Moltbook: `.config/moltbook/credentials.json`
- Twitter: `.twitter-env`
- Gmail: `.config/gmail/credentials.json`
- EIA: `.config/eia/credentials.json`
- Twilio: `.config/twilio/credentials.json`

## 升级后检查清单

- [ ] 版本确认 (应为 2026.3.2)
- [ ] Cron 任务正常运行
- [ ] WhatsApp 连接正常
- [ ] Telegram 连接正常
- [ ] 测试 react 功能是否可用 currentMessageId

---

*备份路径: /home/node/clawd/backups/pre-upgrade-20260305-235759/*
