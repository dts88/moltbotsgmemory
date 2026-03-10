#!/usr/bin/env node
/**
 * 从 Argus Asia-Pacific Products 报告中提取交易数据
 */

import fs from 'fs/promises';
import path from 'path';

const REPORTS_DIR = '/home/node/clawd/reports/products';

async function loadPdfJs() {
  const paths = [
    '/tmp/node_modules/pdfjs-dist/legacy/build/pdf.mjs',
    '/tmp/node_modules/pdfjs-dist/build/pdf.mjs'
  ];
  for (const p of paths) {
    try { return await import(p); } catch (e) { continue; }
  }
  throw new Error('pdfjs-dist not found');
}

async function extractPdfText(filePath, maxPages = 10) {
  const pdfjsLib = await loadPdfJs();
  const buffer = await fs.readFile(filePath);
  const data = new Uint8Array(buffer);
  const doc = await pdfjsLib.getDocument({ data }).promise;
  
  let text = '';
  const pages = Math.min(doc.numPages, maxPages);
  for (let i = 1; i <= pages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map(item => item.str).join(' ') + '\n\n';
  }
  return text;
}

function extractDeals(text, date) {
  const deals = [];
  
  // 找 Deals done / Spot market 部分
  const dealsSection = text.match(/(?:Deals done|Spot market deals done|Singapore deals)[\s\S]*?(?=Assessments|Tenders|$)/gi);
  if (!dealsSection) return deals;
  
  for (const section of dealsSection) {
    // 匹配交易行: Seller, Buyer, Product, Volume, Basis, Price/Diff, Timing
    // 常见格式: "Trafigura   Vitol   92R Singapore   100,000 bl   -   $79.50   12-16 Mar"
    const lines = section.split('\n');
    
    for (const line of lines) {
      // 汽油交易
      const gasolineMatch = line.match(/(\w+(?:\s+\w+)?)\s+(\w+(?:\s+\w+)?)\s+(92R|95R|97R|Gasoline)\s+(?:Singapore\s+)?(\d+[,\d]*)\s*(bl|t|mt)\s+(?:Mops\s+)?([+-]?\$?[\d.]+|Mops\s+[+-][\d.]+|-)\s+([\d-]+\s+\w+)/i);
      if (gasolineMatch) {
        deals.push({
          date,
          product: 'Gasoline',
          spec: gasolineMatch[3],
          seller: gasolineMatch[1],
          buyer: gasolineMatch[2],
          volume: gasolineMatch[4] + ' ' + gasolineMatch[5],
          price: gasolineMatch[6],
          timing: gasolineMatch[7]
        });
      }
      
      // 石脑油交易
      const naphthaMatch = line.match(/(\w+(?:\s+\w+)?)\s+(\w+(?:\s+\w+)?)\s+(Naphtha|Open spec)\s+.*?(\d+[,\d]*)\s*(t|mt)\s+(?:MOPJ\s+)?([+-][\d.]+|\$[\d.]+)/i);
      if (naphthaMatch) {
        deals.push({
          date,
          product: 'Naphtha',
          seller: naphthaMatch[1],
          buyer: naphthaMatch[2],
          volume: naphthaMatch[4] + ' ' + naphthaMatch[5],
          price: naphthaMatch[6]
        });
      }
      
      // 航煤交易
      const jetMatch = line.match(/(\w+(?:\s+\w+)?)\s+(\w+(?:\s+\w+)?)\s+(Jet[- ]?(?:kerosine|fuel|A-1)?)\s+(?:Singapore\s+)?(\d+[,\d]*)\s*(bl|t)\s+(?:Mops\s+)?([+-][\d.]+)/i);
      if (jetMatch) {
        deals.push({
          date,
          product: 'Jet',
          seller: jetMatch[1],
          buyer: jetMatch[2],
          volume: jetMatch[4] + ' ' + jetMatch[5],
          price: jetMatch[6]
        });
      }
      
      // 柴油交易
      const gasoilMatch = line.match(/(\w+(?:\s+\w+)?)\s+(\w+(?:\s+\w+)?)\s+(Gasoil|Diesel)\s+(?:10ppm|50ppm|500ppm)?\s*(?:Singapore\s+)?(\d+[,\d]*)\s*(bl|t)\s+(?:Mops\s+)?([+-][\d.]+)/i);
      if (gasoilMatch) {
        deals.push({
          date,
          product: 'Gasoil',
          seller: gasoilMatch[1],
          buyer: gasoilMatch[2],
          volume: gasoilMatch[4] + ' ' + gasoilMatch[5],
          price: gasoilMatch[6]
        });
      }
      
      // 燃料油交易
      const fuelOilMatch = line.match(/(\w+(?:\s+\w+)?)\s+(\w+(?:\s+\w+)?)\s+(HS(?:FO)?|LS(?:FO)?|180cst|380cst|VLSFO|LSWR)\s+(?:Singapore\s+)?(\d+[,\d]*)\s*(t|mt)\s+(?:Mops\s+)?([+-][\d.]+)/i);
      if (fuelOilMatch) {
        deals.push({
          date,
          product: 'Fuel Oil',
          spec: fuelOilMatch[3],
          seller: fuelOilMatch[1],
          buyer: fuelOilMatch[2],
          volume: fuelOilMatch[4] + ' ' + fuelOilMatch[5],
          price: fuelOilMatch[6]
        });
      }
    }
  }
  
  return deals;
}

async function main() {
  const startDate = process.argv[2] || '20260201';
  const endDate = process.argv[3] || '20260305';
  
  console.log(`提取 ${startDate} 至 ${endDate} 的亚洲成品油交易...\n`);
  
  const files = await fs.readdir(REPORTS_DIR);
  const appFiles = files
    .filter(f => f.includes('_app.pdf'))
    .filter(f => {
      const dateStr = f.slice(0, 8);
      return dateStr >= startDate && dateStr <= endDate;
    })
    .sort();
  
  console.log(`找到 ${appFiles.length} 份 APP 报告\n`);
  
  const allDeals = [];
  
  for (const file of appFiles) {
    const dateStr = file.slice(0, 8);
    const formattedDate = `${dateStr.slice(0,4)}-${dateStr.slice(4,6)}-${dateStr.slice(6,8)}`;
    
    process.stdout.write(`处理 ${file}...`);
    
    try {
      const filePath = path.join(REPORTS_DIR, file);
      const text = await extractPdfText(filePath, 5);
      const deals = extractDeals(text, formattedDate);
      
      if (deals.length > 0) {
        allDeals.push(...deals);
        console.log(` ${deals.length} 笔交易`);
      } else {
        console.log(' 无交易数据');
      }
      
      // 打印原始文本中的交易相关部分
      const dealsText = text.match(/(?:Deals|deals done|Spot market)[\s\S]{0,2000}/gi);
      if (dealsText && process.argv.includes('--verbose')) {
        console.log('  Raw:', dealsText[0]?.slice(0, 500));
      }
    } catch (e) {
      console.log(` 错误: ${e.message}`);
    }
  }
  
  console.log(`\n共提取 ${allDeals.length} 笔交易\n`);
  
  if (allDeals.length > 0) {
    console.log('=== 交易汇总 ===\n');
    
    // 按产品分组
    const byProduct = {};
    for (const deal of allDeals) {
      const key = deal.product;
      if (!byProduct[key]) byProduct[key] = [];
      byProduct[key].push(deal);
    }
    
    for (const [product, deals] of Object.entries(byProduct)) {
      console.log(`## ${product} (${deals.length}笔)`);
      for (const d of deals) {
        console.log(`  ${d.date}: ${d.seller} → ${d.buyer}, ${d.volume}, ${d.price}`);
      }
      console.log('');
    }
  }
  
  // 保存结果
  const outputPath = `/home/node/clawd/reports/market-trades/asia-products-${startDate}-${endDate}.json`;
  await fs.writeFile(outputPath, JSON.stringify({ period: `${startDate}-${endDate}`, deals: allDeals }, null, 2));
  console.log(`\n保存到: ${outputPath}`);
}

main().catch(console.error);
