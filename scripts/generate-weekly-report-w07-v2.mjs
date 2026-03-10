import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  LineRuleType,
} from "docx";
import * as fs from "fs";

const FONT = "等线";
const FONT_SIZE = 40; // 20pt

function title(text) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 160, line: 480, lineRule: LineRuleType.AUTO },
    children: [
      new TextRun({
        text,
        bold: true,
        size: 44,
        font: FONT,
      }),
    ],
  });
}

function section(text) {
  return new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: { after: 160, line: 480, lineRule: LineRuleType.AUTO },
    children: [
      new TextRun({
        text,
        bold: true,
        size: FONT_SIZE,
        font: FONT,
      }),
    ],
  });
}

function para(text) {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { after: 160, line: 480, lineRule: LineRuleType.AUTO },
    children: [
      new TextRun({
        text,
        size: FONT_SIZE,
        font: FONT,
      }),
    ],
  });
}

const doc = new Document({
  sections: [
    {
      children: [
        title("市场周报 2026年2月13日"),

        // 一、价格走势
        section("一、价格走势"),

        // 二、市场因素
        section("二、市场因素："),

        para("EIA周报显示，美国截至02月06日，除却战略储备的商业原油库存+850万桶至4.288亿桶，变化+2.0%；美国战略石油储备（SPR）库存持平，至4.152亿桶；美国汽油库存增加120万桶，至2.591亿桶；美国馏分油库存减少270万桶，至1.247亿桶；上周美国原油产量+50万桶/日，至1371万桶/日；炼厂输入1600万桶/日，较前一周-3万桶/日。"),

        para("国际能源署（IEA）2月12日发布月报，下调2026年全球原油需求增长预测至85万桶/日，降幅达9%。报告指出1月全球产量骤降120万桶/日，主要受北美极寒天气及哈萨克CPC管道中断影响。IEA预计一季度全球供应过剩380万桶/日，二季度进一步扩大至440万桶/日。美洲五国（美国、加拿大、巴西、圭亚那、阿根廷）今年料增产180万桶/日。"),

        para("Vitol首席执行官本周表示，地缘政治紧张和对俄伊原油买家的制裁压力正在收紧市场。俄罗斯原油海上浮仓60天内增加4000万桶。印度减少俄油进口后，俄油供应被迫更多流向中国。ESPO对华可成交价已扩大至ICE Brent期货-8.5至-9美元/桶（DES山东），较此前的-7.5至-8美元/桶进一步走弱。"),

        para("美印关系方面，特朗普取消因印度进口俄油而征收的25%额外关税。印度承诺停止直接或间接进口俄罗斯石油，并在未来5年采购5000亿美元美国产品（含能源和国防）。"),

        para("委内瑞拉原油方面，OFAC明确允许中国买家通过'已确立地位的美国实体'转售购买委内瑞拉原油。双层体系下，直接采购限美国实体，但可自由转售全球（古巴、俄罗斯、伊朗、朝鲜除外）。美能源部长赖特证实中国已购买部分由美国采购的委内瑞拉原油。委内瑞拉2月已恢复向西班牙出口约200万桶原油，Repsol重启采购。"),

        para("中东局势方面，美国海军杰拉尔德·R·福特号航母已下令立即部署至中东。乌克兰恢复对俄罗斯关键炼厂的无人机袭击。泽连斯基表示支持美国提出的和平提议以促成协议达成。沙特更换投资部长，由法立赫换为来自主权基金PIF的Fahad Al-Saif，正在取消部分投资项目并加大力度吸引外资。"),

        para("LNG市场方面，韩国1月LNG进口596万吨，同比增长45%创历史新高。日本库存2月8日降至189万吨，为18周低点。道达尔CEO表示卡塔尔NFE预计2026年三季度投产。Cheniere Corpus Christi第5条生产线即将投产。韩国KOGAS采购4-6月10余船，贴水JKM 10-20美分。"),

        para("中国政策方面，化工、石化行业预计2027年纳入全国碳排放权交易市场，届时将基本覆盖工业领域主要排放行业。"),

        // 三、成品油
        section("三、成品油："),

        para("本周亚洲成品油市场表现分化。柴油市场backwardation结构走宽，新加坡3/4月价差升至1.07美元/桶；2月掉期报89.14美元/桶，3月报87.96美元/桶，月差1.18美元。航煤2月掉期报88.17美元/桶，3月报87.20美元/桶，月差0.97美元。"),

        para("石脑油方面，西向东到港量过去4个月均值245万吨/月，2月预计降至175万吨，供应趋紧。CFR日本现货升水坚挺报30美元/吨，裂解价差88.60美元/吨。台塑石脑油招标7.5万吨（3月下半月交付麦寮），升水7.5-8美元/吨。韩国乐天化学招标寻购多批次石脑油。"),

        para("乙烯市场疲软，CFR东北亚报695美元/吨，乙烯-石脑油价差仅92美元/吨，远低于盈亏线。台湾中油、台塑考虑停产，韩国部分生产商计划3月降负。"),

        para("燃料油方面，新加坡380CST FOB报436.67美元/吨，周内上涨5.53美元/吨，交付升水走高至5.33美元/吨，供应偏紧。富查伊拉380CST报420美元/吨。鹿特丹HSFO驳船成交365-366美元/吨。欧洲市场受荷兰执行RED III法规影响，传统燃料成本上升。"),

        // 四、TD3C
        section("四、TD3C（中东至中国）指数"),

        para("中东湾2月船期基本清仓，船东惜售等待3月货盘。大西洋市场表现强势，巴西主导市场情绪，美湾亦有回暖迹象。巴西/东向报价突破WS125，美湾/东向确认1400万美元。"),

        para("周初MEG市场平静，第三旬仍有25-30船货待覆盖。周中运价小幅走软，活动清淡。IE能源周期间私下成交活跃，市场情绪转涨。Sinokor持续观望，现代吨位紧缺。"),
      ],
    },
  ],
});

const buffer = await Packer.toBuffer(doc);
const outputPath = "/home/node/clawd/reports/市场周报 2026年2月13日.docx";
fs.writeFileSync(outputPath, buffer);
console.log(`Report saved to: ${outputPath}`);
