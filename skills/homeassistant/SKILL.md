---
name: homeassistant
version: 1.1.0
description: 控制 Home Assistant 智能家居设备（灯、开关、传感器、场景等）
---

# Home Assistant 技能

通过 Home Assistant REST API 控制智能家居设备。

## ⚠️ 安全规则

### 🔒 只读设备 (禁止控制)

| 设备 | 类型 | 原因 |
|------|------|------|
| `*p1s_01p09c4a2500122*` | Bambu P1S 3D打印机 | 可读取状态，禁止控制 |
| `climate.ma_20wod` | **热水器** | 只读，禁止修改状态和设置 |

### ⚡ Hue 灯 → Aqara 开关映射

Hue 灯在 Aqara 开关后面，如果灯显示 `unavailable`，需要先开启对应的 Aqara 开关。

| Hue 灯 | Aqara 开关 | 备注 |
|--------|-----------|------|
| light.tv_l1, light.tv_l2, light.tv_r1, light.tv_r2 | *(待补充)* | TV 后方 Hue Play |
| light.dining_1/2/3/4 | *(待补充)* | 餐厅灯 |
| light.pantry_1/2/3 | *(待补充)* | 储藏室灯 |
| light.living_4 | *(待补充)* | 客厅灯 |
| light.hue_play_gradient_lightstrip | *(待补充)* | 电视灯带 |

**注意**: 当 Hue 灯返回 `unavailable` 时，提示用户检查 Aqara 开关是否打开。

## 配置

配置文件: `.config/homeassistant/config.json`

## 设备总览 (2026-02-16)

### Hue 控制策略

- Hue 已集成到 HA，场景从 Hue 同步过来
- **统一通过 HA 控制 Hue**，不要同时在 Hue 和 HA 重复调整
- 场景修改在 Hue App 中进行，HA 会自动同步

### 可控制设备

| 类型 | 数量 | 示例 |
|------|------|------|
| light | 22 | Hue 灯 (需配合 Aqara 开关) |
| switch | 22 | Aqara 开关、WLED 等 |
| scene | 15 | Hue 场景 (从 Hue 同步) |
| media_player | 1 | Apple TV |
| remote | 1 | Apple TV 遥控 |

### 只读设备

| 类型 | 数量 | 说明 |
|------|------|------|
| sensor | 95 | 各类传感器 |
| binary_sensor | 13 | 二元传感器 |
| camera | 1 | 打印机摄像头 |
| climate | 1 | **热水器 MA-20WOD** (禁止控制) |
| fan | 3 | 打印机风扇 (禁止控制) |
| device_tracker | 2 | iPhone、手机位置 |
| weather | 1 | 天气预报 |

### 设备状态说明

| 状态 | 含义 |
|------|------|
| `on` / `off` | 正常在线 |
| `unavailable` | 离线（Hue 灯可能是 Aqara 开关关了） |
| `unknown` | 未知状态 |

## 常用命令

```bash
# 列出设备
node scripts/ha.mjs list light
node scripts/ha.mjs list switch
node scripts/ha.mjs list scene
node scripts/ha.mjs list sensor
node scripts/ha.mjs list climate

# 控制灯
node scripts/ha.mjs turn_on light.living_room
node scripts/ha.mjs turn_off light.living_room
node scripts/ha.mjs brightness light.living_room 128

# 激活场景
node scripts/ha.mjs scene scene.living_room_relax

# Apple TV
node scripts/ha.mjs call media_player media_pause '{"entity_id":"media_player.apple_tv_samsung_s95c"}'
node scripts/ha.mjs call media_player media_play '{"entity_id":"media_player.apple_tv_samsung_s95c"}'
```

## 主要场景

| Scene | 名称 | 效果 |
|-------|------|------|
| scene.living_room_relax | 放松 | 暖色调 |
| scene.living_room_energize | 提神 | 冷白光 |
| scene.living_room_concentrate | 专注 | 工作光 |
| scene.living_room_nightlight | 夜灯 | 暗淡 |
| scene.living_room_miami | Miami | 彩色氛围 |
| scene.living_room_read | 阅读 | 阅读光 |

## Bambu P1S 打印机 (只读)

可以读取以下信息：
- `sensor.p1s_*_nozzle_temperature` - 喷嘴温度
- `sensor.p1s_*_bed_temperature` - 热床温度
- `sensor.p1s_*_print_progress` - 打印进度
- `sensor.p1s_*_print_status` - 打印状态
- `sensor.p1s_*_current_stage` - 当前阶段
- `binary_sensor.p1s_*_online` - 是否在线
- `camera.p1s_*_camera` - 摄像头

**禁止操作**: 暂停、恢复、停止打印，调节温度、风扇等。

## 待完善

- [ ] 补充 Hue 灯 → Aqara 开关映射
- [ ] 添加 WLED 灯带配置
- [ ] 空调自动化规则
- [ ] Apple TV 快捷控制
