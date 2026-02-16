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

### 效果 ID 速查
- 0: Solid | 9: Rainbow | 66: Fire | 90: Fireworks
- 94: Meteor | 101: Pacifica | 113: Aurora

---

## 能源单位换算

**石脑油**: 1吨 ≈ 7.3桶
**原油**: 1吨 ≈ 7.33桶 (API 35°左右)
