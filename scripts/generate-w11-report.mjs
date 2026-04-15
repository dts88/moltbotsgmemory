#!/usr/bin/env node
/**
 * 市场周报 W11 生成器 (2026年3月13日)
 */

import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, BorderStyle, convertInchesToTwip } from 'docx';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKSPACE = join(__dirname, '..');

const FONT = '等线';
const FONT_SIZE = 40;

function createText(text, options = {}) {
  return new TextRun({ text, font: FONT, size: options.size || FONT_SIZE, bold: options.bold || false });
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
    children: [new Paragraph({
      children: [new TextRun({ text, font: FONT, size: FONT_SIZE, bold })],
      alignment: AlignmentType.CENTER
    })],
    borders: noBorder
  });
  const headerRow = new TableRow({ children: [
    createCell('', true), createCell('3月13日', true), createCell('日涨跌', true),
    createCell('日涨跌', true), createCell('周涨跌', true), createCell('价格 吨', true), createCell('本周', true)
  ]});
  const subHeaderRow = new TableRow({ children: [
    createCell(''), createCell('美元'), createCell('美元'),
    createCell('%'), createCell('%'), createCell('人民币'), createCell('走势')
  ]});
  const rows = priceData.map(item => {
    const trend = item.weekChange > 0 ? '↗' : (item.weekChange < 0 ? '↘' : '→');
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

async function generateReport(data) {
  const { date, priceData, eiaData, marketFactors, productsText, td3cText } = data;
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
      properties: { page: { margin: {
        top: convertInchesToTwip(1), bottom: convertInchesToTwip(1),
        left: convertInchesToTwip(1.25), right: convertInchesToTwip(1.25)
      }}},
      children: [
        createTitle(`市场周报 ${date}`),
        createSectionHeader('一、价格走势'),
        createPriceTable(priceData),
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
  return doc;
}

async function main() {
  const usdCny = 6.9007;

  const priceData = [
    {
      name: '迪拜首行',
      price: 145.51,
      dailyChange: 145.51 - 134.40,
      dailyChangePct: (145.51 - 134.40) / 134.40 * 100,
      weekChange: 145.51 - 100.45,
      weekChangePct: (145.51 - 100.45) / 100.45 * 100,
      cnyPerTon: 145.51 * 7.33 * usdCny
    },
    {
      name: '布伦特首行',
      price: 101.74,
      dailyChange: 101.74 - 97.76,
      dailyChangePct: (101.74 - 97.76) / 97.76 * 100,
      weekChange: 101.74 - 85.83,
      weekChangePct: (101.74 - 85.83) / 85.83 * 100,
      cnyPerTon: 101.74 * 7.33 * usdCny
    },
    {
      name: 'WTI首行',
      price: 97.09,
      dailyChange: 97.09 - 92.09,
      dailyChangePct: (97.09 - 92.09) / 92.09 * 100,
      weekChange: 97.09 - 81.64,
      weekChangePct: (97.09 - 81.64) / 81.64 * 100,
      cnyPerTon: 97.09 * 7.33 * usdCny
    },
    {
      name: '新加坡92号汽油',
      price: 136.44,
      dailyChange: 136.44 - 130.12,
      dailyChangePct: (136.44 - 130.12) / 130.12 * 100,
      weekChange: 136.44 - 113.16,
      weekChangePct: (136.44 - 113.16) / 113.16 * 100,
      cnyPerTon: 136.44 * 8.33 * usdCny
    },
    {
      name: '新加坡10ppm柴油',
      price: 192.48,
      dailyChange: 192.48 - 194.50,
      dailyChangePct: (192.48 - 194.50) / 194.50 * 100,
      weekChange: 192.48 - 155.76,
      weekChangePct: (192.48 - 155.76) / 155.76 * 100,
      cnyPerTon: 192.48 * 7.46 * usdCny
    },
    {
      name: '新加坡航煤',
      price: 199.50,
      dailyChange: 199.50 - 209.52,
      dailyChangePct: (199.50 - 209.52) / 209.52 * 100,
      weekChange: 199.50 - 160.57,
      weekChangePct: (199.50 - 160.57) / 160.57 * 100,
      cnyPerTon: 199.50 * 7.88 * usdCny
    },
    {
      name: '新加坡380燃料油',
      price: 737.39,
      dailyChange: 737.39 - 778.49,
      dailyChangePct: (737.39 - 778.49) / 778.49 * 100,
      weekChange: 737.39 - 647.53,
      weekChangePct: (737.39 - 647.53) / 647.53 * 100,
      cnyPerTon: 737.39 * usdCny
    }
  ];

  const reportData = {
    date: '2026年3月13日',
    priceData,

    eiaData: [
      'EIA周报显示，美国截至03月06日，除却战略储备的商业原油库存+382.4万桶至4.431亿桶，变化+0.87%；美国战略石油储备（SPR）库存几乎持平，至4.154亿桶；美国汽油库存减少365.4万桶至2.495亿桶，变化-1.44%；美国馏分油库存减少134.9万桶至1.194亿桶，变化-1.12%。炼厂开工率上升至90.8%（前周89.2%），原油日加工量16.2百万桶/日，同比增约3%。过去一个月总成品油供应均值2100万桶/日，同比增1.9%。'
    ],

    marketFactors: [
      '美伊冲突与霍尔木兹封锁：2月28日，美以联合对伊朗实施军事打击，伊朗最高领袖哈梅内伊据报身亡，IRGC随即宣布封锁霍尔木兹海峡并声称"一滴油都过不去"。本周通行量从冲突初期下降约70%后几乎归零，逾150艘船只在海峡外抛锚；3月7日无人机击伤油轮Prima及Louise P，3月10日阿布扎比附近再有散货轮遭袭，3月11日又有三艘船被攻击。至少11艘商船受损、6艘遭弃置、10名船员死亡或失踪。Lloyd\'s List Intelligence显示3月初80%被追踪船只已关闭AIS"暗行"。这是1970年代石油危机以来全球能源供应最严重的单次中断事件。',

      '油价走势与结构分化：布伦特原油从冲突前低于73美元/桶，3月8日突破100美元（四年来首次），3月9日盘中触及119.50美元，峰值约126美元，随后有所回落，本周收于约97-102美元区间。年初至今累计涨幅超50%（冲突前已从60美元涨至73美元）。布伦特-迪拜EFS价差从年初0.69美元/桶扩至10.42美元/桶，反映大西洋盆地与中东市场结构性分化。Murban期货103美元/桶、Oman期货107美元/桶、SC原油期货（人民币折美元）109美元/桶，显示亚洲市场对近月实物原油的极端争夺。',

      'IEA三月月报：史上最大供应中断：IEA三月月报将此次危机定性为"历史上最大的石油供应中断"。报告显示，霍尔木兹当前原油及成品油出口量不足冲突前水平的10%，全球供应预计在3月骤降约800万桶/日（约占全球需求8%）。IEA明确指出，决定整个油市走势的核心变量只有一个：霍尔木兹恢复通行的时间。',

      'OPEC+备用产能局限：OPEC+此前同意4月起小幅增产，但Wood Mackenzie本周明确指出，OPEC+的备用产能主要集中在沙特、伊拉克、阿联酋等海湾产油国，在霍尔木兹封锁下实际已无法调用，增产对缓解当前供应短缺的实质意义极为有限；战争已将海湾产油国日产量削减约1500万桶，若局势持续，油价理论上可触及150美元/桶。',

      'IEA 4亿桶释储：3月11日IEA 32个成员国一致决议释放4亿桶战略储备，为有史以来最大规模的紧急释储行动（超过2022年俄乌战争时3000万桶和新冠期间6000万桶的两倍以上）。IEA执行主任比罗尔称这是"重大行动"，但强调恢复霍尔木兹通行才是根本解决之道。值得注意的是，4亿桶释储仅相当于全球约4天的消费量，市场初步反应平淡，油价在公告后继续攀升。',

      '海湾产油国减产与ADNOC安排：沙特、伊拉克、阿联酋、科威特、卡塔尔、巴林等海湾国家因出口通道受阻、储罐趋于饱和及伊朗持续打击基础设施，已大幅被迫减产。ADNOC要求合作伙伴改至杰贝勒达纳港（Jebel Dhanna，海峡内侧）自提Murban原油，折射出海上通道严峻受阻。沙特虽已准备好应急增产，但实际出口同样受限。',

      '迪拜现货窗口：极端溢价下仍保持运转：本周迪拜现货窗口在极端行情下依然持续成交，现货Oman/Murban升水大幅飙升。普氏表示，即使在此历史性危机中，迪拜窗口每日仍可实物交割逾200万桶，彰显窗口定价体系韧性，同时表示正主动听取市场反馈，考量是否需要调整评估方法。亚洲买家为争夺近月实物货源溢价显著抬高，中东原油稀缺性在现货市场充分反映。',

      '航运保险危机持续发酵：在上周七大P&I俱乐部集体撤销波斯湾战险保单后，本周危机进一步升级。Jefferies分析师本周确认，海湾几乎所有船只保单均已被取消，随后以"大幅提高的价格"重新续保；Lloyd\'s of London本周表态仍为过境霍尔木兹船只提供承保，但保费已大幅上调，估计每航次战险保费可达船值的0.5%-1%（一艘VLCC战险费用可高达数十万至逾百万美元/航次）。特朗普本周提议由联邦政府为波斯湾商船提供海事保险，批评者认为此举将使纳税人承担巨额风险。约250亿美元的船舶及货物仍滞留或锚泊在海峡内外。',

      '中国：储油缓冲+斡旋外交+限制出口：中国战前已建立约12亿桶战略储备（相当于约115天海运进口量），为此次冲击提供显著缓冲。本周中国与伊朗的外交斡旋仍在持续推进，争取原油及卡塔尔LNG船只安全通行权；伊朗至今仍在向中国运油（占中国进口约20%），是本周霍尔木兹少数仍在过境的货流之一。与此同时，中国本周已限制成品油出口以保障国内供给，亚洲炼厂普遍削减加工率。Allianz Trade研究员指出，伊朗供应缺口理论上可通过增加俄罗斯进口替代。',

      'LNG市场冲击：全球约20%的LNG过境霍尔木兹，主要来自卡塔尔。受伊朗无人机袭击卡塔尔拉斯拉凡（Ras Laffan）LNG设施影响，卡塔尔暂停部分产出，亚洲LNG现货JKM从约10美元/MMBtu飙升至约15美元/MMBtu（周内+40%以上），TTF单周上涨约55%。日本NYK、MOL暂停所有船只过境霍尔木兹。日韩正紧急向美国、澳大利亚、加拿大采购现货LNG替代卡塔尔缺口。花旗警告，若欧洲10月储气处于低位，LNG市场将面临"非线性"价格飙升风险。',

      '亚洲炼厂冲击与成品油短缺：印度MRPL（芒格洛尔炼厂）对汽油出口宣布不可抗力，为亚洲数家因无法履约的炼厂之一；印度约85%原油进口及约一半LNG进口过境霍尔木兹。东南亚老挝、柬埔寨、缅甸等缺乏本地炼油产能的国家面临严峻成品油短缺；浙江石化提前启动检修关停约20万桶/日装置；中国已限制成品油出口；原油期货价格与亚洲实物市场出现明显背离。',

      '新加坡库存与富查伊拉补油危机：新加坡中间馏分油库存降至约765万桶，逼近数年低位；燃料油库存虽升至逾2300万桶，但来自中东的补货路径已大幅受阻。全球最大船用燃料补给港富查伊拉因霍尔木兹危机供应极端紧缺，加油等待时间据报超两周，这也是VLSFO FOB富查伊拉裂解价差本周跳升逾34美元/桶的直接原因，并传导至油轮运费（TCE实际收益下降）。',

      '日韩欧洲紧急应对：日本首相宣布将于3月18日起释放战略原油储备（日本炼厂同时申请政府紧急释储授权）；韩国宣布释放约2246万桶战略储备，并实施近30年来首次燃油价格上限，同步设立约68.3亿美元（100万亿韩元）能源稳定基金；印度、德国亦启动战略储备释放。德国、法国、意大利等欧洲主要消费国也加入IEA释储行动，G7整体承诺采取"必要措施"。',

      '俄乌新动态与美对俄政策转向：乌克兰无人机袭击新罗西斯克黑海港口终端，俄海运出口一度停运，当周降至264万桶/日（2025年2月以来最低）。俄乌拉尔原油受全球价格急涨带动，12天内从约40美元/桶飙至约100美元/桶，制裁价格上限形同虚设。特朗普宣布将"对部分国家暂时解除制裁直至局势平稳"，民主党强烈批评称此举给普京"巨大财务助力"并为俄影子船队扫除障碍；影子船队已成为霍尔木兹唯一仍持续通行的船队（约占3月初过境量80%）。',

      '美国页岩油：理论增产空间与现实局限：油价飙升理论上可刺激美国页岩油增产（分析师测算盈亏平衡线约55-65美元/桶），EIA数据显示美国产量当前维持约1300万桶/日高位。然而路透社指出，美国油气巨头股价涨幅明显落后于油价涨幅，原因在于页岩油从加大钻探到实现供应需要6-9个月，且页岩资本支出纪律约束使公司不愿大幅增加钻机数量；白宫同时考虑豁免Jones Act以允许外国船只参与国内成品油配送，以应对汽油价格急涨带来的政治压力。',

      '跨大西洋原油套利重构：布伦特-迪拜EFS从年初0.69美元/桶扩至10.42美元/桶，大西洋盆地原油对亚洲买家的价格吸引力创多年来最高。美国WTI Midland、巴西图皮、西非等大西洋原油正在尝试填补亚洲买家的中东货缺口，美国原油出口量预期上升。然而大西洋VLCC运费持续下行，加之战险保险费率抬升，套利窗口的实际可执行程度仍受约束。',

      '投行综合研究：高盛3月12日上调Q4布伦特/WTI至71/67美元/桶（原66/62），预计3-4月均价约98美元/桶，若封锁持续一个月或突破历史高点145美元/桶；摩根士丹利维持谨慎，认为封锁持续超过30天将进入"未知领域"；花旗警告市场当前定价仍低估持续封锁带来的上行风险；德意志银行称"若油价维持这一水平，持续冲击的预期将只增不减"；Jefferies分析了保险费率重定价对航运成本的影响。',

      '机构研究：Wood Mackenzie、Kpler与IEA：Wood Mackenzie测算战争已将海湾石油供应日均削减约1500万桶，若持续将推动油价至150美元/桶；Kpler数据显示霍尔木兹过境船只几乎归零，同时下调2026年亚洲LNG需求70万吨；IEA月报将3月全球供应缺口量化为800万桶/日，并明确将霍尔木兹恢复通行定为唯一关键变量，释储仅为"购买时间"。牛津经济研究院指出若冲突持续一个月将带来"全球衰退的实质性风险"；前美联储主席耶伦警告此次油价冲击可能抵消近期全部通胀降幅。',

      '滞胀风险与宏观影响：油价冲击被广泛类比为1970年代两次石油危机，具有典型滞胀特征——既抬高通胀、又拖累经济增长。美国汽油价格持续攀升，白宫面临政治压力；市场担忧美联储将陷入"降息以救经济 vs 不降息以遏通胀"的两难。布伦特自年初涨幅已超50%，WTI自冲突前低点涨幅约39%；若冲突在中期选举前无法结束，特朗普政府将面临更大国内政治挑战。'
    ],

    productsText: '本周亚洲炼厂利润受战争冲击高度分化。石脑油加工利润下跌4.48美元至-3.02美元/桶（CFR日本 vs 迪拜），随原油价格急升而再度转负。汽油利润小幅下跌1.60美元至20.14美元/桶，绝对值仍处于历史高位。航煤裂解利润下跌2.34美元至77.04美元/桶，尽管较近期峰值略有回落，仍维持历史极端水平，反映霍尔木兹封锁导致中东和亚洲航线严重断供——新加坡航煤价格本周一度飙升约140%。柴油裂解利润逆势上涨5.65美元至48.54美元/桶，战争驱动的需求溢价与供应短缺叠加持续支撑。燃料油方面，高硫180 CST裂解利润下跌3.24美元至6.32美元/桶，380 CST裂解利润下跌2.42美元至5.85美元/桶；但低硫船燃（VLSFO）FOB富查伊拉裂解利润大幅跳升33.92美元至51.52美元/桶，因霍尔木兹通行受阻导致富查伊拉港口船燃供应严重紧缺，等待加油时间据报超过两周。LPG方面，丁烷和丙烷CFR东北亚价格分别上涨113.5和111.5美元/吨，至900.5和876.5美元/吨，波斯湾供应中断与印度LPG危机双重推动，欧洲丙烷纸货亦因霍尔木兹新一轮安全事件反弹。整体来看，迪拜综合裂解利润下跌11.82美元至9.25美元/桶，主要由于原油价格涨幅超过大多数成品油的绝对涨幅。',

    td3cText: `TD3C VLCC运费本周大幅波动，收于W348.89，约1,985万美元/船，折合9.92美元/桶。

中东及红海市场方面，延布（Yanbu）出发的货物在经历多次W450成交后奠定基准，并一度冲至W500的阶段高点。随后市场迅速回落，部分已固定船只据报取消并以战时费率重新谈判。阿曼至中国的成交传出低至W225，较同日同类货物低约W75点，引发市场争议；延布至东方方向亦下滑约W80点。整体而言，公开成交稀少，船东多倾向私下谈判，观望情绪浓厚。

大西洋市场方面，本周持续承压走软。巴西至东方航线自周一以来下跌约W60点，西非（WAF）跌至W229，美湾（USG）方面仅有上周遗留成交，西非暂定成交本周下午亦宣告落空。燃油成本上涨及补给等待时间长达两周等因素，一定程度上缓解了大西洋市场的进一步下行压力。

综合来看，尽管波罗的海TD3C评估指数仍在上行，但燃油成本攀升已导致实际日租金收益（TCE）下滑。在地缘冲突持续升级的背景下，油轮费率不升反降，市场情绪趋于保守。`
  };

  const doc = await generateReport(reportData);
  const buffer = await Packer.toBuffer(doc);
  const outputPath = join(WORKSPACE, 'reports/市场周报 2026年3月13日.docx');
  writeFileSync(outputPath, buffer);
  console.log('✅ Word 文档已生成:', outputPath);
}

main().catch(console.error);
