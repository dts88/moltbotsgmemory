---
name: calendar
description: 查询和管理 Google Calendar 日程事件。触发词：日历、日程、查看日程、添加日程、今天有什么安排、upcoming events、calendar。
---

# Google Calendar

脚本: `scripts/calendar.mjs`
Service Account: saopenclaw@dtsdts.iam.gserviceaccount.com
默认日历: dtsdts@gmail.com（Tianshu 主日历）
凭证: `.config/google/calendar-service-account.json`
配置: `.config/google/calendar-config.json`

## 命令

```bash
node scripts/calendar.mjs today         # 今日日程
node scripts/calendar.mjs week          # 未来7天
node scripts/calendar.mjs add <calId> <title> <start> [end]  # 创建事件
```

时区: Asia/Singapore (GMT+8)
