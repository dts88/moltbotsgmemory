#!/usr/bin/env node
/**
 * 市场周报 Word 文档生成器 - 2026-W12
 */

import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, BorderStyle } from 'docx';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKSPACE = join(__dirname, '..');

const FONT = '等线';
const FONT_SIZE = 40;

function createText(text, options = {}) {
  return new TextRun({ text, font: FONT, size: options.size || FONT_SIZE, bold: options.bold || false, ...options });
}

function createParagraph(content, options = {}) {
  const children = typeof content === 'string' ? [createText(content, options)] : content;
  return new Paragraph({
    children,
    spacing: { before: options.spaceBefore || 0, after: options.spaceAfter || 160, line: 480 },
    alignment: AlignmentType.JUSTIFIED
  });
}

function createTitle(text) {
  return new Paragraph({
    children: [new TextRun({ text, font: FONT, size: FONT_SIZE, bold: true })],
    spacing: { before: 0, after: 160, line: 480 },
    alignment: AlignmentType.CENTER
  });
}

function createSectionHeader(text) {
  return new Paragraph({
    children: [new TextRun({ text, font: FONT, size: FONT_SIZE, bold: true })],
    spacing: { before: 240, after: 160, line: 480 },
    alignment: AlignmentType.JUSTIFIED
  });
}

function createPriceTable(priceData) {
  const noBorder = {
    top: { style: BorderStyle.NONE, size: 0 }, bottom: { style: BorderStyle.NONE, size: 0 },
    left: { style: BorderStyle.NONE, size: 0 }, right: { style: BorderStyle.NONE, size: 0 }
  };
  const createCell = (text, bold = false) => new TableCell({
    children: [new Paragraph({ children: [new TextRun({ text, font: FONT, size: FONT_SIZE, bold })], alignment: AlignmentType.CENTER })],
    borders: noBorder
  });

  const headerRow = new TableRow({ children: [
    createCell('', true),
    createCell('03月20日', true),
    createCell('日涨跌', true),
    createCell('日涨跌', true),
    createCell('周涨跌', true),
    createCell('人民币', true),
    createCell('走势', true),
  ]});

  const subHeaderRow = new TableRow({ children: [
    createCell('品种', true),
    createCell('价格(美元)', true),
    createCell('(美元)', true),
    createCell('(%)', true),
    createCell('(%)', true),
    createCell('(元/吨)', true),
    createCell('本周', true),
  ]});

  const rows = priceData.map(item => new TableRow({ children: [
    createCell(item.name),
    createCell(item.price.toFixed(2)),
    createCell(item.dailyChange !== null ? (item.dailyChange >= 0 ? '+' : '') + item.dailyChange.toFixed(2) : '-'),
    createCell(item.dailyChangePct !== null ? (item.dailyChangePct >= 0 ? '+' : '') + item.dailyChangePct.toFixed(2) + '%' : '-'),
    createCell((item.weekChangePct >= 0 ? '+' : '') + item.weekChangePct.toFixed(2) + '%'),
    createCell(Math.round(item.cnyPerTon).toLocaleString()),
    createCell(item.trend),
  ]}));

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, subHeaderRow, ...rows]
  });
}

async function generateReport(data) {
  const { date, priceData, eiaData, marketFactors, productsText, td3cText } = data;

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          margin: { top: 1440, bottom: 1440, left: 1800, right: 1800 }
        }
      },
      children: [
        createTitle(`市场周报  ${date}`),
        createSectionHeader('一、价格走势'),
        createPriceTable(priceData),
        createParagraph(''),
        createSectionHeader('二、市场因素'),
        ...marketFactors.map((f, i) => createParagraph(`${i + 1}）${f}`)),
        createSectionHeader('三、成品油'),
        createParagraph(productsText),
        createSectionHeader('四、TD3C（中东至中国）'),
        createParagraph(td3cText),
      ]
    }]
  });

  return doc;
}

async function main() {
  const usdCny = 6.89;

  const priceData = [
    {
      name: '迪拜首行',
      price: 158.85,
      dailyChange: 158.85 - 166.80,
      dailyChangePct: (158.85 - 166.80) / 166.80 * 100,
      weekChangePct: (158.85 - 145.51) / 145.51 * 100,
      cnyPerTon: 158.85 * 7.33 * usdCny,
      trend: '↗'
    },
    {
      name: '布伦特首行',
      price: 114.13,
      dailyChange: null,
      dailyChangePct: null,
      weekChangePct: (114.13 - 101.74) / 101.74 * 100,
      cnyPerTon: 114.13 * 7.33 * usdCny,
      trend: '↗'
    },
    {
      name: 'WTI首行',
      price: 97.19,
      dailyChange: null,
      dailyChangePct: null,
      weekChangePct: (97.19 - 97.09) / 97.09 * 100,
      cnyPerTon: 97.19 * 7.33 * usdCny,
      trend: '→'
    },
    {
      name: '新加坡92号汽油',
      price: 150.61,
      dailyChange: 150.61 - 151.93,
      dailyChangePct: (150.61 - 151.93) / 151.93 * 100,
      weekChangePct: (150.61 - 136.44) / 136.44 * 100,
      cnyPerTon: 150.61 * 8.33 * usdCny,
      trend: '↗'
    },
    {
      name: '新加坡10ppm柴油',
      price: 224.50,
      dailyChange: null,
      dailyChangePct: null,
      weekChangePct: (224.50 - 192.48) / 192.48 * 100,
      cnyPerTon: 224.50 * 7.46 * usdCny,
      trend: '↗'
    },
    {
      name: '新加坡航煤',
      price: 227.42,
      dailyChange: null,
      dailyChangePct: null,
      weekChangePct: (227.42 - 199.50) / 199.50 * 100,
      cnyPerTon: 227.42 * 7.88 * usdCny,
      trend: '↗'
    },
    {
      name: '新加坡380燃料油',
      price: 782.09,
      dailyChange: null,
      dailyChangePct: null,
      weekChangePct: (782.09 - 737.39) / 737.39 * 100,
      cnyPerTon: 782.09 * usdCny,
      trend: '↗'
    }
  ];

  const eiaData = []; // not used directly

  const marketFactors = [
    // ── 产业 ──────────────────────────────────────────
    // 1. EIA（永远第一条，紧凑叙述段落）
    'EIA周报（截至3月13日）显示，美国除却战略储备的商业原油库存增加616万桶至4.493亿桶，连续两周增库；汽油库存去库544万桶，馏分油库存去库253万桶；美国原油产量小幅回落10千桶/日至13668千桶/日，炼厂加工量小幅提升至16232千桶/日；原油出口大幅增加1464千桶/日至4898千桶/日，反映全球买家加大对美国原油采购。本期数据截至3月13日，尚未完全反映中东战争供应中断影响。',

    // 2. 供应中断——伊朗
    '美军于3月14日打击伊朗霍尔木兹岛（Kharg Island）石油出口枢纽，目标包括90余处军事设施。该岛承担伊朗约90%的原油出口，战前伊朗出口量约为110—150万桶/日；被毁基础设施重建可能需要数年时间。',

    // 3. 供应中断——沙特
    '受霍尔木兹通道关闭影响，沙特阿美（Aramco）被迫关停沙法尼亚（Safaniya）和祖卢夫（Zuluf）两大近海油田，沙特产量降至约800万桶/日，较正常水平减少约200万桶/日（降幅约20%）；沙特正将更多原油通过延布（Yanbu）红海港口管道输出，但总体可出口量大幅受限。',

    // 4. 供应中断——富查伊拉/延布
    '富查伊拉（Fujairah）港口遭无人机袭击，这一中东最大储油中枢的运营受到严重干扰，愿意驶往富查伊拉装卸的船东名单大幅收缩。3月19日美以打击伊朗天然气设施后，伊朗对延布（Yanbu）发出报复警告，延布为MEG区域最后的"相对安全"出口选项，沙特通过红海管道绕过霍尔木兹的500万桶/日出口产能面临危机。',

    // 5. 供应中断——整体规模
    '伊朗封锁霍尔木兹海峡影响全球约20%的原油供应及大量LNG出口量，IEA警告此次事件为"石油市场历史上最大规模供应中断"。中东战争爆发（2月28日）至今，布伦特原油累计上涨约60%。美国特朗普政府就战争持续时间发表乐观评论，但市场未见实质停火信号。',

    // 6. 政策响应——IEA储备
    '国际能源署（IEA）联合30余个成员国于3月14日宣布释放4亿桶战略石油储备，为历史最大规模紧急释放，其中美国贡献1.72亿桶。然而受中东供应中断规模远超储备释放量影响，油价仍持续走高。IEA于3月16日再度表示正研究进一步释放储备的可行性。',

    // 7-8. LNG
    '伊朗导弹打击卡塔尔（Qatar）拉斯拉凡（Ras Laffan）液化天然气工业区：QatarEnergy早在3月初已宣布对77百万吨/年（mtpa）LNG设施实施不可抗力；3月19日再遭伊朗打击，报告称设施受到"广泛损毁"。卡塔尔作为全球第二大LNG出口国，其停产将对亚洲长约买家（日本、韩国、中国）及欧洲市场造成多年影响。亚洲LNG现货（JKM）价格预计将突破26美元/百万英热，TTF远期曲线亦触及历史高位。',

    '美国LNG出口商受益于卡塔尔供应缺口，欧亚买家加大从美国采购力度；但霍尔木兹封锁及中东航线风险也导致LNG运输成本大幅上升，船东不愿驶入波斯湾区域。',

    // 9. 贸易格局重构
    '全球原油贸易格局加速重构：买家抢购大西洋盆地原油（北海Brent、西非、美湾WTI），大西洋盆地VLCC货盘活跃；北美原油出口量大幅攀升，美国4898千桶/日的周度出口量环比增加1464千桶/日。',

    // 10. WTI/价差
    'WTI原油本周相对平稳（约97美元/桶），主因美国本土供应充裕，压制WTI相对涨幅。布伦特—WTI价差本周扩大至约17美元/桶，创近年最高，反映中东区域供应中断对布伦特升水影响更大。',

    // 11. LPG
    '液化石油气（LPG）价格大幅走高：丁烷CFR东北亚本周升至1155.5美元/吨（周环比+255美元），丙烷CFR东北亚升至1125.5美元/吨（+249美元），受中东供应中断及部分市场转向LPG替代燃料需求共同驱动。',

    // 12. 市场制度
    '普氏（Platts）于3月20日宣布暂停Dubai基准中Murban原油的价格质量调整（QA），即日起Murban交割价不得低于Dubai基准价（QA不可为负），旨在吸引更多货种参与交割以维持迪拜基准体系的流动性，为中东供应中断后的基准稳健性做出制度性应对。',

    // ── 机构观点 ───────────────────────────────────────
    // 13. Standard Chartered / REG
    'Standard Chartered于3月13日将2026年布伦特全年均价预测从70美元/桶上调至85.5美元/桶；Rapidan Energy Group（REG）评估伊朗打击沙特东西管道及延布概率达60%、胡塞武装重新打击红海航运概率达70%（已从60%上调）。',

    // 14-15. 高盛
    '3月19日，高盛预测基准情景下霍尔木兹海峡中断约21天后在4月逐步恢复，布伦特将于2026年四季度回落至70美元区间；高盛战前对布伦特2027年四季度的预测为69美元/桶。短期观点：只要霍尔木兹流量维持极低水平，油价将继续趋升；若中断时间延长，布伦特有望突破2008年历史高点；美国出口限制风险上升将进一步扩大布伦特与WTI的价差。',

    '高盛情景分析对布伦特2027年四季度价格影响（相对69美元/桶基准）：60天霍尔木兹中断可带来+24美元/桶上行（至93美元）；中东产量在重开后持续低2百万桶/日可带来+20美元/桶（至89美元）；两者叠加则影响高达+42美元/桶（至111美元）；全球战略储备加速补库1.2百万桶/日可带来+12美元/桶；若OPEC增产1百万桶/日则将拖累-4美元/桶。高盛认为整体价格风险仍偏上行，历史上大型供应冲击后平均4年内产量损失约42%，长期供应损失风险不可忽视。',

    // ── 宏观 ──────────────────────────────────────────
    // 16. 美联储
    '美联储（Fed）于3月18日FOMC会议上投票维持基准利率3.5%—3.75%不变，声明明确指出中东战争对美国经济影响"不确定"；油价飙升威胁通胀持续高于2%目标，点阵图仍预计2026年降息一次，但市场预期若能源价格维持高位，降息时间可能进一步推迟。',
  ];

  const productsText = '本周亚洲炼厂利润在原油价格大幅攀升背景下急剧分化。石脑油加工利润上涨4.85美元至1.83美元/桶（CFR日本 vs 迪拜），汽油利润上涨3.65美元至23.79美元/桶，航煤利润下跌4.75美元至72.29美元/桶，柴油利润上涨13.53美元至62.07美元/桶，燃料油180CST与380CST裂解利润分别下跌7.65和7.77美元，均转负至-1.33和-1.92美元/桶，低硫船燃（VLSFO）富查伊拉裂解利润下跌15.80美元至35.72美元/吨。LPG方面，丁烷CFR东北亚上涨255美元至1155.5美元/吨，丙烷上涨249美元至1125.5美元/吨，受中东供应中断及能源替代需求驱动。整体来看，迪拜综合裂解利润下跌9.63美元至-0.38美元/桶。';

  const td3cText = `TD3C VLCC 运费本周大幅上扬，收于 W413.89，约1176万美元/船，折合约6.05美元/桶。

中东方面，霍尔木兹封锁及周边打击行动使传统MEG航线几乎无法正常定价，船东各自核算风险溢价，买卖双方报价利差之大"可供一艘超大型油轮通过"。富查伊拉（Fujairah）遭无人机袭击后，愿意驶入该区域的船东名单持续收缩；周初在海峡"暂时重开"预期下出现少量成交，W225 GOO/中国的成交被视为偶发异常值而非市场趋势。延布（Yanbu）曾是MEG区域最后的相对安全装载选项，然而周四美以打击伊朗天然气设施引发报复威胁，延布前景亦告不确定，船东的风险底线进一步收紧。Baltic TD3C单日评估上调+W171.77点，更多反映定价困难与地缘溢价，而非有实货支撑的真实成交。

大西洋市场则与中东形成鲜明对比，基本维持正常交易秩序，成为船东避险首选。巴西运费周内下调约W30点；焦点转向美湾（USG），出现4个新货盘，运价一度反弹；但大量从中东撤出的压载船持续涌入大西洋，对运价形成持续压制，上行空间有限。西非（WAF）市场亦相对稳定，运费下行空间不大。整体而言，中东战争引发的高度不确定性主导全周市场，停火信号缺失使后市走向难以预判，中东运费短期内或仍只能是"理论评估价"。`;

  const reportData = {
    date: '2026年3月20日',
    priceData,
    eiaData,
    marketFactors,
    productsText,
    td3cText
  };

  // 构建 Doc
  const doc = new Document({
    sections: [{
      properties: {
        page: { margin: { top: 1440, bottom: 1440, left: 1800, right: 1800 } }
      },
      children: [
        createTitle(`市场周报  ${reportData.date}`),
        createSectionHeader('一、价格走势'),
        createPriceTable(priceData),
        createParagraph(''),
        createSectionHeader('二、市场因素'),
        ...marketFactors.map((f, i) => createParagraph(`${i + 1}）${f}`)),
        createSectionHeader('三、成品油'),
        createParagraph(productsText),
        createSectionHeader('四、TD3C（中东至中国）'),
        createParagraph(td3cText),
      ]
    }]
  });

  const buffer = await Packer.toBuffer(doc);
  const outputPath = join(WORKSPACE, 'reports/output/市场周报_2026年3月20日.docx');
  writeFileSync(outputPath, buffer);
  console.log('✅ Word 文档已生成:', outputPath);
  return outputPath;
}

main().catch(console.error);
