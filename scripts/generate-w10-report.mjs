#!/usr/bin/env node
/**
 * W10 市场周报 Word 文档生成器
 * 从草稿 markdown 读取内容生成 Word
 */

import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, BorderStyle } from 'docx';
import { writeFileSync, readFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKSPACE = join(__dirname, '..');

const FONT = '等线';
const FONT_SIZE = 40; // 20pt

function createText(text, options = {}) {
  return new TextRun({
    text,
    font: FONT,
    size: options.size || FONT_SIZE,
    bold: options.bold || false,
    ...options
  });
}

function createParagraph(content, options = {}) {
  const children = typeof content === 'string'
    ? [createText(content, options)]
    : content;
  return new Paragraph({
    children,
    spacing: {
      before: options.spaceBefore || 0,
      after: options.spaceAfter || 160,
      line: 480
    },
    alignment: AlignmentType.JUSTIFIED
  });
}

function createTitle(text) {
  return new Paragraph({
    children: [new TextRun({
      text,
      font: FONT,
      size: 56, // 28pt
      bold: true
    })],
    spacing: { after: 200, line: 480 },
    alignment: AlignmentType.CENTER
  });
}

function createSectionHeader(text) {
  return new Paragraph({
    children: [new TextRun({
      text,
      font: FONT,
      size: FONT_SIZE,
      bold: true
    })],
    spacing: { before: 200, after: 160, line: 480 },
    alignment: AlignmentType.LEFT
  });
}

function createPriceTable(priceData, date) {
  const noBorder = {
    top: { style: BorderStyle.NONE, size: 0 },
    bottom: { style: BorderStyle.NONE, size: 0 },
    left: { style: BorderStyle.NONE, size: 0 },
    right: { style: BorderStyle.NONE, size: 0 }
  };

  const createCell = (text, bold = false) => new TableCell({
    children: [new Paragraph({
      children: [new TextRun({ text, font: FONT, size: FONT_SIZE, bold })],
      alignment: AlignmentType.CENTER
    })],
    borders: noBorder
  });

  const headerRow = new TableRow({
    children: [
      createCell('', true),
      createCell(date, true),
      createCell('日涨跌', true),
      createCell('日涨跌', true),
      createCell('周涨跌', true),
      createCell('价格 吨', true),
      createCell('本周', true)
    ]
  });

  const subHeaderRow = new TableRow({
    children: [
      createCell(''),
      createCell('美元'),
      createCell('美元'),
      createCell('%'),
      createCell('%'),
      createCell('人民币'),
      createCell('走势')
    ]
  });

  const rows = priceData.map(item => {
    const absWeek = Math.abs(item.weekChangePct);
    let trend = '→';
    if (item.weekChangePct > 10) trend = '↗↗↗';
    else if (item.weekChangePct > 3) trend = '↗↗';
    else if (item.weekChangePct > 0) trend = '↗';
    else if (item.weekChangePct < -10) trend = '↘↘↘';
    else if (item.weekChangePct < -3) trend = '↘↘';
    else if (item.weekChangePct < 0) trend = '↘';

    return new TableRow({
      children: [
        createCell(item.name),
        createCell(item.price),
        createCell(item.dailyChange),
        createCell(item.dailyChangePct),
        createCell(item.weekChangePct),
        createCell(item.cnyPerTon),
        createCell(trend)
      ]
    });
  });

  return new Table({
    rows: [headerRow, subHeaderRow, ...rows],
    width: { size: 100, type: WidthType.PERCENTAGE }
  });
}

// Parse markdown table
function parsePriceTable(markdown) {
  const lines = markdown.split('\n').filter(l => l.startsWith('|') && !l.startsWith('|--') && !l.includes('品种'));
  return lines.map(line => {
    const cells = line.split('|').filter(c => c.trim()).map(c => c.trim());
    return {
      name: cells[0] || '',
      price: cells[1] || '',
      dailyChange: cells[2] || '',
      dailyChangePct: cells[3] || '',
      weekChangePct: cells[4] || '',
      cnyPerTon: cells[5] || '',
    };
  });
}

async function main() {
  const draft = readFileSync(join(WORKSPACE, 'reports/周报草稿_2026-W10.md'), 'utf8');

  // Parse sections
  const sections = draft.split(/^---$/m).map(s => s.trim());
  
  // Find price table section
  const priceSection = sections.find(s => s.includes('一、价格走势'));
  const priceData = parsePriceTable(priceSection);
  
  // Extract fx rate
  const fxMatch = priceSection.match(/汇率.*?(\d+\.\d+)/);
  const fxRate = fxMatch ? fxMatch[1] : '6.9025';
  
  // Find market factors section (二、市场因素)
  const factorsSection = sections.find(s => s.includes('二、市场因素'));
  const factorLines = factorsSection.split('\n').filter(l => l.match(/^\d+）/));
  
  // Find products section (三、成品油)
  const productsSection = sections.find(s => s.includes('三、成品油'));
  const productsText = productsSection.replace(/^##.*\n+/, '').trim();
  
  // Find TD3C section (四、TD3C)
  const td3cSection = sections.find(s => s.includes('四、TD3C'));
  const td3cText = td3cSection.replace(/^##.*\n+/, '').trim();
  const td3cParagraphs = td3cText.split('\n\n').filter(p => p.trim());

  // Build document
  const doc = new Document({
    sections: [{
      properties: {},
      children: [
        createTitle('市场周报 2026年3月6日'),
        createParagraph(''),

        // 一、价格走势
        createSectionHeader('一、价格走势'),
        createPriceTable(priceData, '3月6日'),
        createParagraph(`汇率: 美元/人民币 ${fxRate}`, { size: 36 }),
        createParagraph(''),

        // 二、市场因素
        createSectionHeader('二、市场因素'),
        ...factorLines.map(line => createParagraph(line)),
        createParagraph(''),

        // 三、成品油
        createSectionHeader('三、成品油'),
        createParagraph(productsText),
        createParagraph(''),

        // 四、TD3C
        createSectionHeader('四、TD3C（中东至中国）'),
        ...td3cParagraphs.map(para => createParagraph(para))
      ]
    }]
  });

  const buffer = await Packer.toBuffer(doc);
  
  mkdirSync(join(WORKSPACE, 'reports/output'), { recursive: true });
  const outputPath = join(WORKSPACE, 'reports/output/市场周报_2026年3月6日.docx');
  writeFileSync(outputPath, buffer);
  console.log('Word 文档已生成:', outputPath);
  
  return outputPath;
}

main().catch(console.error);
