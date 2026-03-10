#!/usr/bin/env node
/**
 * 市场周报 Word 文档生成器 - 从 Markdown 生成
 * 格式参照原模板
 */

import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, BorderStyle, convertInchesToTwip } from 'docx';
import { writeFileSync, readFileSync } from 'fs';

// 字体设置 - 全部使用等线
const FONT = '等线';
const FONT_SIZE = 40; // 20pt = 40 half-points

// 创建文本运行（支持粗体解析）
function parseTextWithBold(text, defaultBold = false) {
  const parts = [];
  const regex = /\*\*(.+?)\*\*/g;
  let lastIndex = 0;
  let match;
  
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(new TextRun({ 
        text: text.slice(lastIndex, match.index), 
        font: FONT, 
        size: FONT_SIZE,
        bold: defaultBold 
      }));
    }
    parts.push(new TextRun({ 
      text: match[1], 
      font: FONT, 
      size: FONT_SIZE,
      bold: true 
    }));
    lastIndex = regex.lastIndex;
  }
  
  if (lastIndex < text.length) {
    parts.push(new TextRun({ 
      text: text.slice(lastIndex), 
      font: FONT, 
      size: FONT_SIZE,
      bold: defaultBold 
    }));
  }
  
  return parts.length > 0 ? parts : [new TextRun({ text, font: FONT, size: FONT_SIZE, bold: defaultBold })];
}

// 创建段落 - Spacing After 8pt, Line Spacing Double, Justify
function createParagraph(text, options = {}) {
  return new Paragraph({
    children: parseTextWithBold(text, options.bold || false),
    spacing: { 
      before: options.spaceBefore || 0,
      after: options.spaceAfter || 160, // 8pt
      line: 480  // Double spacing
    },
    alignment: AlignmentType.JUSTIFIED
  });
}

// 创建标题
function createTitle(text) {
  return new Paragraph({
    children: [new TextRun({ text, font: FONT, size: FONT_SIZE, bold: true })],
    spacing: { before: 0, after: 160, line: 480 },
    alignment: AlignmentType.CENTER
  });
}

// 创建章节标题
function createSectionHeader(text) {
  return new Paragraph({
    children: [new TextRun({ text, font: FONT, size: FONT_SIZE, bold: true })],
    spacing: { before: 240, after: 160, line: 480 },
    alignment: AlignmentType.JUSTIFIED
  });
}

// 创建表格
function createTable(rows) {
  const noBorder = {
    top: { style: BorderStyle.NONE, size: 0 },
    bottom: { style: BorderStyle.NONE, size: 0 },
    left: { style: BorderStyle.NONE, size: 0 },
    right: { style: BorderStyle.NONE, size: 0 }
  };
  
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map((cells, rowIndex) => new TableRow({
      children: cells.map(cell => new TableCell({
        children: [new Paragraph({
          children: [new TextRun({ 
            text: cell, 
            font: FONT, 
            size: FONT_SIZE, 
            bold: rowIndex === 0 
          })],
          alignment: AlignmentType.CENTER
        })],
        borders: noBorder,
        width: { size: 100/cells.length, type: WidthType.PERCENTAGE }
      }))
    }))
  });
}

// 主函数
async function main() {
  const content = readFileSync('reports/市场周报_2026年2月27日.md', 'utf8');
  const lines = content.split('\n');
  const children = [];
  
  let tableRows = [];
  let title = '';
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // 跳过分隔线
    if (line === '---') continue;
    
    // 一级标题 - 文档标题
    if (line.startsWith('# ')) {
      title = line.replace('# ', '');
      children.push(createTitle(title));
      continue;
    }
    
    // 二级标题 - 章节标题
    if (line.startsWith('## ')) {
      // 先处理之前的表格
      if (tableRows.length > 0) {
        children.push(createTable(tableRows));
        tableRows = [];
        children.push(createParagraph('')); // 空行
      }
      const text = line.replace('## ', '');
      children.push(createSectionHeader(text));
      continue;
    }
    
    // 表格行
    if (line.startsWith('|') && line.includes('|') && !line.includes('---')) {
      const cells = line.split('|').filter(c => c.trim()).map(c => c.trim());
      if (cells.length > 0) tableRows.push(cells);
      continue;
    }
    
    // 表格分隔行 - 跳过
    if (line.includes('|') && line.includes('---')) {
      continue;
    }
    
    // 先处理之前的表格
    if (tableRows.length > 0) {
      children.push(createTable(tableRows));
      tableRows = [];
      children.push(createParagraph('')); // 空行
    }
    
    // 编号段落 (1）2）等)
    if (line.match(/^\d+）/)) {
      children.push(createParagraph(line));
      continue;
    }
    
    // 独立粗体小标题 (**xxx**)
    if (line.match(/^\*\*[^*]+\*\*$/)) {
      const text = line.replace(/\*\*/g, '');
      children.push(new Paragraph({
        children: [new TextRun({ text, font: FONT, size: FONT_SIZE, bold: true })],
        spacing: { before: 240, after: 160, line: 480 },
        alignment: AlignmentType.JUSTIFIED
      }));
      continue;
    }
    
    // 普通段落（非空行）
    if (line.trim()) {
      children.push(createParagraph(line));
    }
  }
  
  // 处理最后的表格
  if (tableRows.length > 0) {
    children.push(createTable(tableRows));
  }
  
  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: FONT, size: FONT_SIZE }
        }
      }
    },
    sections: [{
      properties: {
        page: {
          margin: {
            top: convertInchesToTwip(1),
            bottom: convertInchesToTwip(1),
            left: convertInchesToTwip(1.25),
            right: convertInchesToTwip(1.25)
          }
        }
      },
      children
    }]
  });
  
  const buffer = await Packer.toBuffer(doc);
  writeFileSync('reports/市场周报 2026年2月27日.docx', buffer);
  console.log('✅ Created: reports/市场周报 2026年2月27日.docx');
}

main().catch(console.error);
