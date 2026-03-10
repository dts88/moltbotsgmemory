#!/usr/bin/env node
/**
 * 市场周报 W08 (2026-02-15 ~ 2026-02-21)
 * 使用2月19日数据（今日收盘尚未发布）
 */

import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, BorderStyle, convertInchesToTwip } from 'docx';
import { writeFileSync, mkdirSync } from 'fs';
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
      after: options.spaceAfter || 160, // 8pt
      line: 480  // Double spacing
    },
    alignment: options.center ? AlignmentType.CENTER : AlignmentType.JUSTIFIED
  });
}

function createTitle(text) {
  return new Paragraph({
    children: [createText(text, { bold: true })],
    spacing: { before: 0, after: 160, line: 480 },
    alignment: AlignmentType.CENTER
  });
}

function createSectionHeader(text) {
  return new Paragraph({
    children: [createText(text, { bold: true })],
    spacing: { before: 240, after: 160, line: 480 },
    alignment: AlignmentType.JUSTIFIED
  });
}

function createPriceTable(priceData, dateStr) {
  const noBorder = {
    top: { style: BorderStyle.NONE, size: 0 },
    bottom: { style: BorderStyle.NONE, size: 0 },
    left: { style: BorderStyle.NONE, size: 0 },
    right: { style: BorderStyle.NONE, size: 0 }
  };
  
  const createCell = (text, bold = false) => new TableCell({
    children: [new Paragraph({
      children: [new TextRun({ text: String(text), font: FONT, size: FONT_SIZE, bold })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 0, line: 360 }
    })],
    borders: noBorder
  });
  
  const headerRow = new TableRow({
    children: [
      createCell('', true),
      createCell(dateStr, true),
      createCell('周涨跌', true),
      createCell('周涨跌', true),
      createCell('价格', true),
      createCell('本周', true)
    ]
  });
  
  const subHeaderRow = new TableRow({
    children: [
      createCell(''),
      createCell('美元'),
      createCell('美元'),
      createCell('%'),
      createCell('人民币/吨'),
      createCell('走势')
    ]
  });
  
  const rows = priceData.map(item => {
    const trend = item.weekChange > 0 ? '↗' : (item.weekChange < 0 ? '↘' : '→');
    return new TableRow({
      children: [
        createCell(item.name),
        createCell(item.price.toFixed(2)),
        createCell((item.weekChange >= 0 ? '+' : '') + item.weekChange.toFixed(2)),
        createCell((item.weekChangePct >= 0 ? '+' : '') + item.weekChangePct.toFixed(1) + '%'),
        createCell(item.cnyPerTon.toFixed(0)),
        createCell(trend)
      ]
    });
  });
  
  return new Table({
    rows: [headerRow, subHeaderRow, ...rows],
    width: { size: 100, type: WidthType.PERCENTAGE }
  });
}

async function main() {
  const usdCny = 6.94;
  
  // 价格数据 (2月19日 vs 上周五2月13日)
  const priceData = [
    { 
      name: '迪拜首行', 
      price: 70.15, 
      lastFriday: 66.87,
      get weekChange() { return this.price - this.lastFriday; },
      get weekChangePct() { return (this.price - this.lastFriday) / this.lastFriday * 100; },
      get cnyPerTon() { return this.price * 7.33 * usdCny; }
    },
    { 
      name: '布伦特首行', 
      price: 71.07, 
      lastFriday: 67.49,
      get weekChange() { return this.price - this.lastFriday; },
      get weekChangePct() { return (this.price - this.lastFriday) / this.lastFriday * 100; },
      get cnyPerTon() { return this.price * 7.33 * usdCny; }
    },
    { 
      name: 'WTI首行', 
      price: 65.88, 
      lastFriday: 62.78,
      get weekChange() { return this.price - this.lastFriday; },
      get weekChangePct() { return (this.price - this.lastFriday) / this.lastFriday * 100; },
      get cnyPerTon() { return this.price * 7.33 * usdCny; }
    },
    { 
      name: '新加坡92号汽油', 
      price: 76.08, 
      lastFriday: 71.58,
      get weekChange() { return this.price - this.lastFriday; },
      get weekChangePct() { return (this.price - this.lastFriday) / this.lastFriday * 100; },
      get cnyPerTon() { return this.price * 8.33 * usdCny; }
    },
    { 
      name: '新加坡10ppm柴油', 
      price: 91.87, 
      lastFriday: 87.47,
      get weekChange() { return this.price - this.lastFriday; },
      get weekChangePct() { return (this.price - this.lastFriday) / this.lastFriday * 100; },
      get cnyPerTon() { return this.price * 7.46 * usdCny; }
    },
    { 
      name: '新加坡航煤', 
      price: 90.87, 
      lastFriday: 86.40,
      get weekChange() { return this.price - this.lastFriday; },
      get weekChangePct() { return (this.price - this.lastFriday) / this.lastFriday * 100; },
      get cnyPerTon() { return this.price * 7.88 * usdCny; }
    },
    { 
      name: '新加坡380燃料油', 
      price: 441.99, 
      lastFriday: 430.87,
      get weekChange() { return this.price - this.lastFriday; },
      get weekChangePct() { return (this.price - this.lastFriday) / this.lastFriday * 100; },
      get cnyPerTon() { return this.price * usdCny; }
    }
  ];

  // EIA数据
  const eiaData = [
    'EIA周报显示（截至2月13日），美国航煤库存4380万桶，周增110万桶（+2.4%），同比-0.4%；',
    '航煤消费159万桶/日（周+6.5%），产量179万桶/日（周+2.9%）；',
    '航煤进口15.7万桶/日（较前周增三倍），出口20.3万桶/日，净出口4.6万桶/日；',
    '馏分油库存周降460万桶，降至八周低点。'
  ];

  // 市场因素
  const marketFactors = [
    '美伊紧张局势升级：特朗普政府向伊朗附近部署更多军事资产，市场担忧霍尔木兹海峡供应风险，油价获得地缘溢价支撑。伊朗坚持外交讨论仅限核计划，双方立场仍有较大分歧。',
    
    '亚洲航煤裂解价差突破20美元/桶（vs迪拜），创本周新高。月差结构保持现货升水约1.10美元/桶，市场结构偏紧。',
    
    'ARA航煤库存周增11.6%至95.6万吨，主要受科威特货物到港推动（约18万吨+）。科威特al-Zour和Mina Abdullah炼厂检修后恢复出口。',
    
    '日本Cosmo Oil堺炼厂10万桶/日CDU于2月12日恢复运行，区域供应略有增加。',
    
    '韩国GS Caltex丽水炼厂6.2万桶/日VR hydrocracker将于3月中旬开始检修约2个月，预计影响区域航煤和柴油供应。',
    
    'CPC台湾采购30万桶Jet A-1，定价+2美元/桶vs Mops 3月均价，3月5-25日交付至深澳/高雄。',
    
    'QatarEnergy招标采购32万桶航煤，3月19-20日交付Mesaieed。',
    
    '委内瑞拉：马杜罗被美军移除后首批委内瑞拉燃料油货物抵达ARA，市场供应来源出现新变化。'
  ];

  // 成品油
  const productsText = '本周亚洲炼厂利润分化。迪拜综合裂解利润4.46美元/桶，周环比下降0.60美元。石脑油利润承压，CFR日本vs迪拜裂解-2.72美元/桶，周降1.20美元；FOB新加坡vs布伦特裂解-5.29美元/桶，周降0.73美元。汽油利润回落，92号FOB新加坡vs迪拜裂解7.59美元/桶，周降0.93美元。中馏分油利润走强，航煤裂解20.11美元/桶，周涨1.04美元；柴油裂解20.89美元/桶，周涨1.06美元。燃料油利润改善，180cst裂解-1.64美元/桶，周涨0.34美元；380cst裂解-2.31美元/桶，周涨0.46美元；低硫船燃（0.5%）利润7.15美元/桶，周涨1.50美元。LPG方面，丁烷CFR东北亚596.5美元/吨，周降29.5美元；丙烷CFR东北亚579.5美元/吨，周降29.5美元，受春节前备货结束影响。';

  // TD3C
  const td3cText = `本周VLCC市场中东航线强势反弹。TD3从周初W135升至W147确认成交，传闻W170水平。船东惜售、中东地缘紧张局势及货盘数量有限等多重因素叠加，推动运价大幅上扬。

大西洋方面同样活跃，巴西东行升至W130，USG一口价突破14.45百万美元。西非成交W136.5（+15年船）。五艘USG货盘船只因运价谈崩而落空，显示船东底气十足。

市场焦点：部分中东/西非货盘被Suezmax分流，两艘苏伊士型船运价接近VLCC水平。巴西连续四货盘在市，配合印度长期采购协议消息，大西洋市场成为本周主要驱动力。

春节在即，但MEG历来不因此冷淡。船东占优，短期看涨。`;

  // 生成市场因素段落
  const marketFactorParagraphs = [];
  
  // 1) EIA数据
  marketFactorParagraphs.push(createParagraph(`1）${eiaData[0]}`));
  for (let i = 1; i < eiaData.length; i++) {
    marketFactorParagraphs.push(createParagraph(eiaData[i]));
  }
  
  // 2) 及以后
  marketFactors.forEach((text, index) => {
    marketFactorParagraphs.push(createParagraph(`${index + 2}）${text}`));
  });

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
      children: [
        createTitle('市场周报 2026年2月20日'),
        createParagraph('（价格数据截至2月19日，待今日收盘更新）', { center: true }),
        createParagraph(''),
        
        createSectionHeader('一、价格走势'),
        createPriceTable(priceData, '2月19日'),
        createParagraph(''),
        
        createSectionHeader('二、市场因素'),
        ...marketFactorParagraphs,
        createParagraph(''),
        
        createSectionHeader('三、成品油'),
        createParagraph(productsText),
        createParagraph(''),
        
        createSectionHeader('四、TD3C（中东至中国）'),
        ...td3cText.split('\n\n').map(para => createParagraph(para))
      ]
    }]
  });
  
  const buffer = await Packer.toBuffer(doc);
  
  // 确保输出目录存在
  mkdirSync(join(WORKSPACE, 'reports/output'), { recursive: true });
  
  const outputPath = join(WORKSPACE, 'reports/output/市场周报_2026年2月20日_草稿.docx');
  writeFileSync(outputPath, buffer);
  console.log('✅ Word 文档已生成:', outputPath);
  
  return outputPath;
}

main().catch(console.error);
