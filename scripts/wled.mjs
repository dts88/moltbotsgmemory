#!/usr/bin/env node
/**
 * WLED 控制脚本 - 直接控制 ESP32 LED 灯带
 * 
 * 用法:
 *   node scripts/wled.mjs status [device]           # 查看状态
 *   node scripts/wled.mjs on [device]               # 开灯
 *   node scripts/wled.mjs off [device]              # 关灯
 *   node scripts/wled.mjs brightness <0-255> [dev]  # 设置亮度
 *   node scripts/wled.mjs effect <id> [device]      # 设置效果
 *   node scripts/wled.mjs color <hex> [device]      # 设置颜色
 *   node scripts/wled.mjs preset <id> [device]      # 加载预设
 *   node scripts/wled.mjs effects [device]          # 列出效果
 *   node scripts/wled.mjs palettes [device]         # 列出调色板
 *   node scripts/wled.mjs segment <id> <json> [dev] # 控制分段
 *   node scripts/wled.mjs sync [device]             # 开启同步
 *   node scripts/wled.mjs demo [device]             # 演示模式
 * 
 * device: ap1, ap2, ap4 或 all (默认 all)
 */

const DEVICES = {
  ap1: { ip: '192.168.1.143', name: 'WLED-AP1', leds: 78 },
  ap2: { ip: '192.168.1.144', name: 'WLED-AP2', leds: 328, segments: 4 },
  ap4: { ip: '192.168.1.140', name: 'WLED-AP4', leds: 254 },
};

// 常用效果 ID
const EFFECTS = {
  solid: 0,
  blink: 1,
  breathe: 2,
  wipe: 3,
  rainbow: 9,
  scan: 10,
  chase: 28,
  colorful: 37,
  fire: 66,
  fireworks: 90,
  meteor: 94,
  glitter: 98,
  pacifica: 101,
  aurora: 113,
  twinkle: 74,
  sparkle: 71,
  flow: 109,
};

// 常用调色板 ID
const PALETTES = {
  default: 0,
  random: 1,
  rainbow: 5,
  ocean: 7,
  heat: 35,
  forest: 8,
  party: 6,
  lava: 36,
  sunset: 48,
};

async function wledRequest(ip, path, data = null) {
  const url = `http://${ip}${path}`;
  const opts = {
    method: data ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json' },
  };
  if (data) opts.body = JSON.stringify(data);
  
  try {
    const res = await fetch(url, opts);
    return await res.json();
  } catch (e) {
    return { error: e.message };
  }
}

function getDevices(device) {
  if (!device || device === 'all') return Object.entries(DEVICES);
  const d = DEVICES[device.toLowerCase().replace('wled-', '').replace('ap', 'ap')];
  if (!d) {
    console.error(`未知设备: ${device}`);
    console.error('可用设备: ap1, ap2, ap4, all');
    process.exit(1);
  }
  return [[device.toLowerCase().replace('wled-', '').replace('ap', 'ap'), d]];
}

async function status(device) {
  const devices = getDevices(device);
  for (const [name, dev] of devices) {
    const info = await wledRequest(dev.ip, '/json/info');
    const state = await wledRequest(dev.ip, '/json/state');
    
    if (info.error) {
      console.log(`\n❌ ${dev.name} (${dev.ip}): 离线`);
      continue;
    }
    
    console.log(`\n✅ ${info.name} (${dev.ip})`);
    console.log(`   版本: ${info.ver} | LED: ${info.leds.count} | 信号: ${info.wifi?.signal || '?'}%`);
    console.log(`   状态: ${state.on ? '开' : '关'} | 亮度: ${state.bri}/255`);
    console.log(`   分段: ${state.seg?.length || 1} | 当前效果: #${state.seg?.[0]?.fx || '?'}`);
  }
}

async function power(device, on) {
  const devices = getDevices(device);
  for (const [name, dev] of devices) {
    const result = await wledRequest(dev.ip, '/json/state', { on });
    console.log(`${dev.name}: ${on ? '已开启' : '已关闭'}`);
  }
}

async function brightness(level, device) {
  const bri = Math.min(255, Math.max(0, parseInt(level)));
  const devices = getDevices(device);
  for (const [name, dev] of devices) {
    await wledRequest(dev.ip, '/json/state', { bri });
    console.log(`${dev.name}: 亮度设为 ${bri}/255`);
  }
}

async function effect(effectId, device) {
  // 支持名称或 ID
  const fx = EFFECTS[effectId.toLowerCase()] ?? parseInt(effectId);
  const devices = getDevices(device);
  for (const [name, dev] of devices) {
    await wledRequest(dev.ip, '/json/state', { seg: [{ fx }] });
    console.log(`${dev.name}: 效果设为 #${fx}`);
  }
}

async function color(hex, device) {
  // 解析 hex 颜色 (#RRGGBB 或 #RRGGBBWW)
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const w = h.length > 6 ? parseInt(h.slice(6, 8), 16) : 0;
  
  const devices = getDevices(device);
  for (const [name, dev] of devices) {
    await wledRequest(dev.ip, '/json/state', { 
      seg: [{ col: [[r, g, b, w]] }] 
    });
    console.log(`${dev.name}: 颜色设为 #${h}`);
  }
}

async function preset(presetId, device) {
  const ps = parseInt(presetId);
  const devices = getDevices(device);
  for (const [name, dev] of devices) {
    await wledRequest(dev.ip, '/json/state', { ps });
    console.log(`${dev.name}: 预设 #${ps} 已加载`);
  }
}

async function listEffects(device) {
  const devices = getDevices(device);
  const dev = devices[0][1];
  const effects = await wledRequest(dev.ip, '/json/effects');
  console.log('可用效果:');
  effects.forEach((name, i) => {
    if (name && name !== '-') console.log(`  ${i.toString().padStart(3)}: ${name}`);
  });
}

async function listPalettes(device) {
  const devices = getDevices(device);
  const dev = devices[0][1];
  const palettes = await wledRequest(dev.ip, '/json/palettes');
  console.log('可用调色板:');
  palettes.forEach((name, i) => {
    if (name) console.log(`  ${i.toString().padStart(2)}: ${name}`);
  });
}

async function segment(segId, json, device) {
  const seg = JSON.parse(json);
  seg.id = parseInt(segId);
  const devices = getDevices(device);
  for (const [name, dev] of devices) {
    await wledRequest(dev.ip, '/json/state', { seg: [seg] });
    console.log(`${dev.name}: 分段 ${segId} 已更新`);
  }
}

async function sync(device) {
  const devices = getDevices(device);
  for (const [name, dev] of devices) {
    await wledRequest(dev.ip, '/json/state', { 
      udpn: { send: true, recv: true } 
    });
    console.log(`${dev.name}: 同步已开启`);
  }
}

async function emergency(on = true) {
  // AP4 厨房灯紧急警示 - 仅用于火灾/煤气等紧急情况
  const dev = DEVICES.ap4;
  if (on) {
    await wledRequest(dev.ip, '/json/state', { ps: 10 }); // Emergency Alert preset
    console.log('🚨 AP4 紧急警示已启动！');
  } else {
    await wledRequest(dev.ip, '/json/state', { ps: 9 }); // Kitchen White preset
    console.log('✅ AP4 已恢复正常');
  }
}

async function demo(device) {
  console.log('🎆 演示模式 - 展示各种效果');
  const effects = [
    { name: 'Rainbow', fx: 9, pal: 5 },
    { name: 'Fire', fx: 66, pal: 35 },
    { name: 'Aurora', fx: 113, pal: 48 },
    { name: 'Pacifica', fx: 101, pal: 7 },
    { name: 'Meteor', fx: 94, pal: 1 },
  ];
  
  const devices = getDevices(device);
  for (const e of effects) {
    console.log(`\n▶ ${e.name} (效果 #${e.fx}, 调色板 #${e.pal})`);
    for (const [name, dev] of devices) {
      await wledRequest(dev.ip, '/json/state', { 
        on: true,
        seg: [{ fx: e.fx, pal: e.pal, sx: 128, ix: 128 }] 
      });
    }
    await new Promise(r => setTimeout(r, 5000));
  }
  console.log('\n✅ 演示完成');
}

// 主入口
const [,, cmd, ...args] = process.argv;

switch (cmd) {
  case 'status':
    await status(args[0]);
    break;
  case 'on':
    await power(args[0], true);
    break;
  case 'off':
    await power(args[0], false);
    break;
  case 'brightness':
  case 'bri':
    await brightness(args[0], args[1]);
    break;
  case 'effect':
  case 'fx':
    await effect(args[0], args[1]);
    break;
  case 'color':
  case 'col':
    await color(args[0], args[1]);
    break;
  case 'preset':
  case 'ps':
    await preset(args[0], args[1]);
    break;
  case 'effects':
    await listEffects(args[0]);
    break;
  case 'palettes':
    await listPalettes(args[0]);
    break;
  case 'segment':
  case 'seg':
    await segment(args[0], args[1], args[2]);
    break;
  case 'sync':
    await sync(args[0]);
    break;
  case 'demo':
    await demo(args[0]);
    break;
  case 'emergency':
    await emergency(args[0] !== 'off');
    break;
  default:
    console.log(`
WLED 控制脚本

用法:
  node scripts/wled.mjs status [device]           # 查看状态
  node scripts/wled.mjs on [device]               # 开灯
  node scripts/wled.mjs off [device]              # 关灯
  node scripts/wled.mjs brightness <0-255> [dev]  # 设置亮度
  node scripts/wled.mjs effect <id|name> [device] # 设置效果
  node scripts/wled.mjs color <hex> [device]      # 设置颜色
  node scripts/wled.mjs preset <id> [device]      # 加载预设
  node scripts/wled.mjs effects [device]          # 列出效果
  node scripts/wled.mjs palettes [device]         # 列出调色板
  node scripts/wled.mjs segment <id> <json> [dev] # 控制分段
  node scripts/wled.mjs sync [device]             # 开启同步
  node scripts/wled.mjs demo [device]             # 演示模式
  node scripts/wled.mjs emergency [on|off]        # AP4紧急警示(仅紧急情况)

设备: ap1, ap2, ap4, all (默认 all)

效果名称: ${Object.keys(EFFECTS).join(', ')}
调色板名称: ${Object.keys(PALETTES).join(', ')}

示例:
  node scripts/wled.mjs effect fire ap2
  node scripts/wled.mjs color "#FF6B35" ap1
  node scripts/wled.mjs segment 0 '{"fx":66,"pal":35}' ap2
`);
}
