---
name: stock-query
description: 查询股票行情，支持A股（沪深）和美股。触发词：股票、股价、查A股、查美股、K线、涨跌幅、茅台股价、苹果股价。
---

# Stock Query

脚本: `scripts/stock.mjs`
数据源: 新浪财经(A股实时/分时) + 东方财富(A股历史) + Yahoo Finance(美股)

## 命令

```bash
# 实时行情
node scripts/stock.mjs quote 600519              # A股（6位代码）
node scripts/stock.mjs quote AAPL --market=us    # 美股
node scripts/stock.mjs quote 600519,000001       # 批量

# 历史K线
node scripts/stock.mjs history 600519            # 默认120天
node scripts/stock.mjs history 600519 --days=30
node scripts/stock.mjs history 600519 --klt=102  # 周K (101日/102周/103月)
node scripts/stock.mjs history AAPL --market=us

# 分时数据
node scripts/stock.mjs intraday 600519           # 1分钟K线
node scripts/stock.mjs intraday 600519 --scale=5 # 5分钟K线
node scripts/stock.mjs intraday AAPL --market=us

# 搜索
node scripts/stock.mjs search 茅台
node scripts/stock.mjs search apple --market=us
node scripts/stock.mjs search 茅台 --market=all

# JSON输出
node scripts/stock.mjs quote 600519 --json
```

## 市场自动检测

- 6位纯数字 → A股
- 中文关键词 → A股搜索
- 其他（AAPL等） → 美股
