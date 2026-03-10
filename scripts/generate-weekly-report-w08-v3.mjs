#!/usr/bin/env node
/**
 * 市场周报 W08 (2026-02-15 ~ 2026-02-21) - 完善版v3
 * 新增: 投行观点、石油公司见解、宏观市场
 */

import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, BorderStyle, convertInchesToTwip } from 'docx';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKSPACE = join(__dirname, '..');

const FONT = '等线';
const FONT_SIZE = 40;

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

  // 完善版市场因素
  const marketFactors = [
    // 1) EIA周报
    `EIA周报显示（2月19日发布，截至2月13日当周），美国商业原油库存大幅下降900万桶至4.198亿桶，远超市场预期的增加210万桶，降至五年均值以下5%。馏分油库存降至八周低点。航煤方面，库存4380万桶，周增110万桶（+2.4%）；消费159万桶/日（周+6.5%），产量179万桶/日（周+2.9%）；进口15.7万桶/日（较前周增三倍），净出口4.6万桶/日。`,
    
    // 2) 美伊紧张局势
    `美伊紧张局势骤然升级：副总统万斯周三称伊朗未能满足美方核心要求，特朗普保留军事打击权利，油价单日大涨4%。特朗普随后给出10天最后通牒，称若无法达成协议将发生"坏事"。与此同时，俄罗斯与伊朗在阿曼湾举行联合海军演习，地缘风险溢价推动布伦特油价触及六个月新高。市场担忧霍尔木兹海峡供应风险，该海峡承载全球约20%的原油和LNG海运贸易。`,
    
    // 3) IEA月报
    `IEA月报（2月19日）：下调2026年全球需求增长预测至85万桶/日，预计全球供应增加240万桶/日至1.086亿桶/日，供应过剩370万桶/日，有望创下年度过剩新纪录。IEA警告称，即使OPEC+维持当前减产计划，市场仍将面临严重供应过剩。`,
    
    // 4) OPEC+
    `OPEC+动态：据路透社报道，OPEC+八国（沙特、俄罗斯、阿联酋、哈萨克斯坦、科威特、伊拉克、阿尔及利亚、阿曼）倾向于4月恢复增产，总配额约290万桶/日。3月1日会议将做最终决定。OPEC对需求前景的预测显著高于IEA：预计2026年需求增长140万桶/日。`,
    
    // 5) 投行观点
    `投行观点：高盛商品研究联席主管Daan Struyven表示，市场正在为美伊局势进一步升级定价，波动性将持续。若霍尔木兹海峡每日中断100万桶流量持续一年，布伦特油价将上涨约8美元/桶。花旗预计，若俄乌和伊朗问题在夏季达成和平协议，布伦特将回落至60-62美元/桶。摩根士丹利认为，供需格局将从2027年起改善，但当前"过剩在好转之前还会恶化"。能源板块年初至今涨幅达20%，大幅跑赢标普500。`,
    
    // 6) 沙特阿美
    `沙特阿美：3月官方售价（OSP）连续第五个月下调，阿拉伯轻质原油对亚洲价格降至与阿曼/迪拜均价平价，为五年多来最低水平。受此刺激，沙特对华原油出口大幅增加，3月装载量预计达5600-5700万桶。沙特正积极争夺亚洲市场份额，应对印度转向美国油源后留下的空缺。`,
    
    // 7) 美印协议
    `美印能源协议：特朗普取消此前因印度进口俄油而征收的25%额外关税。作为交换，印度承诺停止直接或间接进口俄罗斯石油，并在未来五年采购5000亿美元美国产品（含能源和国防）。此举将重塑亚洲原油贸易格局，印度炼厂正加速调整采购来源。`,
    
    // 8) 俄罗斯
    `俄罗斯出口：2月上半月海运原油出口平均339万桶/日。受西方制裁收紧和卢布走强影响，俄罗斯2025年钻井活动降至三年最低，产量增长前景黯淡。据报道，俄罗斯陆上储油设施接近饱和。欧盟正推进第20轮制裁方案，首次提议对第三国港口（格鲁吉亚、印尼）实施制裁，计划2月24日（俄乌战争四周年）前通过。`,
    
    // 9) 委内瑞拉
    `委内瑞拉：马杜罗政权被美军移除后，Vitol和Trafigura获得美国许可证负责委油销售。首批委内瑞拉燃料油货物已抵达ARA，但贸易商正面临销售困难——美国墨西哥湾炼厂吸收重质酸性原油已接近极限，多艘船货滞留待售。印度Reliance据悉已获得美国许可证采购委油。`,
    
    // 10) 炼厂动态
    `亚洲炼厂动态：日本Cosmo Oil堺炼厂10万桶/日CDU于2月12日恢复运行；韩国GS Caltex丽水炼厂6.2万桶/日VR加氢裂化装置将于3月中旬开始检修约两个月，预计影响区域航煤和柴油供应。荷兰TotalEnergies Flushing炼厂（18.3万桶/日）检修延长。`,
    
    // 11) 亚洲航煤
    `亚洲航煤市场：新加坡航煤裂解价差突破20美元/桶（vs迪拜），创本周新高。月差结构保持现货升水约1.10美元/桶，市场结构偏紧。ARA航煤库存周增11.6%至95.6万吨，主要受科威特货物到港推动（约18万吨+）。科威特al-Zour和Mina Abdullah炼厂检修后恢复出口。CPC台湾采购30万桶Jet A-1，定价+2美元/桶vs Mops 3月均价。`,
    
    // 12) LNG
    `亚洲LNG：JKM 3月交付现货价格约10.65-10.70美元/百万英热单位，春节前略有回落。欧洲气价走弱，全球天然气市场呈现亚洲坚挺、欧美走软的分化格局。法兴银行分析称，按当前远期定价，LNG出口利润率至2027年将趋近于零。McKinsey报告显示，LNG买方倾向签订短期合约以增强灵活性和供应来源多元化。`,
    
    // 13) 宏观
    `宏观面：美联储1月会议纪要显示官员对降息存在分歧，部分官员担忧关税推高通胀，另一些则关注劳动力市场疲软。美国1月CPI降至2.4%，好于预期，特朗普政府施压美联储降息。芝加哥联储主席Goolsbee表示，若通胀回落至2%目标，今年可能降息"数次"。当前联邦基金利率维持在3.5%-3.75%。美元兑人民币维持在6.94附近。`,
    
    // 14) 市场结构
    `市场结构展望：IEA预测的370万桶/日供应过剩构成油价上方结构性压力，地缘风险溢价是当前阻止油价跌破50美元的主要因素。分析师认为，大型石油公司如埃克森美孚和雪佛龙凭借多元化收入和高边际资产，在这种"拉锯战"市场中具备竞争优势。BP宣布任命Meg O'Neill为新任CEO（4月生效），成为全球大型石油公司首位女性CEO，将重新聚焦传统油气业务。`
  ];

  // 成品油
  const productsText = `本周亚洲炼厂利润分化。迪拜综合裂解利润4.46美元/桶，周环比下降0.60美元。

石脑油利润承压：CFR日本vs迪拜裂解-2.72美元/桶，周降1.20美元；FOB新加坡vs布伦特裂解-5.29美元/桶，周降0.73美元。

汽油利润回落：92号FOB新加坡vs迪拜裂解7.59美元/桶，周降0.93美元。

中馏分油利润走强：航煤裂解20.11美元/桶，周涨1.04美元；柴油裂解20.89美元/桶，周涨1.06美元。航煤裂解价差突破20美元/桶为近期高位。

燃料油利润改善：180cst裂解-1.64美元/桶，周涨0.34美元；380cst裂解-2.31美元/桶，周涨0.46美元；低硫船燃（0.5%）利润7.15美元/桶，周涨1.50美元。

LPG方面：丁烷CFR东北亚596.5美元/吨，周降29.5美元；丙烷CFR东北亚579.5美元/吨，周降29.5美元，受春节前备货结束影响回落。`;

  // TD3C
  const td3cText = `本周VLCC市场中东航线强势反弹。TD3从周初W135升至W147确认成交，传闻达到W170水平。船东惜售、中东地缘紧张局势及货盘数量有限等多重因素叠加，推动运价大幅上扬。

大西洋方面同样活跃：巴西东行升至W130，USG一口价突破14.45百万美元。西非成交W136.5（+15年船）。五艘USG货盘因船东报价过高而流标，显示船东底气十足。

市场焦点：部分中东/西非货盘被Suezmax分流，两艘苏伊士型船运价接近VLCC水平。巴西连续四货盘在市，配合印度长期采购协议消息，大西洋市场成为本周主要驱动力。

春节在即，但MEG历来不因此冷淡。船东占优势地位，短期看涨。`;

  // 生成市场因素段落
  const marketFactorParagraphs = [];
  marketFactors.forEach((text, index) => {
    marketFactorParagraphs.push(createParagraph(`${index + 1}）${text}`));
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
        createParagraph(''),
        
        createSectionHeader('一、价格走势'),
        createPriceTable(priceData, '2月19日'),
        createParagraph(''),
        
        createSectionHeader('二、市场因素'),
        ...marketFactorParagraphs,
        createParagraph(''),
        
        createSectionHeader('三、成品油'),
        ...productsText.split('\n\n').map(para => createParagraph(para)),
        createParagraph(''),
        
        createSectionHeader('四、TD3C（中东至中国）'),
        ...td3cText.split('\n\n').map(para => createParagraph(para))
      ]
    }]
  });
  
  const buffer = await Packer.toBuffer(doc);
  mkdirSync(join(WORKSPACE, 'reports/output'), { recursive: true });
  
  const outputPath = join(WORKSPACE, 'reports/output/市场周报_2026年2月20日_v3.docx');
  writeFileSync(outputPath, buffer);
  console.log('✅ Word 文档已生成:', outputPath);
  
  return outputPath;
}

main().catch(console.error);
