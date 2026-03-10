#!/usr/bin/env node
/**
 * 从 Argus Jet Fuel 报告中提取交易记录
 * 用法: node scripts/extract-jet-trades.mjs [--from YYYYMMDD] [--to YYYYMMDD]
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const REPORTS_DIR = '/home/node/clawd/reports/products';
const OUTPUT_DIR = '/home/node/clawd/reports/market-trades';

async function extractText(pdfPath) {
  const data = new Uint8Array(readFileSync(pdfPath));
  const pdf = await getDocument({ data }).promise;
  
  let fullText = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    fullText += content.items.map(item => item.str).join(' ') + '\n';
  }
  return fullText;
}

function parseDeals(text, date) {
  const deals = [];
  
  // 查找 "Spot market deals done" 部分
  const dealsMatch = text.match(/Spot market deals done[\s\S]*?(?=Licensed to:|Copyright|$)/i);
  if (!dealsMatch) return deals;
  
  const dealsSection = dealsMatch[0];
  
  // 解析交易行 - 格式: Market Spec Timing Basis Price Volume
  // 例如: USGC Colonial   Jet A   cycle 13   Apr Nymex   -13.75   25000 bl
  const lines = dealsSection.split('\n');
  
  for (const line of lines) {
    // 匹配常见的交易模式
    const patterns = [
      // US patterns
      /(?<market>USGC Colonial|Buckeye|LA|New York|Houston|Tulsa|Chicago)\s+(?<spec>Jet A|Jet A-1|54 grade)\s+(?<timing>cycle \d+|prompt|\d+-\d+ \w+|\w+ \d+-\d+)\s+(?<basis>\w+ Nymex|Colonial)\s+(?<price>[+-]?\d+\.?\d*)\s+(?<volume>\d+)\s*bl/i,
      // Singapore/Asia patterns  
      /(?<market>Singapore|South Korea|Japan)\s+(?<spec>fob cargo|c\+f cargo)\s+(?<timing>Prompt|spot)\s+(?<basis>Mops|Mopj|Mopag)\s+(?<price>[+-]?\d+\.?\d*)\s+/i,
    ];
    
    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match && match.groups) {
        deals.push({
          date,
          market: match.groups.market,
          spec: match.groups.spec,
          timing: match.groups.timing,
          basis: match.groups.basis,
          price: match.groups.price,
          volume: match.groups.volume || '-',
          raw: line.trim().substring(0, 200)
        });
        break;
      }
    }
  }
  
  return deals;
}

function parseTenders(text, date) {
  const tenders = [];
  
  // 查找招标相关信息
  const tenderPatterns = [
    /(?<issuer>QatarEnergy|CPC|Pertamina|BPCL|IOC|HPCL|Eneos|Cosmo|JX|SK Energy|S-Oil|GS Caltex)\s+(?<action>sought|bought|sold|seeking|issued|awarded)\s+(?:at least\s+)?(?<volume>[\d,]+)\s*(?<unit>bl|t|kt|m3)\s+(?:of\s+)?(?<product>jet fuel|jet A-1|kerosene|航煤)/gi,
    /tender.*?(?<issuer>[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)\s+(?<action>closed|awarded|seeking|issued)/gi
  ];
  
  for (const pattern of tenderPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      if (match.groups) {
        tenders.push({
          date,
          issuer: match.groups.issuer,
          action: match.groups.action,
          volume: match.groups.volume || '-',
          unit: match.groups.unit || '-',
          product: match.groups.product || 'jet fuel',
          raw: match[0].substring(0, 200)
        });
      }
    }
  }
  
  return tenders;
}

async function processReport(pdfPath, dateStr) {
  console.log(`Processing ${pdfPath}...`);
  
  try {
    const text = await extractText(pdfPath);
    const deals = parseDeals(text, dateStr);
    const tenders = parseTenders(text, dateStr);
    
    return { deals, tenders, date: dateStr };
  } catch (e) {
    console.error(`Error processing ${pdfPath}: ${e.message}`);
    return { deals: [], tenders: [], date: dateStr };
  }
}

async function main() {
  const args = process.argv.slice(2);
  let fromDate = '20260201';
  let toDate = '20260220';
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--from' && args[i+1]) fromDate = args[i+1];
    if (args[i] === '--to' && args[i+1]) toDate = args[i+1];
  }
  
  console.log(`Extracting jet trades from ${fromDate} to ${toDate}\n`);
  
  // 确保输出目录存在
  if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });
  if (!existsSync(`${OUTPUT_DIR}/daily`)) mkdirSync(`${OUTPUT_DIR}/daily`, { recursive: true });
  
  const allDeals = [];
  const allTenders = [];
  
  // 遍历日期范围内的报告
  for (let d = parseInt(fromDate); d <= parseInt(toDate); d++) {
    const dateStr = String(d);
    const pdfPath = `${REPORTS_DIR}/${dateStr}_Argus_jet.pdf`;
    
    if (existsSync(pdfPath)) {
      const result = await processReport(pdfPath, dateStr);
      allDeals.push(...result.deals);
      allTenders.push(...result.tenders);
      
      console.log(`  Found ${result.deals.length} deals, ${result.tenders.length} tenders`);
    }
  }
  
  // 输出汇总
  console.log(`\n=== Summary ===`);
  console.log(`Total deals: ${allDeals.length}`);
  console.log(`Total tenders: ${allTenders.length}`);
  
  // 保存结果
  const output = {
    period: `${fromDate}-${toDate}`,
    extractedAt: new Date().toISOString(),
    deals: allDeals,
    tenders: allTenders
  };
  
  const outputPath = `${OUTPUT_DIR}/jet-trades-${fromDate}-${toDate}.json`;
  writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`\nSaved to ${outputPath}`);
  
  // 打印交易明细
  if (allDeals.length > 0) {
    console.log(`\n=== Deals ===`);
    for (const deal of allDeals.slice(0, 20)) {
      console.log(`${deal.date} | ${deal.market} | ${deal.spec} | ${deal.timing} | ${deal.basis} ${deal.price} | ${deal.volume}`);
    }
    if (allDeals.length > 20) console.log(`... and ${allDeals.length - 20} more`);
  }
  
  if (allTenders.length > 0) {
    console.log(`\n=== Tenders ===`);
    for (const tender of allTenders) {
      console.log(`${tender.date} | ${tender.issuer} ${tender.action} ${tender.volume} ${tender.unit} ${tender.product}`);
    }
  }
}

main().catch(console.error);
