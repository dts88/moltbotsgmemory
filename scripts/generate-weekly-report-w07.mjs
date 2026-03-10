import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  convertInchesToTwip,
  LineRuleType,
} from "docx";
import * as fs from "fs";

const FONT = "等线";
const FONT_SIZE = 40; // half-points, so 40 = 20pt

function heading(text) {
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

function emptyPara() {
  return new Paragraph({
    spacing: { after: 160 },
    children: [],
  });
}

const doc = new Document({
  sections: [
    {
      properties: {},
      children: [
        heading("能源市场周报"),
        heading("2026年2月8日 - 2月14日"),
        emptyPara(),

        // 一、原油市场
        section("一、原油市场"),
        emptyPara(),
        para("本周国际原油价格震荡走弱。ICE Brent期货周中报69.27美元/桶，NYMEX WTI报64.58美元/桶。IEA月报下调2026年全球原油需求增长预测至85万桶/日，降幅达9%，并预计一季度全球供应过剩380万桶/日，二季度进一步扩大至440万桶/日。"),
        para("供应端，美国极寒天气及哈萨克CPC管道中断导致1月全球产量骤降120万桶/日。Vitol首席执行官指出，俄罗斯原油海上浮仓60天内增加4000万桶，印度减少俄油进口转向其他来源。委内瑞拉方面，美国能源部长赖特访问奥里诺科油田，Repsol重启采购，2月已向西班牙出口约200万桶。OFAC明确允许中国买家通过美国实体转售购买委内瑞拉原油。"),
        para("地缘局势方面："),
        para("1）美国准备部署第二艘航母USS George H.W. Bush至中东，伊朗媒体解读为'迈向战争的明确步骤'；"),
        para("2）特朗普取消因印度进口俄油征收的25%额外关税，印度承诺停止直接或间接进口俄罗斯石油，并在未来5年采购5000亿美元美国产品；"),
        para("3）乌俄谈判出现进展，泽连斯基表示支持美国提出的和平提议。"),
        emptyPara(),

        // 二、成品油市场
        section("二、成品油市场"),
        emptyPara(),
        para("柴油：亚洲柴油市场backwardation结构走宽，新加坡3/4月价差升至1.07美元/桶。2月掉期报89.14美元/桶，3月报87.96美元/桶，月差1.18美元。"),
        para("航煤：2月掉期报88.17美元/桶，3月报87.20美元/桶，月差0.97美元。"),
        para("石脑油：西向东到港量过去4个月均值245万吨/月，2月预计降至175万吨。CFR日本现货升水坚挺，报30美元/吨。台塑石脑油招标7.5万吨（3月下半月交付麦寮），升水7.5-8美元/吨。"),
        para("乙烯：CFR东北亚报695美元/吨，乙烯-石脑油价差仅92美元/吨，远低于盈亏线。台湾中油、台塑考虑停产，韩国部分生产商计划3月降负。"),
        emptyPara(),

        // 三、燃料油市场
        section("三、燃料油市场"),
        emptyPara(),
        para("新加坡380CST FOB报436.67美元/吨，周内上涨5.53美元/吨，交付升水走高至5.33美元/吨，供应偏紧。富查伊拉380CST报420美元/吨，周涨5美元。鹿特丹HSFO驳船成交365-366美元/吨。"),
        para("欧洲市场受荷兰执行RED III法规影响，传统燃料成本上升。"),
        emptyPara(),

        // 四、LNG市场
        section("四、LNG市场"),
        emptyPara(),
        para("JKM 4月报10.47-10.48美元/百万英热。韩国KOGAS采购4-6月10余船，贴水JKM 10-20美分。韩国1月LNG进口596万吨，同比增长45%创历史新高。日本库存2月8日降至189万吨，为18周低点。"),
        para("新项目动态：道达尔CEO表示卡塔尔NFE预计2026年三季度投产；Cheniere Corpus Christi第5条生产线即将投产。"),
        emptyPara(),

        // 五、EIA周度库存
        section("五、EIA周度库存（截至2月6日）"),
        emptyPara(),
        para("商业原油库存（除SPR）：4.288亿桶，周增850万桶（+2.0%）"),
        para("战略石油储备：4.152亿桶，持平"),
        para("汽油库存：2.591亿桶，周增120万桶（+0.5%）"),
        para("馏分油库存：1.247亿桶，周降270万桶（-2.1%）"),
        para("原油产量：1371万桶/日，周增50万桶/日"),
        para("炼厂输入：1600万桶/日，周降3万桶/日"),
        emptyPara(),

        // 六、VLCC运费
        section("六、VLCC运费动态"),
        emptyPara(),
        para("中东湾2月船期基本清仓，船东惜售等待3月。大西洋市场强势，巴西主导，美湾回暖。巴西/东向报价突破WS125，美湾/东向确认1400万美元。"),
        emptyPara(),

        // 七、政策动态
        section("七、政策动态"),
        emptyPara(),
        para("中国化工、石化行业预计2027年纳入全国碳排放权交易市场，届时将基本覆盖工业领域主要排放行业。"),
        para("沙特更换投资部长，由法立赫换为来自主权基金PIF的Fahad Al-Saif，正在取消部分投资项目并加大力度吸引外资。"),
      ],
    },
  ],
});

const buffer = await Packer.toBuffer(doc);
const outputPath = "/home/node/clawd/reports/周报_2026-W07_20260208-0214.docx";
fs.writeFileSync(outputPath, buffer);
console.log(`Report saved to: ${outputPath}`);
