import { Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun, HeadingLevel, BorderStyle, WidthType, AlignmentType } from 'docx';
import { readFileSync, writeFileSync } from 'fs';

const md = readFileSync('reports/knowledge/20260224_美国对华化学品关税分析.md', 'utf8');

const children = [];

// Parse markdown line by line
const lines = md.split('\n');
let inTable = false;
let tableRows = [];
let tableHeaders = [];

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  
  // Skip empty lines
  if (!line.trim()) {
    if (inTable && tableRows.length > 0) {
      // End table
      const table = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: tableRows.map((cells, idx) => new TableRow({
          children: cells.map(cell => new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: cell, bold: idx === 0 })] })],
            shading: idx === 0 ? { fill: 'f0f0f0' } : undefined,
          }))
        }))
      });
      children.push(table);
      tableRows = [];
      inTable = false;
    }
    continue;
  }
  
  // Headers
  if (line.startsWith('# ')) {
    children.push(new Paragraph({ text: line.slice(2), heading: HeadingLevel.HEADING_1 }));
  } else if (line.startsWith('## ')) {
    children.push(new Paragraph({ text: line.slice(3), heading: HeadingLevel.HEADING_2 }));
  } else if (line.startsWith('### ')) {
    children.push(new Paragraph({ text: line.slice(4), heading: HeadingLevel.HEADING_3 }));
  } else if (line.startsWith('---')) {
    // Horizontal rule - skip or add spacing
    children.push(new Paragraph({ text: '' }));
  } else if (line.startsWith('|')) {
    // Table row
    inTable = true;
    const cells = line.split('|').slice(1, -1).map(c => c.trim());
    if (!cells.every(c => c.match(/^[-:]+$/))) {
      tableRows.push(cells);
    }
  } else if (line.startsWith('> ')) {
    // Blockquote
    children.push(new Paragraph({
      children: [new TextRun({ text: line.slice(2), italics: true })],
      indent: { left: 720 }
    }));
  } else if (line.startsWith('- ')) {
    // List item
    children.push(new Paragraph({
      children: [new TextRun({ text: '• ' + line.slice(2) })],
      indent: { left: 360 }
    }));
  } else if (line.match(/^\d+\. /)) {
    // Numbered list
    children.push(new Paragraph({
      children: [new TextRun({ text: line })],
      indent: { left: 360 }
    }));
  } else if (line.startsWith('**') && line.endsWith('**')) {
    // Bold paragraph
    children.push(new Paragraph({
      children: [new TextRun({ text: line.replace(/\*\*/g, ''), bold: true })]
    }));
  } else {
    // Regular paragraph - handle inline formatting
    const runs = [];
    let text = line;
    // Simple bold handling
    const parts = text.split(/(\*\*[^*]+\*\*)/);
    for (const part of parts) {
      if (part.startsWith('**') && part.endsWith('**')) {
        runs.push(new TextRun({ text: part.slice(2, -2), bold: true }));
      } else if (part) {
        runs.push(new TextRun({ text: part }));
      }
    }
    children.push(new Paragraph({ children: runs }));
  }
}

// Final table if any
if (tableRows.length > 0) {
  const table = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: tableRows.map((cells, idx) => new TableRow({
      children: cells.map(cell => new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text: cell, bold: idx === 0 })] })],
        shading: idx === 0 ? { fill: 'f0f0f0' } : undefined,
      }))
    }))
  });
  children.push(table);
}

const doc = new Document({
  sections: [{ children }]
});

const buffer = await Packer.toBuffer(doc);
writeFileSync('reports/output/美国对华化学品关税分析_20260224.docx', buffer);
console.log('DOCX created: reports/output/美国对华化学品关税分析_20260224.docx');
