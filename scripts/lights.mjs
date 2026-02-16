#!/usr/bin/env node
/**
 * 统一灯光控制 - Hue + WLED 协调
 * 
 * 用法:
 *   node scripts/lights.mjs scene <name>      # 激活场景 (Hue + WLED 联动)
 *   node scripts/lights.mjs scenes            # 列出可用场景
 *   node scripts/lights.mjs status            # 查看所有灯状态
 *   node scripts/lights.mjs all-off           # 全部关闭 (不含AP4厨房)
 *   node scripts/lights.mjs all-on            # 全部打开
 * 
 * 场景会同时调整 Hue 和 WLED (AP1/AP2/AP3)，AP4 厨房灯独立不受影响
 */

import { execSync } from 'child_process';
import { readFileSync } from 'fs';

const WLED_DEVICES = {
  ap1: '192.168.1.143',
  ap2: '192.168.1.144',
  // ap3: 待修复
  // ap4: 厨房灯，独立控制
};

// 场景定义：Hue场景名 -> WLED配置
const SCENES = {
  relax: {
    hue: 'Relax',
    wled: { fx: 0, col: [[255, 180, 100, 50]], bri: 150, sx: 0 },
    desc: '放松暖光'
  },
  energize: {
    hue: 'Energize',
    wled: { fx: 0, col: [[200, 220, 255, 100]], bri: 255, sx: 0 },
    desc: '提神冷光'
  },
  concentrate: {
    hue: 'Concentrate',
    wled: { fx: 0, col: [[255, 255, 255, 128]], bri: 255, sx: 0 },
    desc: '工作专注'
  },
  nightlight: {
    hue: 'Nightlight',
    wled: { fx: 0, col: [[255, 100, 50, 0]], bri: 30, sx: 0 },
    desc: '夜灯模式'
  },
  miami: {
    hue: 'Miami',
    wled: { fx: 9, pal: 5, bri: 200, sx: 100 },  // Rainbow effect
    desc: '迈阿密彩色'
  },
  movie: {
    hue: null,  // 关闭 Hue
    wled: { fx: 0, col: [[50, 30, 80, 0]], bri: 40, sx: 0 },
    desc: '观影模式'
  },
  party: {
    hue: null,
    wled: { fx: 90, pal: 6, bri: 255, sx: 200 },  // Fireworks
    desc: '派对模式'
  },
  aurora: {
    hue: 'Relax',
    wled: { fx: 113, pal: 48, bri: 180, sx: 60 },  // Aurora effect
    desc: '极光氛围'
  },
  fire: {
    hue: null,
    wled: { fx: 66, pal: 35, bri: 200, sx: 150 },  // Fire effect
    desc: '壁炉火焰'
  },
  ocean: {
    hue: 'Relax',
    wled: { fx: 101, pal: 7, bri: 180, sx: 80 },  // Pacifica
    desc: '海洋波浪'
  }
};

async function wledRequest(ip, data) {
  try {
    const res = await fetch(`http://${ip}/json/state`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return await res.json();
  } catch (e) {
    return { error: e.message };
  }
}

async function setScene(sceneName) {
  const scene = SCENES[sceneName.toLowerCase()];
  if (!scene) {
    console.error(`未知场景: ${sceneName}`);
    console.log('可用场景:', Object.keys(SCENES).join(', '));
    process.exit(1);
  }

  console.log(`🎨 激活场景: ${sceneName} - ${scene.desc}`);

  // 1. 设置 Hue 场景 (如果有)
  if (scene.hue) {
    try {
      execSync(`node scripts/ha.mjs scene scene.living_room_${scene.hue.toLowerCase()}`, { stdio: 'pipe' });
      console.log(`  ✓ Hue: ${scene.hue}`);
    } catch (e) {
      console.log(`  ⚠ Hue 场景未找到或失败`);
    }
  } else {
    // 关闭 Hue
    try {
      execSync(`node scripts/ha.mjs turn_off light.living_room`, { stdio: 'pipe' });
      console.log(`  ✓ Hue: 已关闭`);
    } catch (e) {}
  }

  // 2. 设置 WLED (AP1, AP2) - AP4 不动
  const wledState = {
    on: true,
    bri: scene.wled.bri || 200,
    seg: [{
      fx: scene.wled.fx || 0,
      pal: scene.wled.pal || 0,
      sx: scene.wled.sx || 128,
      ix: scene.wled.ix || 128,
      ...(scene.wled.col ? { col: scene.wled.col } : {})
    }]
  };

  for (const [name, ip] of Object.entries(WLED_DEVICES)) {
    const result = await wledRequest(ip, wledState);
    if (result.error) {
      console.log(`  ⚠ WLED-${name.toUpperCase()}: 离线`);
    } else {
      console.log(`  ✓ WLED-${name.toUpperCase()}: 已设置`);
    }
  }

  console.log('✅ 场景激活完成');
}

async function listScenes() {
  console.log('可用场景:\n');
  for (const [name, scene] of Object.entries(SCENES)) {
    const hueInfo = scene.hue ? `Hue:${scene.hue}` : 'Hue:关';
    console.log(`  ${name.padEnd(12)} - ${scene.desc} (${hueInfo})`);
  }
}

async function status() {
  console.log('=== 灯光状态 ===\n');
  
  // Hue 状态
  console.log('Hue:');
  try {
    const output = execSync('node scripts/ha.mjs list light | grep -E "living|dining|pantry|tv_"', { encoding: 'utf8' });
    console.log(output);
  } catch (e) {
    console.log('  无法获取 Hue 状态');
  }

  // WLED 状态
  console.log('WLED:');
  for (const [name, ip] of Object.entries(WLED_DEVICES)) {
    try {
      const res = await fetch(`http://${ip}/json/state`);
      const state = await res.json();
      console.log(`  ${name.toUpperCase()}: ${state.on ? '开' : '关'} | 亮度:${state.bri}`);
    } catch (e) {
      console.log(`  ${name.toUpperCase()}: 离线`);
    }
  }
}

async function allOff() {
  console.log('关闭所有灯光 (AP4厨房灯除外)...');
  
  // Hue
  try {
    execSync('node scripts/ha.mjs turn_off light.living_room', { stdio: 'pipe' });
    console.log('  ✓ Hue 已关闭');
  } catch (e) {}

  // WLED (不含 AP4)
  for (const [name, ip] of Object.entries(WLED_DEVICES)) {
    await wledRequest(ip, { on: false });
    console.log(`  ✓ WLED-${name.toUpperCase()} 已关闭`);
  }
}

async function allOn() {
  console.log('打开所有灯光...');
  
  // Hue - 使用 Relax 场景
  try {
    execSync('node scripts/ha.mjs scene scene.living_room_relax', { stdio: 'pipe' });
    console.log('  ✓ Hue: Relax 场景');
  } catch (e) {}

  // WLED - 使用默认暖白
  for (const [name, ip] of Object.entries(WLED_DEVICES)) {
    await wledRequest(ip, { 
      on: true, 
      bri: 200,
      seg: [{ fx: 0, col: [[255, 200, 150, 50]] }]
    });
    console.log(`  ✓ WLED-${name.toUpperCase()} 已打开`);
  }
}

// 主入口
const [,, cmd, ...args] = process.argv;

switch (cmd) {
  case 'scene':
    await setScene(args[0] || 'relax');
    break;
  case 'scenes':
    await listScenes();
    break;
  case 'status':
    await status();
    break;
  case 'all-off':
  case 'off':
    await allOff();
    break;
  case 'all-on':
  case 'on':
    await allOn();
    break;
  default:
    console.log(`
统一灯光控制 (Hue + WLED)

用法:
  node scripts/lights.mjs scene <name>      # 激活场景
  node scripts/lights.mjs scenes            # 列出可用场景
  node scripts/lights.mjs status            # 查看状态
  node scripts/lights.mjs all-off           # 全部关闭
  node scripts/lights.mjs all-on            # 全部打开

注意: AP4 厨房灯独立控制，不受场景影响
`);
}
