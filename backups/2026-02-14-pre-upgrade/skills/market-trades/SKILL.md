---
name: market-trades
version: 1.0.0
description: 收集整理原油、成品油、燃料油、LNG等实货交易信息和市场传闻。从Argus日报和Platts Heards提取交易数据。
---

# 市场交易信息技能

收集、整理原油、成品油、燃料油、LNG 等实货交易信息和市场传闻。

## 信息来源

| 来源 | 触发时机 | 内容类型 |
|------|----------|----------|
| **Argus 日报** | 每日报告导入时 (凌晨 3:00) | Deals Done, Tenders |
| **Platts Heards** | Platts Monitor 执行时 (每50分钟) | 窗口成交, 市场传闻 |

## 存储位置

```
reports/
├── market-trades/
│   ├── 2026-02.json       # 月度汇总 (结构化数据)
│   ├── 2026-02.md         # 月度汇总 (可读格式)
│   └── daily/
│       ├── 2026-02-14.json
│       └── ...
```

## 数据结构

```json
{
  "date": "2026-02-14",
  "source": "argus|platts",
  "trades": [
    {
      "product": "380燃料油",
      "category": "fuel_oil|crude|gasoline|naphtha|gasoil|jet|lng",
      "seller": "Trafigura",
      "buyer": "Petrochina",
      "volume": "20,000t",
      "basis": "Mops",
      "premium": "+14.00",
      "period": "9-13 Mar",
      "location": "Singapore",
      "remarks": ""
    }
  ],
  "tenders": [
    {
      "issuer": "IOC",
      "direction": "sell|buy",
      "product": "石脑油",
      "volume": "45,000t",
      "loadPeriod": "12-13 Mar",
      "location": "Chennai",
      "closeDate": "13 Feb",
      "result": "pending|awarded|cancelled"
    }
  ],
  "heards": [
    {
      "product": "Dubai",
      "content": "32笔成交，收盘 $68.69/桶",
      "time": "16:30 SGT"
    }
  ]
}
```

## 提取规则

### Argus 日报
1. 定位 "Deals Done" / "Deals and Tenders" 章节
2. 解析表格数据: Seller, Buyer, Product, Volume, Diff, Basis, Price, Timing
3. 定位 "Issued Tenders" / "Tenders" 表格
4. 从新闻正文中提取提及的交易 (如 "LG Chem bought...")

### Platts Heards
1. 解析 MOC 窗口成交信息
2. 提取具体交易: 品种、买卖方、价格、数量
3. 记录市场传闻 (offers, bids, trades heard)

## 产品分类

| 类别 | 包含产品 |
|------|----------|
| **crude** | Dubai, Oman, Murban, WTI, Brent, ESPO, Urals, 各国原油品种 |
| **gasoline** | 92R, 95R, 97R, RBOB, MEBOB |
| **naphtha** | 石脑油, open-spec, light naphtha |
| **jet** | 航煤, Jet A-1 |
| **gasoil** | 柴油, 10ppm, 50ppm, 500ppm |
| **fuel_oil** | 180cst, 380cst, HSFO, VLSFO, LSWR |
| **lng** | JKM, DES, FOB |

## 专业术语

| 英文 | 中文 |
|------|------|
| Mops | 新加坡普氏均价 |
| Mopj | 日本普氏均价 |
| Mopag | 中东普氏均价 |
| MOC | 收盘窗口评估 |
| partials | 窗口成交 |
| cif/cfr | 到岸价 |
| fob | 离岸价 |
| premium/diff | 升贴水 |

## 工作流

### 1. Argus 报告导入时
```
触发: 报告导入任务 (凌晨 3:00)
步骤:
1. 读取当日 Argus PDF (crude, products, lng)
2. 提取 Deals Done 和 Tenders
3. 保存到 reports/market-trades/daily/YYYY-MM-DD.json
4. 更新月度汇总
```

### 2. Platts Monitor 执行时
```
触发: Platts Monitor (每50分钟)
步骤:
1. 解析 Heards 中的交易信息
2. 追加到当日 daily/YYYY-MM-DD.json
3. 若有重要交易，包含在推送消息中
```

## 输出格式 (月度汇总 Markdown)

```markdown
# 市场交易汇总 2026年2月

## 原油
| 日期 | 品种 | 买方 | 卖方 | 数量 | 基准 | 升贴水 | 装期 |
|------|------|------|------|------|------|--------|------|

## 成品油
### 汽油
...

### 石脑油
...

## 燃料油
...

## LNG
...

## 招标动态
...
```

## 注意事项

1. **数据去重**: 同一交易可能在多份报告中出现，需去重
2. **信息补全**: 后续报告可能补充早期交易的细节
3. **时效性**: 交易信息有时效性，按日期组织
4. **保密性**: 部分买卖方信息可能不公开，标记为 "-"
