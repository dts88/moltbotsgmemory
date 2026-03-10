#!/usr/bin/env node
/**
 * 市场周报 Word 文档生成器
 * 格式参照原模板
 */

import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, BorderStyle, convertInchesToTwip } from 'docx';
import { writeFileSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKSPACE = join(__dirname, '..');

// 字体设置 - 全部使用等线
const FONT = '等线';
const FONT_SIZE = 40; // 20pt = 40 half-points

// 创建文本运行
function createText(text, options = {}) {
  return new TextRun({
    text,
    font: FONT,
    size: options.size || FONT_SIZE,
    bold: options.bold || false,
    ...options
  });
}

// 创建段落 - Spacing After 8pt, Line Spacing Double, Justify
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
    alignment: AlignmentType.JUSTIFIED
  });
}

// 创建标题
function createTitle(text) {
  return new Paragraph({
    children: [
      new TextRun({
        text,
        font: FONT,
        size: FONT_SIZE,
        bold: true
      })
    ],
    spacing: { before: 0, after: 160, line: 480 },
    alignment: AlignmentType.CENTER
  });
}

// 创建章节标题
function createSectionHeader(text) {
  return new Paragraph({
    children: [
      new TextRun({
        text,
        font: FONT,
        size: FONT_SIZE,
        bold: true
      })
    ],
    spacing: { before: 240, after: 160, line: 480 },
    alignment: AlignmentType.JUSTIFIED
  });
}

// 创建价格表格
function createPriceTable(priceData) {
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
  
  // 表头
  const headerRow = new TableRow({
    children: [
      createCell('', true),
      createCell('2月20日', true),
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
  
  // 数据行
  const rows = priceData.map(item => {
    const trend = item.weekChange > 0 ? '↗' : (item.weekChange < 0 ? '↘' : '→');
    return new TableRow({
      children: [
        createCell(item.name),
        createCell(item.price.toFixed(2)),
        createCell((item.dailyChange >= 0 ? '+' : '') + item.dailyChange.toFixed(2)),
        createCell((item.dailyChangePct >= 0 ? '+' : '') + item.dailyChangePct.toFixed(2) + '%'),
        createCell((item.weekChangePct >= 0 ? '+' : '') + item.weekChangePct.toFixed(2) + '%'),
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

// 生成报告
async function generateReport(data) {
  const { date, priceData, eiaData, marketFactors, productsText, td3cText } = data;
  
  // 构建市场因素段落
  const marketFactorParagraphs = [];
  
  // 1）EIA数据 - 分段显示
  marketFactorParagraphs.push(createParagraph(`1）${eiaData[0]}`, { size: FONT_SIZE }));
  for (let i = 1; i < eiaData.length; i++) {
    marketFactorParagraphs.push(createParagraph(eiaData[i], { size: FONT_SIZE }));
  }
  
  // 2）及以后的条目
  marketFactors.forEach((text, index) => {
    marketFactorParagraphs.push(createParagraph(`${index + 2}）${text}`, { size: FONT_SIZE }));
  });
  
  const doc = new Document({
    styles: {
      default: {
        document: {
          run: {
            font: FONT,
            size: FONT_SIZE
          }
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
        // 标题
        createTitle(`市场周报 ${date}`),
        
        // 一、价格走势
        createSectionHeader('一、价格走势'),
        createPriceTable(priceData),
        createParagraph(''),
        
        // 二、市场因素
        createSectionHeader('二、市场因素'),
        ...marketFactorParagraphs,
        createParagraph(''),
        
        // 三、成品油
        createSectionHeader('三、成品油'),
        createParagraph(productsText, { size: FONT_SIZE }),
        createParagraph(''),
        
        // 四、TD3C
        createSectionHeader('四、TD3C（中东至中国）'),
        ...td3cText.split('\n\n').map(para => createParagraph(para, { size: FONT_SIZE }))
      ]
    }]
  });
  
  return doc;
}

// 主函数
async function main() {
  // 汇率
  const usdCny = 6.96;
  
  // 价格数据 (2月19日周三收盘)
  const priceData = [
    { 
      name: '迪拜首行', 
      price: 70.15, 
      dailyChange: 70.15 - 69.50, 
      dailyChangePct: (70.15 - 69.50) / 69.50 * 100,
      weekChange: 70.15 - 66.87,
      weekChangePct: (70.15 - 66.87) / 66.87 * 100,
      cnyPerTon: 70.15 * 7.33 * usdCny
    },
    { 
      name: '布伦特首行', 
      price: 71.66, 
      dailyChange: 71.66 - 70.50, 
      dailyChangePct: (71.66 - 70.50) / 70.50 * 100,
      weekChange: 71.66 - 67.49,
      weekChangePct: (71.66 - 67.49) / 67.49 * 100,
      cnyPerTon: 71.66 * 7.33 * usdCny
    },
    { 
      name: 'WTI首行', 
      price: 66.40, 
      dailyChange: 66.40 - 65.50, 
      dailyChangePct: (66.40 - 65.50) / 65.50 * 100,
      weekChange: 66.40 - 62.78,
      weekChangePct: (66.40 - 62.78) / 62.78 * 100,
      cnyPerTon: 66.40 * 7.33 * usdCny
    },
    { 
      name: '新加坡92号汽油', 
      price: 76.08, 
      dailyChange: 76.08 - 75.50, 
      dailyChangePct: (76.08 - 75.50) / 75.50 * 100,
      weekChange: 76.08 - 71.58,
      weekChangePct: (76.08 - 71.58) / 71.58 * 100,
      cnyPerTon: 76.08 * 8.33 * usdCny  // 汽油约8.33桶/吨
    },
    { 
      name: '新加坡10ppm柴油', 
      price: 91.87, 
      dailyChange: 91.87 - 91.00, 
      dailyChangePct: (91.87 - 91.00) / 91.00 * 100,
      weekChange: 91.87 - 87.47,
      weekChangePct: (91.87 - 87.47) / 87.47 * 100,
      cnyPerTon: 91.87 * 7.46 * usdCny  // 柴油约7.46桶/吨
    },
    { 
      name: '新加坡航煤', 
      price: 90.80, 
      dailyChange: 90.80 - 90.00, 
      dailyChangePct: (90.80 - 90.00) / 90.00 * 100,
      weekChange: 90.80 - 86.40,
      weekChangePct: (90.80 - 86.40) / 86.40 * 100,
      cnyPerTon: 90.80 * 7.88 * usdCny  // 航煤约7.88桶/吨
    },
    { 
      name: '新加坡380燃料油', 
      price: 441.99, 
      dailyChange: 441.99 - 440.00, 
      dailyChangePct: (441.99 - 440.00) / 440.00 * 100,
      weekChange: 441.99 - 430.87,
      weekChangePct: (441.99 - 430.87) / 430.87 * 100,
      cnyPerTon: 441.99 * usdCny  // 已经是美元/吨
    }
  ];
  
  const reportData = {
    date: '2026年2月20日',
    
    priceData,
    
    // EIA数据分段 (截至2月13日)
    eiaData: [
      'EIA周报显示，美国截至02月13日，除却战略储备的商业原油库存 -900万桶至4.198亿桶，低于五年均值5%；',
      '美国馏分油库存 -460万桶，至1.201亿桶，降幅超预期；',
      '航煤库存 +110万桶，至4380万桶；',
      '航煤消费 159万桶/日（周环比+6.5%）；',
      '航煤产量 179万桶/日（周环比+2.9%）；',
      '航煤进口 15.7万桶/日（比前周增三倍）；',
      '航煤出口 20.3万桶/日（周环比-1.65万桶/日）；',
      '炼厂开工率上升，原油出口增加。'
    ],
    
    marketFactors: [
      // 1. OPEC+/供应侧
      'OPEC+于2月1日会议决定维持3月产量政策不变，继续暂停增产计划。去年11月，OPEC+已冻结1-3月增产计划。尽管市场预期2026年全球供应过剩约220万桶/日，但地缘风险溢价支撑油价维持在70美元/桶附近。OPEC维持乐观需求预测，预计2026年全球石油需求增长140万桶/日，总需求达到约1.065亿桶/日。',
      
      'OPEC+供应展望：部分OPEC+成员国认为全球供应过剩担忧被夸大，倾向于4月起逐步恢复增产（Reuters/Bloomberg 2/13）。尼日利亚1月原油产量同比下滑5%至145.9万桶/天，未达预算和OPEC配额目标。OPEC月报预计Q2对OPEC+原油需求环比下降40万桶/天，但维持全年需求增长134万桶/天预测不变。IEA下调2026年全球石油需求增长预测，预计全球供应增长240万桶/天至1.086亿桶/天。',
      
      // 2. 地缘政治/制裁
      '美伊紧张局势：特朗普政府向伊朗附近部署更多军事资产，美方仍倾向外交解决但施压核谈判，伊朗坚持外交讨论仅限核计划。市场担忧冲突升级，支撑油价上涨，布伦特突破71美元/桶创近六个月新高。',
      
      '对俄制裁动态：美国民主党参议员访问基辅期间力推"影子船队"制裁法案，旨在打击运输俄油的老旧油轮。欧盟赶在俄乌冲突四周年（2月24日）前推进第20轮对俄制裁，首次拟将格鲁吉亚和印尼港口纳入制裁范围。新西兰将俄油价格上限从60美元下调至44.10美元/桶。',
      
      '俄罗斯1月海运原油出口降至340万桶/日，环比下降11.3%。对印度出口暴跌55%至50.5万桶/日，对中国出口下降37%至87.4万桶/日。新加坡作为目的地的货量激增154%，部分货物可能在当地进行船对船转运。',
      
      '委内瑞拉：马杜罗被美军移除后首批委内瑞拉燃料油货物抵达ARA。委内瑞拉炼厂开工率升至产能的35%。',
      
      '美军海上行动：美军在印度洋登船检查第二艘油轮（Veronica III，2006年建造VLCC），此前从加勒比海一路追踪。',
      
      // 3. 需求/中国/亚洲
      '亚洲原油进口与中国需求：亚洲2月原油进口量料创历史新高，中国加大从俄罗斯和沙特的采购力度，受俄油深度折扣及沙特长约价格下调刺激。EIA预计2026年中国战略储备建设速度维持约100万桶/天。分析机构指出，受电动车普及和AI驱动的LNG基础设施转型影响，中国石油需求或于2027年见顶。',
      
      '中国地炼1月委内瑞拉原油进口创半年新高，达249万吨。目前仍有约2000万桶委油在途，预计可维持沥青生产2-3个月。近期委油贴水已从ICE布伦特减12-13美元/桶收窄至减6-7美元/桶。',
      
      // 4. 投行/机构观点
      '投行观点方面，高盛预计布伦特2026年底降至56美元/桶（区间60-70美元），为五大投行中最悲观；花旗预计均价62美元/桶，为最乐观；摩根大通认为OPEC+可能在年中改变策略大幅削减产量。McKinsey长期油价模型维持50-60美元/桶预测区间。',
      
      // 5. 炼厂动态
      '波兰格但斯克炼厂计划于2月底开始周期性检修，关键装置将于4月停产，为5年周期性大检修。',
      
      'Valero宣布将于2月底关闭加州贝尼西亚炼厂（约14.5万桶/日），约420名全职员工将受影响。',
      
      '炼厂动态：哈萨克斯坦规划新建炼厂，目标2033年前炼油产能从1840万吨/年升至4000万吨/年，消除国内燃料短缺并成为净出口国。',
      
      // 6. 运输/油轮
      '油轮市场：韩国Sinokor大举收购VLCC，2026年至今完成35艘交易（占全部45笔的78%），控制合规VLCC船队25%。VLCC租金飙升：一年期租约达90,000美元/天，三年期超60,000美元/天。船东整合推高运费和二手船价，市场出现"根本性转变"。',
      
      // 7. LNG
      '德国陆上LNG终端Stade将推迟至2029年投运，原计划2027年。总容量13.3 bcm/年，长期容量已被EnBW、SEFE和捷克CEZ预订。',
      
      '孟加拉与阿美贸易新加坡达成短期LNG供应协议，2026年采购5船LNG，定价JKM+14.5美分/MMBtu。'
    ],
    
    productsText: '本周亚洲炼厂利润整体承压。石脑油加工利润下跌0.67美元至-1.48美元/桶（CFR日本 vs 迪拜），汽油利润回升0.71美元至8.54美元/桶，航煤与柴油利润分别回落1.63与1.66美元至18.97与20.02美元/桶，中间馏分油利润显著承压；燃料油利润走弱，180 CST与380 CST裂解利润分别下滑0.80与1.51美元至-2.81与-3.83美元/桶，低硫船燃（0.5%）利润小幅上涨0.31美元至5.82美元/桶。LPG方面，丁烷与丙烷CFR东北亚价格双双上涨6.5美元/吨至613.5与595.5美元/吨，受冬季需求支撑。整体来看，受中馏分油利润走弱拖累，迪拜综合裂解利润下降1.72美元至4.96美元/桶。',
    
    td3cText: `WS163.28（+9.11），TCE约151,208美元/天，沙特至中国VLCC运费大幅攀升。

本周VLCC市场中东航线强势反弹，TD3C波罗的海评估创近六年新高。船东惜售、中东地缘紧张局势及货盘数量有限等多重因素叠加，推动运价大幅上扬。韩国Sinokor大举收购VLCC（控制合规船队25%），船东整合加剧市场紧张。

市场方面，波斯湾至远东运费升至36.49美元/吨（+8.3%），美湾至远东54.44美元/吨，西非至远东47.86美元/吨。美伊紧张局势持续，特朗普给予伊朗最多15天达成核协议，霍尔木兹海峡局势受关注——伊朗军队近三天在此进行海上演习，每日约1900万桶原油、凝析油和成品油通过该水道。

大西洋方面，西非及巴西均有货盘活动，船东看涨情绪受中东运价提振而高涨。船位紧张叠加报价集中，市场溢价有望维持。

展望下周，随着第三旬货盘陆续释放，叠加地缘风险溢价，预计中东市场将延续偏强格局。`
  };
  
  const doc = await generateReport(reportData);
  const buffer = await Packer.toBuffer(doc);
  
  const outputPath = join(WORKSPACE, 'reports/output/市场周报_2026年2月20日.docx');
  writeFileSync(outputPath, buffer);
  console.log('Word 文档已生成:', outputPath);
  
  return outputPath;
}

main().catch(console.error);
