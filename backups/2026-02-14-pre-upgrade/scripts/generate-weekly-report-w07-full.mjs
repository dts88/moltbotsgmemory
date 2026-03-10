import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, BorderStyle, convertInchesToTwip } from 'docx';
import { writeFileSync } from 'fs';

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

function createPriceTable(priceData, dateLabel) {
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
  
  const headerRow = new TableRow({ children: [
    createCell('', true), createCell(dateLabel, true), createCell('日涨跌', true),
    createCell('日涨跌', true), createCell('周涨跌', true), createCell('价格 吨', true), createCell('本周', true)
  ]});
  const subHeaderRow = new TableRow({ children: [
    createCell(''), createCell('美元'), createCell('美元'),
    createCell('%'), createCell('%'), createCell('人民币'), createCell('走势')
  ]});
  
  const rows = priceData.map(item => {
    const trend = item.weekChangePct > 0 ? '↗' : (item.weekChangePct < 0 ? '↘' : '→');
    return new TableRow({ children: [
      createCell(item.name),
      createCell(item.price.toFixed(2)),
      createCell((item.dailyChange >= 0 ? '+' : '') + item.dailyChange.toFixed(2)),
      createCell((item.dailyChangePct >= 0 ? '+' : '') + item.dailyChangePct.toFixed(2) + '%'),
      createCell((item.weekChangePct >= 0 ? '+' : '') + item.weekChangePct.toFixed(2) + '%'),
      createCell(item.cnyPerTon.toFixed(0)),
      createCell(trend)
    ]});
  });
  
  return new Table({ rows: [headerRow, subHeaderRow, ...rows], width: { size: 100, type: WidthType.PERCENTAGE } });
}

// 本周数据
const usdCny = 6.95;
const priceData = [
  { name: '迪拜首行', price: 68.69, dailyChange: 68.69-66.87, dailyChangePct: (68.69-66.87)/66.87*100, weekChangePct: (68.69-67.74)/67.74*100, cnyPerTon: 68.69*7.33*usdCny },
  { name: '布伦特首行', price: 69.70, dailyChange: 69.70-67.85, dailyChangePct: (69.70-67.85)/67.85*100, weekChangePct: (69.70-68.29)/68.29*100, cnyPerTon: 69.70*7.33*usdCny },
  { name: 'WTI首行', price: 64.84, dailyChange: 64.84-63.02, dailyChangePct: (64.84-63.02)/63.02*100, weekChangePct: (64.84-63.98)/63.98*100, cnyPerTon: 64.84*7.33*usdCny },
  { name: '新加坡92号汽油', price: 74.83, dailyChange: 74.83-73.51, dailyChangePct: (74.83-73.51)/73.51*100, weekChangePct: (74.83-73.51)/73.51*100, cnyPerTon: 74.83*8.33*usdCny },
  { name: '新加坡10ppm柴油', price: 89.69, dailyChange: 89.69-88.56, dailyChangePct: (89.69-88.56)/88.56*100, weekChangePct: (89.69-89.53)/89.53*100, cnyPerTon: 89.69*7.46*usdCny },
  { name: '新加坡航煤', price: 88.58, dailyChange: 88.58-87.07, dailyChangePct: (88.58-87.07)/87.07*100, weekChangePct: (88.58-87.74)/87.74*100, cnyPerTon: 88.58*7.88*usdCny },
  { name: '新加坡380燃料油', price: 436.67, dailyChange: 436.67-425.02, dailyChangePct: (436.67-425.02)/425.02*100, weekChangePct: (436.67-423.09)/423.09*100, cnyPerTon: 436.67*usdCny }
];

const eiaData = [
  'EIA周报显示，美国截至02月06日，除却战略储备的商业原油库存+850万桶至4.288亿桶，变化+2.0%；',
  '美国战略石油储备（SPR）库存持平，至4.152亿桶；',
  '美国汽油库存增加120万桶，至2.591亿桶；',
  '美国馏分油库存减少270万桶，至1.247亿桶；',
  '上周美国原油产量+50万桶/日，至1371万桶/日；',
  '炼厂输入1600万桶/日，较前一周-3万桶/日。'
];

const marketFactors = [
  '国际能源署（IEA）2月12日发布月报，将2026年全球原油需求增长预测下调近9%至85万桶/日。报告指出1月全球产量骤降120万桶/日，主要受北美极寒天气及哈萨克CPC管道中断影响。IEA预计一季度全球供应过剩380万桶/日，二季度进一步扩大至440万桶/日。美洲五国（美国、加拿大、巴西、圭亚那、阿根廷）今年料增产180万桶/日。',
  '高盛大宗商品团队在最新研报中维持对2026年原油市场的看空立场，将布伦特原油均价预测维持在56美元/桶，WTI预测为52美元/桶。高盛认为，随着页岩油生产效率的再次突破和非OPEC供应的爆发，2026年将出现日均230万桶的巨额顺差。分析指出，若俄乌达成和平协议，油价下行风险可能扩大至51美元/桶。',
  '美国能源信息署（EIA）2月短期能源展望预测，布伦特原油2026年均价为58美元/桶。华尔街主要投行（美银、花旗、高盛、摩根大通、摩根士丹利）对2026年布伦特均价预测约为59美元/桶。',
  'Vitol首席执行官本周表示，地缘政治紧张和对俄伊原油买家的制裁压力正在收紧市场。俄罗斯原油海上浮仓60天内增加4000万桶。俄罗斯海运原油对华报价持续走低，ESPO可成交价已扩大至ICE Brent期货-8.5至-9美元/桶（DES山东），Urals卖盘价-12美元/桶。',
  '美印关系方面，特朗普取消因印度进口俄油而征收的25%额外关税。印度承诺停止直接或间接进口俄罗斯石油，并在未来5年采购5000亿美元美国产品（含能源和国防）。印度MRPL本周采购200万桶Murban和100万桶Basrah Medium（4月交付）。',
  '委内瑞拉原油方面，OFAC明确允许中国买家通过已确立地位的美国实体转售购买委内瑞拉原油。美能源部长赖特证实中国已购买部分由美国采购的委内瑞拉原油。委内瑞拉2月已恢复向西班牙出口约200万桶原油，Repsol重启采购。',
  '中东局势持续紧张。美国海军杰拉尔德·R·福特号航母已下令立即部署至中东，美国准备部署第二艘航母USS George H.W. Bush。伊朗媒体将此解读为迈向战争的一大明确步骤。乌克兰恢复对俄罗斯关键炼厂的无人机袭击。泽连斯基表示支持美国提出的和平提议。',
  '沙特阿拉伯本周更换投资部长，由法立赫换为来自主权基金PIF的Fahad Al-Saif，正在取消部分投资项目并加大力度吸引外资。',
  'LNG市场方面，韩国1月LNG进口596万吨，同比增长45%创历史新高。日本库存2月8日降至189万吨，为18周低点。道达尔CEO表示卡塔尔NFE预计2026年三季度投产。韩国KOGAS采购4-6月10余船，贴水JKM 10-20美分。JKM 4月报10.47-10.48美元/百万英热。',
  '中国政策方面，化工、石化行业预计2027年纳入全国碳排放权交易市场，届时将基本覆盖工业领域主要排放行业。'
];

const productsText = '本周亚洲炼厂利润整体小幅回暖。石脑油加工利润微跌0.04美元至-1.52美元/桶（CFR日本 vs 迪拜），汽油利润基本持平微跌0.02美元至8.52美元/桶，航煤与柴油利润分别变动+0.10与-0.19美元至19.07与19.83美元/桶；燃料油利润显著走强，180 CST与380 CST裂解利润分别上涨0.84与1.06美元至-1.97与-2.78美元/桶，低硫船燃（0.5%）利润小幅下跌0.17美元至5.65美元/桶。LPG方面，丁烷与丙烷CFR东北亚价格双双上涨12.5与13.5美元/吨至626与609美元/吨，受冬季需求支撑。整体来看，受燃料油利润回暖带动，迪拜综合裂解利润上涨0.10美元至5.06美元/桶。';

const td3cText = `中东湾2月船期基本清仓，船东惜售等待3月货盘。大西洋市场表现强势，巴西主导市场情绪，美湾亦有回暖迹象。巴西/东向报价突破WS125，美湾/东向确认1400万美元。

周初MEG市场平静，第三旬仍有25-30船货待覆盖。周中运价小幅走软，活动清淡。IE能源周期间私下成交活跃，市场情绪转涨。Sinokor持续观望，现代吨位紧缺。`;

// 构建文档
const marketFactorParagraphs = [];
marketFactorParagraphs.push(createParagraph(`1）${eiaData[0]}`));
for (let i = 1; i < eiaData.length; i++) {
  marketFactorParagraphs.push(createParagraph(eiaData[i]));
}
marketFactors.forEach((text, index) => {
  marketFactorParagraphs.push(createParagraph(`${index + 2}）${text}`));
});

const doc = new Document({
  styles: { default: { document: { run: { font: FONT, size: FONT_SIZE } } } },
  sections: [{
    properties: { page: { margin: { top: convertInchesToTwip(1), bottom: convertInchesToTwip(1), left: convertInchesToTwip(1.25), right: convertInchesToTwip(1.25) } } },
    children: [
      createTitle('市场周报 2026年2月13日'),
      createSectionHeader('一、价格走势'),
      createPriceTable(priceData, '2月12日'),
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
writeFileSync('/home/node/clawd/reports/市场周报 2026年2月13日.docx', buffer);
console.log('Done');
