# TOOLS.md - Local Notes

Skills define *how* tools work. This file is for *your* specifics — the stuff that's unique to your setup.

---

## Philips Hue (openhue CLI)

**Bridge IP:** 192.168.1.56
**Config:** `/home/node/.openhue/config.yaml`

### Room: Living Room
ID: `8c5e7e1e-39bc-40cc-89c3-f5f8881d2cbc`

### Lights (14 total)
| Name | ID | Type |
|------|------|------|
| TV R2 | 2351e1cc-... | Hue Play |
| TV L2 | a4fb6edc-... | Hue Play |
| TV L1 | 70bc3bdc-... | Hue Play |
| TV R1 | 989e2e21-... | Hue Play |
| Pantry 1 | 4693b1f6-... | Ceiling Spot |
| Pantry 2 | 9d37e7d8-... | Ceiling Spot |
| Pantry 3 | 23e3ee1f-... | Ceiling Spot |
| Dining 1 | 60ed67bb-... | Ceiling Spot |
| Dining 2 | 7f3c5b58-... | Ceiling Spot |
| Dining 3 | db8cfb86-... | Ceiling Spot |
| Dining 4 | ee37ad6f-... | Ceiling Spot |
| Living 4 | ce431a5b-... | Ceiling Spot |
| Hue play gradient lightstrip | d81b1d9b-... | Gradient Strip |

### Scenes (常用)
- **Relax** - 放松暖光
- **Energize** - 提神冷光
- **Concentrate** - 工作专注
- **Read** - 阅读模式
- **Nightlight** - 夜灯
- **Miami** - 彩色氛围

### 快捷命令
```bash
# 查看所有灯
openhue get lights

# 整个房间开/关
openhue set room "Living room" --on
openhue set room "Living room" --off

# 房间亮度 (0-100)
openhue set room "Living room" --brightness 50

# 激活场景
openhue set scene Miami
openhue set scene Relax

# 单个灯设置颜色 (RGB hex)
openhue set light "TV R1" --rgb "#FF6B35"

# 带过渡动画
openhue set room "Living room" --brightness 75 --transition-time 3s
```

---

---

## 本地 LLM (Ollama)

**地址:** 192.168.1.101:11434
**脚本:** `scripts/local-llm.mjs`

### 可用模型 (2026-02-15 测试)

| 模型 | 速度 | 适用场景 |
|------|------|----------|
| `qwen3:4b` ⭐ | 17 t/s | **日常推荐**，中文最佳 |
| `huihui_ai/qwen3-abliterated:8b` | 10 t/s | 备用，质量更高 |

**默认模型:** `qwen3:4b`

### 用途
- 批量翻译（省 token）
- 简单文本摘要
- 预分类

### 质量控制 ⚠️
**低密度抽检，跨场景覆盖**
- 不是每次都检，但要随机验证输出质量
- 翻译/摘要/分类等不同任务都要抽到
- 发现明显偏差时立即通知用户
- 节约 token 的前提是质量可靠

### 触发告警的情况
- 翻译明显错误或丢失关键信息
- 摘要遗漏重要内容
- 分类结果与内容不符
- 输出格式异常
- 响应时间异常

---

## Why Separate?

Skills are shared. Your setup is yours. Keeping them apart means you can update skills without losing your notes, and share skills without leaking your infrastructure.

---

Add whatever helps you do your job. This is your cheat sheet.

---

## Home Assistant 智能家居

**地址:** http://192.168.1.101:8123
**脚本:** `scripts/ha.mjs`
**配置:** `.config/homeassistant/config.json`

### 快捷命令
```bash
# 列出设备
node scripts/ha.mjs list light
node scripts/ha.mjs list switch
node scripts/ha.mjs list scene

# 控制灯
node scripts/ha.mjs turn_on light.living_room
node scripts/ha.mjs turn_off light.living_room
node scripts/ha.mjs brightness light.living_room 128

# 激活场景
node scripts/ha.mjs scene scene.living_room_relax
```

### 主要设备
- **客厅灯:** light.living_room (整体), light.tv_l1/l2/r1/r2, light.dining_1-4, light.pantry_1-3
- **场景:** Relax, Energize, Concentrate, Nightlight, Miami 等
- **3D打印机:** P1S (Bambu Lab)

---

## WLED 灯带

**脚本:** `scripts/wled.mjs`
**固件:** 全部 0.15.3

### 设备
| 名称 | IP | LED | 分段 | 备注 |
|------|-----|-----|------|------|
| AP1 | 192.168.1.143 | 78 | 1 | RGBW |
| AP2 | 192.168.1.144 | 328 | 4 | 三段灯带 |
| AP4 | 192.168.1.140 | 254 | 1 | 🔒 厨房灯，勿改 |
| AP3 | ? | ? | ? | ⚠️ 待修复 |

### 启动预设
- **AP1/AP2**: 预设2 "Chinese new year" 🧧
- **AP4**: 预设9 "Kitchen White" (RGB纯白)
- **AP4 紧急**: 预设10 "Emergency Alert" (红色闪烁)

### 常用命令
```bash
node scripts/wled.mjs status              # 查看所有设备
node scripts/wled.mjs effect fire ap2     # 火焰效果
node scripts/wled.mjs effect rainbow all  # 全部彩虹
node scripts/wled.mjs color "#FF6B35" ap1 # 设置颜色
node scripts/wled.mjs brightness 128 all  # 半亮度
node scripts/wled.mjs demo ap2            # 演示各种效果
node scripts/wled.mjs emergency           # AP4紧急警示
node scripts/wled.mjs emergency off       # 恢复AP4正常
```

### 统一灯光控制 (Hue + WLED)
```bash
node scripts/lights.mjs scenes            # 查看场景
node scripts/lights.mjs scene relax       # 激活场景
node scripts/lights.mjs all-off           # 全关(不含AP4)
```

### 分段控制 (AP2)
```bash
# 每段不同效果
node scripts/wled.mjs segment 0 '{"fx":66,"pal":35}' ap2  # 火焰
node scripts/wled.mjs segment 1 '{"fx":9,"pal":5}' ap2    # 彩虹
node scripts/wled.mjs segment 2 '{"fx":113}' ap2          # 极光
```

### 灯光控制原则
- **必须同步启动**: 所有命令准备好后并行发送 (`&` + `wait`)，确保同时生效
- **效果可以不统一**: 不同灯/灯带可用不同颜色或效果
- **AP2 有 4 段**: id 0-3，每段需单独设置

### 效果 ID 速查 (WLED 0.15.3)
- 0: Solid | 9: Rainbow | 12: Fade | 38: Aurora
- 42: Fireworks | 45: Rain | 66: Fire Flicker
- 87: Glitter ✨ | 103: Solid Glitter
- 速度参数 sx: 0-255，越低越慢（推荐 80 为适中）

---

## Twilio 电话

**号码**: +1 659-999-9681
**脚本**: `scripts/twilio-voice.mjs`

### 命令
```bash
node scripts/twilio-voice.mjs call <号码> <消息>  # 打电话
node scripts/twilio-voice.mjs status              # 账户状态
node scripts/twilio-voice.mjs calls               # 通话记录
```

### 示例
```bash
node scripts/twilio-voice.mjs call +6592716786 "你好，这是测试消息"
```

### 注意
- 试用账户只能打给已验证号码
- 接听方需按任意键跳过试用提示

---

## Platts Structured Heards API

**端点**: `https://api.platts.com/structured-heards/v1/`
**脚本**: `scripts/platts-structured-heards.mjs`

### 快捷命令
```bash
# 列出市场
node scripts/platts-structured-heards.mjs markets

# 字段定义
node scripts/platts-structured-heards.mjs metadata

# 交易数据 (表格)
node scripts/platts-structured-heards.mjs table "Asia crude oil" --type=Trade --limit=20

# 交易数据 (详情)
node scripts/platts-structured-heards.mjs heards "Americas crude oil" --days=7

# 导出为 JSON
node scripts/platts-structured-heards.mjs export "Asia crude oil"
```

### 可用市场 (2026-02 验证)
| 市场 | 记录数 | 特点 |
|------|--------|------|
| Americas crude oil | 19,885 | **最完整**，有 volume/location |
| Asia crude oil | 935 | 亚洲原油交易 |
| Platts Carbon | 14,953 | 碳信用交易 |
| EMEA crude oil | 0 | 暂无数据 |

⚠️ **不含成品油** (汽油/柴油/航煤)

### 核心字段
| 原油 | 碳市场 |
|------|--------|
| heard_type | heard_type |
| grade (油种) | credit_type (项目类型) |
| price (价差) | price |
| pricing_basis | certification_and_standards |
| volume (美洲有) | volume |
| laycan (装期) | vintage (年份) |
| location | - |

---

## Polymarket 预测市场 API

**端点**: `https://gamma-api.polymarket.com/`
**认证**: 无需认证，公开 API

### 常用查询
```bash
# 按事件 slug 查询
curl -s "https://gamma-api.polymarket.com/events?slug=will-iran-close-the-strait-of-hormuz-by-2027"

# 按事件 slug 查询 (Israel-Iran)
curl -s "https://gamma-api.polymarket.com/events?slug=israel-x-iran-ceasefire-broken-by"

# 活跃市场列表
curl -s "https://gamma-api.polymarket.com/markets?closed=false&limit=100"
```

### 返回字段
| 字段 | 含义 |
|------|------|
| outcomePrices | 当前概率 [Yes, No] |
| volume | 总交易量 ($) |
| volume24hr | 24小时交易量 |
| lastTradePrice | 最新成交价 |
| bestBid / bestAsk | 买卖价差 |
| oneDayPriceChange | 24h 变化 |

### 已知关键市场 slug
- `us-strikes-iran-by` - **美国袭击伊朗** (5.25亿美元交易量!)
- `will-iran-close-the-strait-of-hormuz-by-2027` - 霍尔木兹海峡封锁
- `israel-x-iran-ceasefire-broken-by` - 以伊停火打破

---

## 能源单位换算

**石脑油**: 1吨 ≈ 7.3桶
**原油**: 1吨 ≈ 7.33桶 (API 35°左右)
