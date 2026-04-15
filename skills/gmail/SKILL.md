---
name: gmail
description: 发送和读取 Gmail 邮件。触发词：发邮件、查邮件、收件箱、email、gmail、发送邮件。
---

# Gmail

脚本: `scripts/gmail.mjs`
邮箱: openclawsg@gmail.com
凭证: `.config/gmail/credentials.json`
协议: 发送(SMTP) / 读取(IMAP)

## 命令

```bash
node scripts/gmail.mjs test                        # 测试连接
node scripts/gmail.mjs send <to> <subject> <body>  # 发送邮件
node scripts/gmail.mjs inbox [n] [--unseen]        # 读取收件箱
```

## 用途

- 对外沟通渠道
- 接收系统通知
- 自动化邮件处理

## 注意

发送邮件前确认收件人，属于对外行为，需谨慎。
