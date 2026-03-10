#!/usr/bin/env node
/**
 * Kickstarter StackChan Monitor
 * 检查 StackChan 是否有货
 * 需要通过 Chrome relay 运行（Cloudflare 保护）
 */

const URL = 'https://www.kickstarter.com/projects/m5stack/stackchan-the-first-co-created-open-source-ai-desktop-robot';
const TARGET_PHONE = '+6592716786';

// 这个脚本需要配合 browser tool 使用
// 由于 Kickstarter 有 Cloudflare 保护，无法直接 fetch

console.log(JSON.stringify({
  action: 'check_kickstarter',
  url: URL,
  instructions: `
请使用 browser tool (profile=chrome) 打开此页面：
${URL}

检查页面中是否有:
1. "All gone" - 表示已售罄
2. "Pledge" 按钮可点击 - 表示有货
3. 任何 reward tier 显示 "Limited" 或数量

如果状态从 "All gone" 变成有货：
- 立即通过 WhatsApp 通知 ${TARGET_PHONE}
- 消息：🤖 StackChan 有货了！快去抢购：${URL}
`
}));
