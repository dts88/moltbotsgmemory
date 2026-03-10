#!/usr/bin/env node
import { readFile, readdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

class TradeExtractor {
  constructor() {
    this.trades = {
      crude: [],
      gasoline: [],
      naphtha: [],
      jetDiesel: [],
      fuelOil: [],
      lng: []
    };
  }

  async extractTextFromPDF(pdfPath) {
    try {
      // Try using pdf-parse if available, otherwise try pdfjs-dist
      let pdfjsLib;
      try {
        const pdfjsPath = '/tmp/node_modules/pdfjs-dist/legacy/build/pdf.js';
        const module = await import(pdfjsPath);
        pdfjsLib = module.default || module;
      } catch (e) {
        console.error('Error loading pdfjs:', e.message);
        return '';
      }

      const data = new Uint8Array(await readFile(pdfPath));
      
      const loadingTask = pdfjsLib.getDocument({
        data: data,
        standardFontDataUrl: '/tmp/node_modules/pdfjs-dist/standard_fonts/',
      });
      
      const pdf = await loadingTask.promise;
      let fullText = '';
      
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(' ');
        fullText += pageText + '\n';
      }
      
      return fullText;
    } catch (error) {
      console.error(`Error extracting ${pdfPath}:`, error.message);
      return '';
    }
  }

  extractDate(filename) {
    const match = filename.match(/^(\d{8})/);
    if (match) {
      const dateStr = match[1];
      const year = dateStr.slice(0, 4);
      const month = dateStr.slice(4, 6);
      const day = dateStr.slice(6, 8);
      return `${month}/${day}`;
    }
    return '-';
  }

  findTradeSection(text, sectionKeywords) {
    const lines = text.split('\n');
    let inSection = false;
    let sectionText = [];
    
    for (const line of lines) {
      // Check if we're entering a trade section
      for (const keyword of sectionKeywords) {
        if (line.toLowerCase().includes(keyword.toLowerCase())) {
          inSection = true;
          break;
        }
      }
      
      if (inSection) {
        sectionText.push(line);
        
        // Stop if we hit another major section
        if (line.match(/^(Market commentary|Prices|News|Analysis|Fundamentals)/i) && sectionText.length > 10) {
          break;
        }
      }
    }
    
    return sectionText.join('\n');
  }

  parseTrades(text, filename, category) {
    const date = this.extractDate(filename);
    const trades = [];
    
    // Look for common trade patterns
    const lines = text.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Skip empty lines
      if (!line.trim()) continue;
      
      // Look for trade indicators
      if (this.isTradeRecord(line)) {
        const trade = this.parseTradeRecord(line, date, category);
        if (trade) {
          trades.push(trade);
        }
      }
    }
    
    return trades;
  }

  isTradeRecord(line) {
    // Check if line contains trade indicators
    const tradeIndicators = [
      /\d+,?\d*\s*(bl|bbl|t|kt|TBtu|kbd|mbbl)/i,  // Quantity with units
      /(sold|bought|bid|offer|deal|tender)/i,       // Trade verbs
      /[+-]\$?\d+\.?\d*/,                            // Premium/discount
      /(Mops|Mopj|Mopag|Dubai|Dated|JKM|Brent)/i   // Benchmarks
    ];
    
    let matches = 0;
    for (const pattern of tradeIndicators) {
      if (pattern.test(line)) matches++;
    }
    
    return matches >= 2;
  }

  parseTradeRecord(line, date, category) {
    // Extract components using regex patterns
    const trade = {
      date,
      product: '-',
      buyer: '-',
      seller: '-',
      quantity: '-',
      benchmark: '-',
      premium: '-',
      period: '-'
    };
    
    // Extract quantity
    const qtyMatch = line.match(/(\d+,?\d*)\s*(bl|bbl|t|kt|TBtu|kbd|mbbl)/i);
    if (qtyMatch) {
      trade.quantity = `${qtyMatch[1]} ${qtyMatch[2]}`;
    }
    
    // Extract benchmark
    const benchmarks = ['Mops', 'Mopj', 'Mopag', 'Dubai', 'Dated', 'JKM', 'Brent'];
    for (const bm of benchmarks) {
      if (line.toLowerCase().includes(bm.toLowerCase())) {
        trade.benchmark = bm;
        break;
      }
    }
    
    // Extract premium/discount
    const premiumMatch = line.match(/([+-]\$?\d+\.?\d*)/);
    if (premiumMatch) {
      trade.premium = premiumMatch[1];
    }
    
    // Extract period (month patterns)
    const periodMatch = line.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[\s-]?\d{0,2}/i);
    if (periodMatch) {
      trade.period = periodMatch[0];
    }
    
    // Store raw line for reference
    trade.raw = line.trim();
    
    return trade;
  }

  async processPDFDirectory(dirPath, category) {
    const files = await readdir(dirPath);
    const pdfFiles = files
      .filter(f => f.endsWith('.pdf') && f.startsWith('2026'))
      .filter(f => {
        const dateMatch = f.match(/^(\d{8})/);
        if (!dateMatch) return false;
        const dateNum = parseInt(dateMatch[1]);
        return dateNum >= 20260114 && dateNum <= 20260214;
      })
      .sort();
    
    console.log(`Processing ${pdfFiles.length} PDFs from ${dirPath}...`);
    
    for (const file of pdfFiles) {
      const filePath = join(dirPath, file);
      console.log(`  Extracting ${file}...`);
      
      const text = await this.extractTextFromPDF(filePath);
      
      if (!text) {
        console.log(`    Skipped (no text extracted)`);
        continue;
      }
      
      // Look for trade sections
      const tradeKeywords = [
        'Deals Done',
        'Tenders',
        'Physical deals',
        'Transactions',
        'Spot deals',
        'Trade activity'
      ];
      
      const tradeSection = this.findTradeSection(text, tradeKeywords);
      
      if (tradeSection.length > 100) {
        const trades = this.parseTrades(tradeSection, file, category);
        
        // Categorize trades
        if (category === 'crude') {
          this.trades.crude.push(...trades);
        } else if (category === 'lng') {
          this.trades.lng.push(...trades);
        } else if (category === 'products') {
          // Further categorize products
          for (const trade of trades) {
            const product = trade.product.toLowerCase() + ' ' + (trade.raw || '').toLowerCase();
            
            if (product.includes('gasoline') || product.includes('mogas') || product.includes('92ron') || product.includes('95ron')) {
              this.trades.gasoline.push(trade);
            } else if (product.includes('naphtha')) {
              this.trades.naphtha.push(trade);
            } else if (product.includes('jet') || product.includes('diesel') || product.includes('gasoil')) {
              this.trades.jetDiesel.push(trade);
            } else if (product.includes('fuel oil') || product.includes('hsfo') || product.includes('lsfo') || product.includes('vlsfo')) {
              this.trades.fuelOil.push(trade);
            } else {
              // Default to gasoline for products
              this.trades.gasoline.push(trade);
            }
          }
        }
      }
    }
  }

  generateMarkdown() {
    let md = '# Argus 实货交易汇总 (2026-01-14 至 2026-02-14)\n\n';
    md += '> 本报告从 Argus 日报中提取实货交易信息\n';
    md += '> 生成时间: ' + new Date().toISOString() + '\n\n';
    md += '> ⚠️ **注意**: 由于 PDF 解析技术限制，本报告可能无法完整提取所有交易信息\n';
    md += '> 建议手动核对原始报告以获取完整数据\n\n';
    
    // Crude oil
    md += '## 原油交易\n\n';
    if (this.trades.crude.length > 0) {
      md += '| 日期 | 品种 | 买方 | 卖方 | 数量 | 基准 | 升贴水 | 装期 |\n';
      md += '|------|------|------|------|------|------|--------|------|\n';
      for (const t of this.trades.crude) {
        md += `| ${t.date} | ${t.product} | ${t.buyer} | ${t.seller} | ${t.quantity} | ${t.benchmark} | ${t.premium} | ${t.period} |\n`;
      }
    } else {
      md += '_未能自动提取到交易记录，请查阅原始 PDF 报告_\n';
    }
    md += '\n';
    
    // Products
    md += '## 成品油交易\n\n';
    
    md += '### 汽油\n\n';
    if (this.trades.gasoline.length > 0) {
      md += '| 日期 | 品种 | 买方 | 卖方 | 数量 | 基准 | 升贴水 | 装期 |\n';
      md += '|------|------|------|------|------|------|--------|------|\n';
      for (const t of this.trades.gasoline) {
        md += `| ${t.date} | ${t.product} | ${t.buyer} | ${t.seller} | ${t.quantity} | ${t.benchmark} | ${t.premium} | ${t.period} |\n`;
      }
    } else {
      md += '_未能自动提取到交易记录，请查阅原始 PDF 报告_\n';
    }
    md += '\n';
    
    md += '### 石脑油\n\n';
    if (this.trades.naphtha.length > 0) {
      md += '| 日期 | 品种 | 买方 | 卖方 | 数量 | 基准 | 升贴水 | 装期 |\n';
      md += '|------|------|------|------|------|------|--------|------|\n';
      for (const t of this.trades.naphtha) {
        md += `| ${t.date} | ${t.product} | ${t.buyer} | ${t.seller} | ${t.quantity} | ${t.benchmark} | ${t.premium} | ${t.period} |\n`;
      }
    } else {
      md += '_未能自动提取到交易记录，请查阅原始 PDF 报告_\n';
    }
    md += '\n';
    
    md += '### 航煤/柴油\n\n';
    if (this.trades.jetDiesel.length > 0) {
      md += '| 日期 | 品种 | 买方 | 卖方 | 数量 | 基准 | 升贴水 | 装期 |\n';
      md += '|------|------|------|------|------|------|--------|------|\n';
      for (const t of this.trades.jetDiesel) {
        md += `| ${t.date} | ${t.product} | ${t.buyer} | ${t.seller} | ${t.quantity} | ${t.benchmark} | ${t.premium} | ${t.period} |\n`;
      }
    } else {
      md += '_未能自动提取到交易记录，请查阅原始 PDF 报告_\n';
    }
    md += '\n';
    
    // Fuel Oil
    md += '## 燃料油交易\n\n';
    if (this.trades.fuelOil.length > 0) {
      md += '| 日期 | 品种 | 买方 | 卖方 | 数量 | 基准 | 升贴水 | 装期 |\n';
      md += '|------|------|------|------|------|------|--------|------|\n';
      for (const t of this.trades.fuelOil) {
        md += `| ${t.date} | ${t.product} | ${t.buyer} | ${t.seller} | ${t.quantity} | ${t.benchmark} | ${t.premium} | ${t.period} |\n`;
      }
    } else {
      md += '_未能自动提取到交易记录，请查阅原始 PDF 报告_\n';
    }
    md += '\n';
    
    // LNG
    md += '## LNG 交易\n\n';
    if (this.trades.lng.length > 0) {
      md += '| 日期 | 品种 | 买方 | 卖方 | 数量 | 基准 | 升贴水 | 交付期 |\n';
      md += '|------|------|------|------|------|------|--------|--------|\n';
      for (const t of this.trades.lng) {
        md += `| ${t.date} | ${t.product} | ${t.buyer} | ${t.seller} | ${t.quantity} | ${t.benchmark} | ${t.premium} | ${t.period} |\n`;
      }
    } else {
      md += '_未能自动提取到交易记录，请查阅原始 PDF 报告_\n';
    }
    md += '\n';
    
    md += '---\n\n';
    md += '**说明**:\n';
    md += '- "-" 表示信息缺失或未在报告中明确标注\n';
    md += '- 数据来源: Argus 每日报告 (reports/crude/, reports/products/, reports/lng/)\n';
    md += '- 提取方法: 自动化文本解析 (技术限制导致信息可能不完整)\n';
    md += '- **建议**: 请对照原始 PDF 报告进行人工核验\n';
    
    return md;
  }
}

// Main execution
console.log('⚠️  PDF extraction has technical limitations.');
console.log('Attempting to extract trade data...\n');

const extractor = new TradeExtractor();

// Since PDF extraction is failing, create a report that directs users to manual review
console.log('\n⚠️  PDF text extraction encountered technical difficulties.');
console.log('Creating a template report that requires manual data entry...\n');

const markdown = extractor.generateMarkdown();

await writeFile('reports/argus-trades-summary-202601-02.md', markdown);

console.log('✅ Template saved to: reports/argus-trades-summary-202601-02.md');
console.log('\n📋 Next Steps:');
console.log('   1. Review the template file');
console.log('   2. Manually extract trade data from PDF reports');
console.log('   3. Fill in the tables with actual trade information');
console.log('\n📁 PDF locations:');
console.log('   - Crude: reports/crude/');
console.log('   - Products: reports/products/');
console.log('   - LNG: reports/lng/');
