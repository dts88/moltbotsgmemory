#!/usr/bin/env node
/**
 * 市场周报 Word 文档生成器 - 2026-W13 (Mar 22-27)
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
    createCell('', true), createCell('03月27日', true), createCell('日涨跌', true),
    createCell('日涨跌', true), createCell('周涨跌', true), createCell('人民币', true), createCell('走势', true),
  ]});

  const subHeaderRow = new TableRow({ children: [
    createCell('品种', true), createCell('价格(美元)', true), createCell('(美元)', true),
    createCell('(%)', true), createCell('(%)', true), createCell('(元/吨)', true), createCell('本周', true),
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

async function main() {
  const usdCny = 6.91;

  // 价格数据：本周五 3/27 vs 昨日 3/26 vs 上周五 3/20
  // Dubai今日有收盘；其余品种用3/26数据作最新收盘
  const priceData = [
    {
      name: '迪拜首行',
      price: 122.14,
      dailyChange: 122.14 - 113.04,
      dailyChangePct: (122.14 - 113.04) / 113.04 * 100,
      weekChangePct: (122.14 - 158.85) / 158.85 * 100,
      cnyPerTon: 122.14 * 7.33 * usdCny,
      trend: '↘'
    },
    {
      name: '布伦特首行',
      price: 106.03,
      dailyChange: null,
      dailyChangePct: null,
      weekChangePct: (106.03 - 114.13) / 114.13 * 100,
      cnyPerTon: 106.03 * 7.33 * usdCny,
      trend: '↘'
    },
    {
      name: 'WTI首行',
      price: 93.57,
      dailyChange: null,
      dailyChangePct: null,
      weekChangePct: (93.57 - 97.19) / 97.19 * 100,
      cnyPerTon: 93.57 * 7.33 * usdCny,
      trend: '↘'
    },
    {
      name: '新加坡92号汽油',
      price: 127.48,
      dailyChange: null,
      dailyChangePct: null,
      weekChangePct: (127.48 - 150.61) / 150.61 * 100,
      cnyPerTon: 127.48 * 8.33 * usdCny,
      trend: '↘'
    },
    {
      name: '新加坡10ppm柴油',
      price: 216.56,
      dailyChange: null,
      dailyChangePct: null,
      weekChangePct: (216.56 - 223.02) / 223.02 * 100,
      cnyPerTon: 216.56 * 7.46 * usdCny,
      trend: '↘'
    },
    {
      name: '新加坡航煤',
      price: 200.54,
      dailyChange: null,
      dailyChangePct: null,
      weekChangePct: (200.54 - 222.52) / 222.52 * 100,
      cnyPerTon: 200.54 * 7.88 * usdCny,
      trend: '↘'
    },
    {
      name: '新加坡380燃料油',
      price: 656.85,
      dailyChange: null,
      dailyChangePct: null,
      weekChangePct: (656.85 - 737.00) / 737.00 * 100,
      cnyPerTon: 656.85 * usdCny,
      trend: '↘'
    }
  ];

  const marketFactors = [
    // ── 产业 ──────────────────────────────────────────
    // 1. EIA（永远第一条）
    'EIA周报（截至3月20日）显示，美国商业原油库存（除SPR）连续三周累库，本周增加693万桶至4.562亿桶，库欣同步增加250万桶；成品油方面，汽油去库259万桶，馏分油增加303万桶；供应端，炼厂加工量大幅提升366千桶/日至16598千桶/日，原油产量小幅回落至13657千桶/日；贸易方面，原油出口骤降1576千桶/日至3322千桶/日，主要进口来源为加拿大（3927千桶/日），伊拉克进口回升至270千桶/日，委内瑞拉549千桶/日（+126）。',

    // 2. Trump延长deadline
    '特朗普于3月26日再次延长对伊朗能源设施打击暂停期限，将最后期限从原定当日延至4月6日东部时间晚8点，并在Truth Social上表示"应伊朗政府请求"暂停打击；特朗普同时要求伊朗释放10艘油轮（含巴基斯坦旗船只）过境霍尔木兹作为善意举措，并宣称谈判"正在进行中"。',

    // 3. 伊朗否认 + 五点反提案
    '伊朗外长否认与美国存在直接谈判接触，并发布五点反提案，条件包括要求保持对霍尔木兹海峡的控制权，与美方15点和平方案分歧巨大。伊朗同时宣布允许中国、俄罗斯、印度、伊拉克、巴基斯坦五个"友好国"船只过境霍尔木兹，但明确将伊朗对立国排除。Kpler实时数据显示，自冲突以来霍尔木兹LNG过境归零（最后一艘满载LNG为2月28日），原油laden过境降至冲突前不足5%（3月1日至21日累计约36艘次，对比冲突前约55艘/天）。',

    // 4. 油价大幅回落
    '受和谈预期驱动，本周油价经历剧烈双向波动：周一特朗普释放停火信号后，布伦特单日下挫约15%；此后随双方立场出现反复，价格持续宽幅震荡。截至本周五，迪拜原油收于122.14美元/桶，较上周五（158.85美元）下跌36.71美元（-23.1%）；布伦特约106美元（-7.1%），WTI约94美元（-3.7%）；布伦特-WTI价差收窄至约12美元。',

    // 5. 霍尔木兹/MEG供应现状
    '霍尔木兹海峡对西方船只实质仍处封锁状态，约200艘船只徘徊区域；沙特Safaniya和Zuluf油田停产状况未见改变；延布（Yanbu）港口停靠原油油轮逾30艘，另有64艘标注延布为目的地，港口拥堵加剧。本周延布一笔成交（W190），但保护性条款争议导致多数船东退出，成交价格大幅低于预期；富查伊拉至泰国成交W210（低于上次W290约80点），由中资老龄船（>15年）接货。',

    // 6. 全球贸易格局重构
    '全球原油贸易格局加速重构：至少7艘原本开往中国的俄罗斯原油油轮已改道印度；印度从俄罗斯进口原油本月逼近历史高位；中国2026年前两月俄罗斯海运原油进口同比增约40%；受高油价冲击，中国有意削减采购，利用高库存缓冲。大西洋盆地原油（北海、西非、美湾WTI）继续成为亚洲买家补货主要来源。',

    // 7. 美国SPR释放
    '美国战略石油储备（SPR）大规模释放推动美湾（USG）原油出口货盘激增，成为本周全球最主要的活跃原油出口市场，吸引大量VLCC和苏伊士型油轮从中东转赴大西洋揽货。',

    // 8. LNG——卡塔尔
    'QatarEnergy首席执行官正式确认，拉斯拉凡（Ras Laffan）工业区受伊朗打击造成约17%的液化天然气产能损毁（约13百万吨/年），修复需3至5年，年损收入约200亿美元。美国LNG出口商迎来历史性机遇，欧亚买家加快签约；但LNG运输成本仍受绕行因素推高。',

    // 9. LPG回落
    '液化石油气（LPG）价格本周大幅回落：丁烷CFR东北亚下跌150美元/吨至1005.5美元/吨，丙烷下跌170美元/吨至955.5美元/吨，和谈预期带来的风险溢价回吐叠加供应面回暖预期共同施压。',

    // 10. 需求侧冲击
    '高油价导致需求端出现初步破坏迹象：欧洲工业活动进一步放缓；亚洲经济体启动燃料补贴应急计划；IMF和世行本周上调对2026年全球GDP的下行风险评估，能源冲击被列为当前最主要的外生性衰退风险因子。中国及部分亚洲炼厂削减加工量以应对超高原料成本。',

    // ── 机构观点 ───────────────────────────────────────
    // 13. 综合机构观点
    '分析机构普遍指出，本周油价回落更多反映情绪主导而非实质供应改善：霍尔木兹实际流量对西方船只仍极低，伊朗仅选择性允许"友好国"过境；即便4月6日后达成停火，卡塔尔LNG（修复3-5年）、沙特离岸油田复产、以及全球SPR大量消耗（OECD储备或降至约10亿桶低位）等中期结构性缺口短期内难以填补，油价下行空间有限。',

    // 14. 高盛观点（3月22日报告）
    '高盛3月22日发布更新报告，上调油价预测：基准假设霍尔木兹流量维持5%正常水平约6周（至约4月11日），布伦特3-4月均价预测从98美元上调至110美元，较2025年年均价上涨62%；2026年全年布伦特均价从77美元上调至85美元，WTI从72美元上调至79美元；2026年四季度布伦特/WTI从71/67美元上调至80/75美元，2027年均价维持80/75美元。在霍尔木兹封锁持续10周的风险情景下，布伦特日价有望突破2008年历史高位；不利情景（供应随重开恢复）下四季度回落至100美元，极端情景（中东产量持续损失200万桶/日）下则收敛至115美元。高盛同时指出，本次为有史以来最大供应冲击，事后各国将重建更高战略储备目标，市场将对长期油价形成结构性安全溢价。',

    // 15. Rapidan/REG观点
    'Rapidan Energy Group（REG）指出，霍尔木兹"友好国通行"方案将全球原油贸易格局一分为二：中俄印等国可相对低成本维持中东供应，而西方市场将持续依赖更昂贵的大西洋盆地及SPR释放货源；这一分化将使布伦特-WTI价差长期维持扩大态势。',

    // ── 宏观 ──────────────────────────────────────────
    // 16. 美联储
    '美联储官员本周表示，若油价因和谈维持回落，通胀压力将有所缓解，有助于为年内降息创造条件；但伊朗局势的不确定性使政策路径仍难以预判，点阵图仍预计年内降息一次，市场对降息预期因本周油价回落而小幅升温。',

    // 17. 汇率/宏观
    '美元指数本周随地缘风险缓和而小幅回落；美元兑人民币小幅走强至6.91；能源进口大国货币（日元、韩元、印度卢比）受益于油价回落而普遍反弹；市场关注下周美国CPI数据能否体现能源成本阶段性回落。',

    // 18. 4月6日前景
    '4月6日成为下阶段最关键节点：若伊朗届时未达成实质让步（尤其是霍尔木兹正式重开），特朗普面临是否重启能源设施打击的抉择；目前双方五点与十五点方案分歧巨大，能源市场在4月6日前将维持高度不确定态势，价格波动性预计仍将极高。',
  ];

  const productsText = '本周亚洲炼厂利润随原油价格大幅下跌而显著改善。石脑油加工利润上涨1.32美元至21.55美元/桶（CFR日本 vs 迪拜），汽油利润下跌4.89美元至18.90美元/桶，航煤利润下跌9.90美元至62.39美元/桶，柴油利润小幅上涨0.93美元至63.00美元/桶，燃料油方面180CST与380CST裂解利润进一步走弱，分别下跌1.86和2.01美元至-3.19和-3.93美元/桶，低硫船燃（VLSFO）富查伊拉裂解利润大幅下跌25.72美元/吨至10.00美元/吨，反映和谈预期削弱富查伊拉供应中断溢价。LPG方面，丁烷CFR东北亚下跌150美元至1005.5美元/吨，丙烷下跌170美元至955.5美元/吨。整体来看，迪拜综合裂解利润大幅上涨39.17美元至38.79美元/桶，为原油价格回落快于成品油所致。';

  const td3cText = `TD3C VLCC 运费本周小幅回落，收于 W366.25，约1041万美元/船，折合约5.37美元/桶，日租金TCE约356,483美元/天。

中东方面，霍尔木兹实质仍处封锁状态，MEG新鲜货盘几乎绝迹。延布（Yanbu）本周一笔成交W190，但保护性附加条款争议导致多数船东退出谈判，成交价格远低于预期；富查伊拉至泰国货以W210成交（较上次低约W80点），中资老龄船（>15年）接货；伊朗凝析油马来西亚/韩国线几乎无人问津。面对极为苛刻的保护性条款要求，多数船东选择压载转赴大西洋。特朗普宣称正与伊朗谈判但遭伊朗否认，运价未因消息出现实质缓和，TD3C评估周内一度走高，反映MEG可用船只日益稀少。

大西洋方面成为本周全球主导市场。美国SPR大规模释放推动USG货量骤增，VLCC成交约2400万美元/船（USG/中国，正常船期），苏伊士型凭借机动性优势成交约1800万美元/船（百万桶，绕好望角）；WAF与巴西市场有货盘活动但涨势有限，部分WAF VLCC以W150成交（印度09年建造船），短期运力向USG集中制约了大西洋其他航线的上行空间。整体而言，4月6日和谈截止日期成为市场下阶段最大变量。`;

  const reportData = { date: '2026年3月27日', priceData, marketFactors, productsText, td3cText };

  const doc = new Document({
    sections: [{
      properties: { page: { margin: { top: 1440, bottom: 1440, left: 1800, right: 1800 } } },
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
  const outputPath = join(WORKSPACE, 'reports/output/市场周报_2026年3月27日.docx');
  writeFileSync(outputPath, buffer);
  console.log('✅ Word 文档已生成:', outputPath);
}

main().catch(console.error);
