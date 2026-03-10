#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'fs';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const pdfPath = process.argv[2] || 'reports/inbox/20260219jet.pdf';

async function extractText() {
  const data = new Uint8Array(readFileSync(pdfPath));
  const pdf = await getDocument({ data }).promise;
  
  let fullText = '';
  
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map(item => item.str).join(' ');
    fullText += `\n--- Page ${i} ---\n${pageText}\n`;
  }
  
  console.log(fullText);
}

extractText().catch(console.error);
