---
name: twilio-voice
description: 通过 Twilio 拨打电话并播报语音消息。触发词：打电话、拨打电话、语音通知、电话播报。
---

# Twilio Voice

脚本: `scripts/twilio-voice.mjs`
号码: +1 659-999-9681
凭证: `.config/twilio/credentials.json`

## 命令

```bash
node scripts/twilio-voice.mjs call <号码> <消息>  # 拨打电话
node scripts/twilio-voice.mjs status              # 账户状态
node scripts/twilio-voice.mjs calls               # 通话记录
```

## 使用限制

- 试用账户: 只能拨打已验证号码（+6592716786）
- 接听方需按任意键才能听到消息
- 升级付费账户后限制解除

## 适用场景

- 紧急语音通知（无法看手机时）
- 重要提醒的语音播报
