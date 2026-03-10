#!/usr/bin/env node
/**
 * 从 Argus Asia-Pacific Products 报告提取交易数据 (v2)
 * 读取 Deals done 和 Issued tenders 表格
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

async function extractPdfText(filePath, startPage = 9, endPage = 12) {
  const pdfjsLib = await loadPdfJs();
  const buffer = await fs.readFile(filePath);
  const data = new Uint8Array(buffer);
  const doc = await pdfjsLib.getDocument({ data }).promise;
  
  let text = '';
  const maxPage = Math.min(doc.numPages, endPage);
  for (let i = startPage; i <= maxPage; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map(item => item.str).join(' ') + '\n\n';
  }
  return text;
}

function parseDeals(text) {
  const deals = [];
  
  // 找 Deals done 部分
  const dealsMatch = text.match(/Deals done\s+([\s\S]*?)(?=Issued tenders|Tenders|NEWS|$)/i);
  if (!dealsMatch) return deals;
  
  const dealsText = dealsMatch[1];
  
  // 解析每行交易
  // 格式: Seller   Buyer   Product   Volume   Diff Basis   Price   Timing
  const lines = dealsText.split(/(?=\b(?:Mercuria|Trafigura|Vitol|BP|Shell|Gunvor|Glencore|PTT|Petrochina|SK|GS|Aramco|Unipec|Sinochem|CNOOC|Wepec|HPCL|MRPL|IOC|Ampol|OTI|RGES|TotalEnergies|Dangote|Phillips|Chimbusco|Union|Sietco)\b)/i);
  
  for (const line of lines) {
    if (line.trim().length < 20) continue;
    
    // 尝试匹配完整交易行
    // Mercuria   Petrochina   Fuel oil HS 380 cst cargo Singapore   20,000t   Mops   +6.00   11 Mar-15 Mar
    const match = line.match(
      /^(\w+(?:\s+\w+)?(?:\s+Trading)?(?:\s+Singapore)?)\s+(\w+(?:\s+\w+)?)\s+((?:Fuel oil|Gasoline|Jet|Gasoil|Naphtha|HSFO|LSFO|VLSFO)[\w\s\-]+?(?:Singapore|cargo)?)\s+(\d+[,\d]*)\s*(t|bl|mt)\s+(?:(\w+)\s+)?([+-]?[\d.]+|\$[\d.]+)\s+([\d]+\s*\w+-[\d]+\s*\w+)/i
    );
    
    if (match) {
      const product = match[3].trim();
      let category = 'other';
      if (/fuel oil|380|180|hsfo|lsfo|vlsfo/i.test(product)) category = 'fuel_oil';
      else if (/gasoline|92R|95R|97R/i.test(product)) category = 'gasoline';
      else if (/jet|kerosine/i.test(product)) category = 'jet';
      else if (/gasoil|diesel/i.test(product)) category = 'gasoil';
      else if (/naphtha/i.test(product)) category = 'naphtha';
      
      deals.push({
        seller: match[1].trim(),
        buyer: match[2].trim(),
        product: product,
        category,
        volume: match[4] + match[5],
        basis: match[6] || '-',
        price: match[7],
        timing: match[8]
      });
    }
  }
  
  return deals;
}

function parseTenders(text) {
  const tenders = [];
  
  const tendersMatch = text.match(/Issued tenders\s+([\s\S]*?)(?=NEWS|Copyright|$)/i);
  if (!tendersMatch) return tenders;
  
  const tendersText = tendersMatch[1];
  
  // 解析招标
  const lines = tendersText.split(/(?=\b(?:Pertamina|Lanka|CPC|GS|IOC|MRPL|QatarEnergy|EGPC|HPCL|Dangote|Attock|Ceypetco|Petrolimex)\b)/i);
  
  for (const line of lines) {
    if (line.trim().length < 20) continue;
    
    const match = line.match(
      /^(\w+(?:\s+\w+)?)\s+(Buy|Sell)\s+([\d,]+)\s*(t|bl|kbbl|m³)\s+(?:of\s+)?([\w\s\-%]+?)\s+([\d\w\s-]+)\s+(fob|cfr|dap|cif)\s+([\w\s]+)\s+(\d+\s*\w+)/i
    );
    
    if (match) {
      tenders.push({
        issuer: match[1],
        direction: match[2].toLowerCase(),
        volume: match[3] + match[4],
        product: match[5].trim(),
        timing: match[6].trim(),
        terms: match[7],
        location: match[8].trim(),
        close: match[9]
      });
    }
  }
  
  return tenders;
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
  const allTenders = [];
  
  for (const file of appFiles) {
    const dateStr = file.slice(0, 8);
    const formattedDate = `${dateStr.slice(0,4)}-${dateStr.slice(4,6)}-${dateStr.slice(6,8)}`;
    
    process.stdout.write(`${formattedDate}: `);
    
    try {
      const filePath = path.join(REPORTS_DIR, file);
      const text = await extractPdfText(filePath, 9, 12);
      
      const deals = parseDeals(text);
      const tenders = parseTenders(text);
      
      deals.forEach(d => d.date = formattedDate);
      tenders.forEach(t => t.date = formattedDate);
      
      allDeals.push(...deals);
      allTenders.push(...tenders);
      
      console.log(`${deals.length} 笔交易, ${tenders.length} 个招标`);
    } catch (e) {
      console.log(`错误: ${e.message}`);
    }
  }
  
  console.log(`\n=== 汇总 ===`);
  console.log(`交易: ${allDeals.length} 笔`);
  console.log(`招标: ${allTenders.length} 个\n`);
  
  // 按品种分组打印
  const byCategory = {};
  for (const deal of allDeals) {
    const cat = deal.category;
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(deal);
  }
  
  const categoryNames = {
    gasoline: '汽油 Gasoline',
    naphtha: '石脑油 Naphtha',
    jet: '航煤 Jet',
    gasoil: '柴油 Gasoil',
    fuel_oil: '燃料油 Fuel Oil'
  };
  
  for (const [cat, deals] of Object.entries(byCategory)) {
    console.log(`\n## ${categoryNames[cat] || cat} (${deals.length}笔)`);
    console.log('| 日期 | 卖方 | 买方 | 品种 | 数量 | 基准 | 价格/升贴水 | 装期 |');
    console.log('|------|------|------|------|------|------|-------------|------|');
    for (const d of deals) {
      console.log(`| ${d.date.slice(5)} | ${d.seller} | ${d.buyer} | ${d.product.slice(0,20)} | ${d.volume} | ${d.basis} | ${d.price} | ${d.timing} |`);
    }
  }
  
  // 保存
  const output = {
    period: `${startDate}-${endDate}`,
    extractedAt: new Date().toISOString(),
    summary: {
      totalDeals: allDeals.length,
      totalTenders: allTenders.length,
      byCategory: Object.fromEntries(Object.entries(byCategory).map(([k, v]) => [k, v.length]))
    },
    deals: allDeals,
    tenders: allTenders
  };
  
  const outputPath = `/home/node/clawd/reports/market-trades/asia-products-feb-mar-2026.json`;
  await fs.writeFile(outputPath, JSON.stringify(output, null, 2));
  console.log(`\n保存到: ${outputPath}`);
}

main().catch(console.error);
