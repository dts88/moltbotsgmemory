#!/usr/bin/env node
/**
 * Home Assistant 控制脚本
 * 用法: node scripts/ha.mjs <command> [args...]
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(__dirname, '../.config/homeassistant/config.json');

// 加载配置
function loadConfig() {
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
  } catch (e) {
    console.error('❌ 无法加载配置:', CONFIG_PATH);
    process.exit(1);
  }
}

const config = loadConfig();
const BASE_URL = config.url;
const TOKEN = config.token;

// API 请求
async function api(method, path, body = null) {
  const url = `${BASE_URL}${path}`;
  const options = {
    method,
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Content-Type': 'application/json'
    }
  };
  if (body) {
    options.body = JSON.stringify(body);
  }
  
  const res = await fetch(url, options);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

// 获取所有状态
async function getStates(domain = null) {
  const states = await api('GET', '/api/states');
  if (domain) {
    return states.filter(s => s.entity_id.startsWith(domain + '.'));
  }
  return states;
}

// 获取单个状态
async function getState(entityId) {
  return api('GET', `/api/states/${entityId}`);
}

// 调用服务
async function callService(domain, service, data) {
  return api('POST', `/api/services/${domain}/${service}`, data);
}

// 命令处理
const commands = {
  // 列出设备
  async list(domain) {
    const states = await getStates(domain);
    
    if (!domain) {
      // 按域统计
      const domains = {};
      states.forEach(s => {
        const d = s.entity_id.split('.')[0];
        domains[d] = (domains[d] || 0) + 1;
      });
      console.log(`总计: ${states.length} 个实体\n`);
      Object.entries(domains)
        .sort((a, b) => b[1] - a[1])
        .forEach(([d, c]) => console.log(`  ${d}: ${c}`));
    } else {
      // 列出详情
      console.log(`${domain} (${states.length} 个):\n`);
      states.forEach(s => {
        const name = s.attributes.friendly_name || s.entity_id;
        console.log(`  ${s.entity_id.padEnd(45)} ${s.state.padEnd(12)} (${name})`);
      });
    }
  },

  // 获取状态
  async state(entityId) {
    if (!entityId) {
      console.log('用法: node ha.mjs state <entity_id>');
      return;
    }
    const state = await getState(entityId);
    console.log(JSON.stringify(state, null, 2));
  },

  // 开
  async turn_on(entityId) {
    if (!entityId) {
      console.log('用法: node ha.mjs turn_on <entity_id>');
      return;
    }
    const domain = entityId.split('.')[0];
    await callService(domain, 'turn_on', { entity_id: entityId });
    console.log(`✅ ${entityId} 已打开`);
  },

  // 关
  async turn_off(entityId) {
    if (!entityId) {
      console.log('用法: node ha.mjs turn_off <entity_id>');
      return;
    }
    const domain = entityId.split('.')[0];
    await callService(domain, 'turn_off', { entity_id: entityId });
    console.log(`✅ ${entityId} 已关闭`);
  },

  // 切换
  async toggle(entityId) {
    if (!entityId) {
      console.log('用法: node ha.mjs toggle <entity_id>');
      return;
    }
    const domain = entityId.split('.')[0];
    await callService(domain, 'toggle', { entity_id: entityId });
    console.log(`✅ ${entityId} 已切换`);
  },

  // 亮度
  async brightness(entityId, level) {
    if (!entityId || level === undefined) {
      console.log('用法: node ha.mjs brightness <entity_id> <0-255>');
      return;
    }
    await callService('light', 'turn_on', { 
      entity_id: entityId, 
      brightness: parseInt(level) 
    });
    console.log(`✅ ${entityId} 亮度设为 ${level}`);
  },

  // 场景
  async scene(entityId) {
    if (!entityId) {
      console.log('用法: node ha.mjs scene <scene.xxx>');
      return;
    }
    await callService('scene', 'turn_on', { entity_id: entityId });
    console.log(`✅ 场景 ${entityId} 已激活`);
  },

  // 调用任意服务
  async call(domain, service, dataJson) {
    if (!domain || !service) {
      console.log('用法: node ha.mjs call <domain> <service> [json_data]');
      return;
    }
    const data = dataJson ? JSON.parse(dataJson) : {};
    const result = await callService(domain, service, data);
    console.log('✅ 服务已调用');
    if (result && result.length > 0) {
      console.log(JSON.stringify(result, null, 2));
    }
  },

  // 帮助
  help() {
    console.log(`
Home Assistant 控制脚本

用法: node scripts/ha.mjs <command> [args...]

命令:
  list [domain]              列出设备 (可选: light, switch, sensor...)
  state <entity_id>          获取设备状态
  turn_on <entity_id>        打开设备
  turn_off <entity_id>       关闭设备
  toggle <entity_id>         切换设备状态
  brightness <entity_id> <0-255>  设置灯亮度
  scene <scene.xxx>          激活场景
  call <domain> <service> [json]  调用任意服务

示例:
  node scripts/ha.mjs list light
  node scripts/ha.mjs turn_on light.living_room
  node scripts/ha.mjs brightness light.living_room 128
  node scripts/ha.mjs scene scene.relax
    `);
  }
};

// 主函数
async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  
  if (!cmd || !commands[cmd]) {
    commands.help();
    return;
  }

  try {
    await commands[cmd](...args);
  } catch (e) {
    console.error('❌ 错误:', e.message);
    process.exit(1);
  }
}

main();
