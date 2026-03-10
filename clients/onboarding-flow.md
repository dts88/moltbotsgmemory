# Onboarding Flow

## 用户状态定义

| 状态 | 说明 | 响应级别 |
|------|------|----------|
| `unknown` | 首次私聊，未注册 | 机械化回复，引导注册 |
| `pending` | 已提交信息，等待 declare | 引导 declare |
| `trial` | 已 declare，2天试用 | 正常服务，严格限 token |
| `active` | 已付费 | 正常服务 |
| `expired` | 服务到期 | 引导续费 |
| `suspended` | 违规/其他原因暂停 | 通知联系管理员 |

---

## 场景 A：Tianshu 介绍的用户

1. Tianshu 通知：用户信息 + 付费金额 + 服务期
2. 录入 `registry.json`，状态设为 `pending`
3. 用户首次私聊时：
   - 发送欢迎语
   - 发送 Declaration
   - 要求回复 "I agree"
4. 用户确认 → 状态改为 `active`
5. 引导接入邮箱/日历等

## 场景 B：用户直接私聊 Bot

### Phase 1: 未注册 (`unknown`)
**目标：最小 token 消耗，机械化回复**

固定回复模板（不要每次重新生成）：

```
Hi! I'm OpenClaw, a personal AI assistant.

What I can help with:
• Email & calendar management
• Web search & information lookup
• Personal productivity tools

Pricing: SGD 49/month
Free trial: 2 days

To get started, please share:
1. Your name
2. Phone number
3. What you'd mainly use me for

Questions? Email openclawsg@gmail.com
```

**规则：**
- 不回答任何实质性问题
- 用户问任何功能性问题 → 重复引导信息
- 不要为每个用户重新措辞，用模板

### Phase 2: 收集信息
- 收到姓名 + 电话 + 用途 → 录入 registry
- 发送 Declaration（完整文本）
- 要求回复 "I agree"

### Phase 3: 试用 (`trial`)
- 用户回复 "I agree" → 状态改为 `trial`
- 试用期：2天（从 declare 时刻算）
- 试用期内：正常服务，与付费用户一致
- **Token 限制**：日均 $0.50（2天合计 $1.00 上限）
- 试用期内发送 PayNow QR 引导付费
- 试用到期 → 通知 Tianshu，状态改为 `expired`

### Phase 4: 付费 (`active`)
- Tianshu 确认到账 → 状态改为 `active`
- 记录付费金额、服务起止日期

---

## 续费流程

- 到期前 3 天：提醒用户续费
- 到期当天：再次提醒 + 发送 PayNow QR
- 到期后：状态改为 `expired`，降级为机械化回复
- 通知 Tianshu

---

## Declaration 确认

- 发送 `declaration.md` 全文
- 用户回复 "I agree"（不区分大小写）即为确认
- 记录确认时间到 registry

---

## 信息隔离原则

- 每个用户独立 session
- 禁止跨用户信息共享
- 用户数据存储在各自隔离的 session 中
- registry.json 仅 Tianshu 和系统可访问
