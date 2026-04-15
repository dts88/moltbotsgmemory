#!/usr/bin/env python3
"""
AKShare 期货数据查询工具
用法:
  python3 scripts/futures.py quote 原油          # 实时行情
  python3 scripts/futures.py quote sc            # 按代码查询
  python3 scripts/futures.py history sc2505      # 日K历史
  python3 scripts/futures.py history sc2505 --days=30
  python3 scripts/futures.py list                # 所有品种
  python3 scripts/futures.py list 能源            # 按类别筛选
  python3 scripts/futures.py search 原油          # 搜索品种
  python3 scripts/futures.py fees 原油            # 手续费
  python3 scripts/futures.py --json quote 原油    # JSON输出
"""

import sys
import json
import argparse
from datetime import datetime, timedelta

import akshare as ak
import pandas as pd

# 能源相关品种映射 (中文名 -> 代码)
ENERGY_ALIASES = {
    '原油': '原油', 'crude': '原油', 'sc': '原油',
    '燃料油': '燃油', '燃油': '燃油', 'fuel': '燃油', 'fu': '燃油',
    '低硫燃料油': '低硫燃料油', 'vlsfo': '低硫燃料油', 'lu': '低硫燃料油',
    '沥青': '沥青', 'bitumen': '沥青', 'bu': '沥青',
    'lpg': '液化石油气', '液化石油气': '液化石油气', 'pg': '液化石油气',
    '甲醇': '甲醇', 'methanol': '甲醇', 'ma': '甲醇',
    'pta': 'PTA', '精对苯二甲酸': 'PTA', 'ta': 'PTA',
    'px': '二甲苯', '对二甲苯': '二甲苯', '二甲苯': '二甲苯',
    '乙二醇': '乙二醇', 'eg': '乙二醇',
    '苯乙烯': '苯乙烯', 'eb': '苯乙烯',
    '聚乙烯': '塑料', 'pe': '塑料', 'l': '塑料', '塑料': '塑料',
    '聚丙烯': '聚丙烯', 'pp': '聚丙烯',
    'pvc': 'PVC', '聚氯乙烯': 'PVC', 'v': 'PVC',
    '20号胶': '20号胶', 'nr': '20号胶',
    '天然橡胶': '橡胶', '橡胶': '橡胶', 'rubber': '橡胶', 'ru': '橡胶',
    '纸浆': '纸浆', 'sp': '纸浆',
    '集运指数': '集运指数(欧线)', 'ec': '集运指数(欧线)',
    '国际铜': '国际铜', 'bc': '国际铜',
    '铜': '沪铜', 'cu': '沪铜', '沪铜': '沪铜',
    '铝': '沪铝', 'al': '沪铝', '沪铝': '沪铝',
    '锌': '沪锌', 'zn': '沪锌', '沪锌': '沪锌',
    '黄金': '沪金', 'gold': '沪金', 'au': '沪金', '沪金': '沪金',
    '白银': '沪银', 'silver': '沪银', 'ag': '沪银', '沪银': '沪银',
    '螺纹钢': '螺纹钢', 'rb': '螺纹钢',
    '铁矿石': '铁矿石', 'iron': '铁矿石', 'i': '铁矿石',
    '焦炭': '焦炭', 'j': '焦炭',
    '焦煤': '焦煤', 'jm': '焦煤',
    '豆粕': '豆粕', 'm': '豆粕',
    '棕榈油': '棕榈', 'palm': '棕榈', 'p': '棕榈', '棕榈': '棕榈',
    '豆油': '豆油', 'y': '豆油',
    '纯碱': '纯碱', 'sa': '纯碱',
    '玻璃': '玻璃', 'fg': '玻璃',
    '生猪': '生猪', 'lh': '生猪',
    '碳酸锂': '碳酸锂', 'lc': '碳酸锂',
    '工业硅': '工业硅', 'si': '工业硅',
}

# 品种分类
CATEGORIES = {
    '能源': ['原油', '燃料油', '低硫燃料油', '沥青', '液化石油气', '甲醇', '精对苯二甲酸', '对二甲苯'],
    '化工': ['乙二醇', '苯乙烯', '聚乙烯', '聚丙烯', '聚氯乙烯', '纸浆', '纯碱', '烧碱', '短纤', '瓶片'],
    '金属': ['铜', '铝', '锌', '铅', '镍', '锡', '不锈钢', '氧化铝', '国际铜', '黄金', '白银'],
    '黑色': ['螺纹钢', '热轧卷板', '铁矿石', '焦炭', '焦煤', '线材', '硅铁', '锰硅'],
    '农产品': ['豆粕', '豆油', '棕榈油', '菜粕', '菜籽油', '白砂糖', '棉花', '玉米', '鸡蛋', '生猪', '苹果', '红枣', '花生'],
    '橡胶': ['天然橡胶', '20号胶', '合成橡胶'],
    '航运': ['集运指数(欧线)'],
    '新能源': ['工业硅', '碳酸锂', '多晶硅'],
    '金融': ['沪深300股指期货', '上证50股指期货', '中证500股指期货', '中证1000股指期货', '2年期国债', '5年期国债', '10年期国债', '30年期国债'],
}


def resolve_symbol(query):
    """解析用户输入为 AKShare 期货品种名"""
    q = query.lower().strip()
    if q in ENERGY_ALIASES:
        return ENERGY_ALIASES[q]
    # 尝试直接匹配中文名
    return query


def cmd_quote(args):
    """实时行情"""
    symbol = resolve_symbol(args.symbol)
    try:
        df = ak.futures_zh_realtime(symbol=symbol)
    except Exception as e:
        print(f"查询失败: {e}", file=sys.stderr)
        sys.exit(1)

    if df.empty:
        print(f"未找到品种: {symbol}")
        sys.exit(1)

    # 选择关键列
    cols = ['symbol', 'name', 'trade', 'open', 'high', 'low', 'close',
            'presettlement', 'settlement', 'volume', 'position', 'ticktime']
    available = [c for c in cols if c in df.columns]
    result = df[available]

    if args.json:
        print(json.dumps(json.loads(result.to_json(orient='records', force_ascii=False)), 
                         ensure_ascii=False, indent=2))
    else:
        # 格式化表格输出
        print(f"\n📊 {symbol} 实时行情 ({datetime.now().strftime('%Y-%m-%d %H:%M')})\n")
        for _, row in result.iterrows():
            name = row.get('name', '')
            code = row.get('symbol', '')
            trade = row.get('trade', '-')
            chg = ''
            if 'presettlement' in row and pd.notna(row['presettlement']) and row['presettlement'] != 0:
                pct = (float(row['trade']) - float(row['presettlement'])) / float(row['presettlement']) * 100
                arrow = '🔴' if pct < 0 else '🟢'
                chg = f" {arrow} {pct:+.2f}%"
            vol = row.get('volume', '-')
            oi = row.get('position', '-')
            print(f"  {code} {name}: {trade}{chg}  vol:{vol} oi:{oi}")
        print()


def cmd_history(args):
    """历史K线"""
    symbol = args.symbol.upper()
    days = args.days or 120
    
    try:
        # 尝试用 futures_zh_daily_sina 接口
        df = ak.futures_zh_daily_sina(symbol=symbol)
    except Exception as e:
        print(f"查询失败: {e}", file=sys.stderr)
        print(f"提示: 请使用合约代码如 SC2505, FU2505, LU2505", file=sys.stderr)
        sys.exit(1)

    if df.empty:
        print(f"无数据: {symbol}")
        sys.exit(1)

    # 取最近N天
    df = df.tail(days)

    if args.json:
        print(json.dumps(json.loads(df.to_json(orient='records', force_ascii=False, date_format='iso')),
                         ensure_ascii=False, indent=2))
    else:
        print(f"\n📈 {symbol} 日K线 (最近{days}天)\n")
        print(df.to_string(index=False))
        print()


def cmd_list(args):
    """列出品种"""
    category = args.category if args.category else None
    
    if category:
        # 按类别筛选
        found = False
        for cat, items in CATEGORIES.items():
            if category in cat:
                print(f"\n📋 {cat}期货品种:\n")
                for item in items:
                    print(f"  • {item}")
                print()
                found = True
        if not found:
            print(f"未找到类别: {category}")
            print(f"可用类别: {', '.join(CATEGORIES.keys())}")
    else:
        # 列出所有类别
        if args.json:
            print(json.dumps(CATEGORIES, ensure_ascii=False, indent=2))
        else:
            print("\n📋 期货品种分类\n")
            for cat, items in CATEGORIES.items():
                print(f"  【{cat}】{', '.join(items)}")
            print()


def cmd_search(args):
    """搜索品种"""
    query = args.query
    results = []
    for cat, items in CATEGORIES.items():
        for item in items:
            if query in item or query.lower() in item.lower():
                results.append((cat, item))
    
    # 也搜索别名
    for alias, name in ENERGY_ALIASES.items():
        if query.lower() in alias.lower():
            for cat, items in CATEGORIES.items():
                if name in items:
                    entry = (cat, name)
                    if entry not in results:
                        results.append(entry)

    if results:
        print(f"\n🔍 搜索 '{query}' 结果:\n")
        for cat, item in results:
            print(f"  [{cat}] {item}")
        print()
    else:
        print(f"未找到: {query}")


def cmd_fees(args):
    """手续费查询"""
    query = args.query if args.query else '所有'
    
    exchange_map = {
        '上期所': '上海期货交易所', 'shfe': '上海期货交易所',
        '大商所': '大连商品交易所', 'dce': '大连商品交易所', 
        '郑商所': '郑州商品交易所', 'czce': '郑州商品交易所',
        '能源中心': '上海国际能源交易中心', 'ine': '上海国际能源交易中心',
        '中金所': '中国金融期货交易所', 'cffex': '中国金融期货交易所',
        '广期所': '广州期货交易所', 'gfex': '广州期货交易所',
        '所有': '所有', 'all': '所有',
    }
    
    symbol = exchange_map.get(query.lower(), query)
    
    try:
        df = ak.futures_comm_info(symbol=symbol)
    except Exception as e:
        print(f"查询失败: {e}", file=sys.stderr)
        sys.exit(1)

    if df.empty:
        print(f"无数据: {symbol}")
        sys.exit(1)

    # 如果查询的是品种名（不是交易所），过滤结果
    if symbol == '所有' and query not in exchange_map:
        mask = df['合约名称'].str.contains(query, na=False) | df['品种名称'].str.contains(query, na=False) if '品种名称' in df.columns else df['合约名称'].str.contains(query, na=False)
        df = df[mask]

    cols = ['合约名称', '合约代码', '现价', '保证金-每手', '手续费标准-开仓-元', '手续费标准-平今-元', '每跳毛利']
    available = [c for c in cols if c in df.columns]

    if args.json:
        print(json.dumps(json.loads(df[available].to_json(orient='records', force_ascii=False)),
                         ensure_ascii=False, indent=2))
    else:
        print(f"\n💰 期货手续费 ({query})\n")
        print(df[available].to_string(index=False))
        print()


def main():
    parser = argparse.ArgumentParser(description='AKShare 期货数据查询')
    parser.add_argument('--json', action='store_true', help='JSON 输出')
    
    subparsers = parser.add_subparsers(dest='command', help='子命令')
    
    # quote
    p_quote = subparsers.add_parser('quote', help='实时行情')
    p_quote.add_argument('symbol', help='品种名或代码 (如: 原油, sc, 燃料油)')
    
    # history
    p_hist = subparsers.add_parser('history', help='历史K线')
    p_hist.add_argument('symbol', help='合约代码 (如: SC2505)')
    p_hist.add_argument('--days', type=int, default=120, help='天数')
    
    # list
    p_list = subparsers.add_parser('list', help='列出品种')
    p_list.add_argument('category', nargs='?', help='类别 (如: 能源, 化工)')
    
    # search
    p_search = subparsers.add_parser('search', help='搜索品种')
    p_search.add_argument('query', help='搜索关键词')
    
    # fees
    p_fees = subparsers.add_parser('fees', help='手续费查询')
    p_fees.add_argument('query', nargs='?', default='所有', help='交易所或品种名')
    
    args = parser.parse_args()
    
    if not args.command:
        parser.print_help()
        sys.exit(0)
    
    commands = {
        'quote': cmd_quote,
        'history': cmd_history,
        'list': cmd_list,
        'search': cmd_search,
        'fees': cmd_fees,
    }
    
    commands[args.command](args)


if __name__ == '__main__':
    main()
