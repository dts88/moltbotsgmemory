#!/usr/bin/env node
/**
 * FOIZ 库存数据抓取 - 使用 Playwright headless browser
 * 网站: https://fujairah.platts.com/fujairah/
 * 数据免费公开，但需要浏览器渲染（ExtJS 应用）
 */

import { chromium } from 'playwright';

const URL = 'https://fujairah.platts.com/fujairah/';
const TIMEOUT = 30000;

async function scrapeFoiz() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  // 拦截网络请求，找到数据 API
  const apiResponses = [];
  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('/fujairah/api/') || url.includes('/api/data') || url.includes('inventory')) {
      try {
        const body = await response.text();
        if (body && body.startsWith('{') || body.startsWith('[')) {
          apiResponses.push({ url, body: body.slice(0, 2000) });
        }
      } catch {}
    }
  });

  try {
    await page.goto(URL, { waitUntil: 'networkidle', timeout: TIMEOUT });

    // 等待数据加载
    await page.waitForTimeout(3000);

    // 截取页面文本内容
    const pageText = await page.evaluate(() => document.body.innerText);

    // 尝试找数字（million barrels 格式）
    const numbers = pageText.match(/[\d,]+\.?\d*\s*(?:million|mln|mb|bbl)/gi) || [];

    // 提取表格数据
    const tableData = await page.evaluate(() => {
      const tables = document.querySelectorAll('table');
      const data = [];
      tables.forEach(t => data.push(t.innerText));
      return data;
    });

    // 找 API 调用 URL
    const requests = [];
    page.on('request', (req) => {
      if (req.url().includes('/api/')) requests.push(req.url());
    });

    console.log(JSON.stringify({
      status: 'ok',
      url: URL,
      apiResponses,
      pageTextSample: pageText.slice(0, 3000),
      tables: tableData.slice(0, 5),
      numbers,
    }, null, 2));

  } finally {
    await browser.close();
  }
}

await scrapeFoiz();
