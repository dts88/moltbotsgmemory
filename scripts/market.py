#!/usr/bin/env python3
"""
market.py - 市场数据查询工具 (基于 AKShare)

设计原则: 精确查询，最小输出。能查一行就不返回整张表。

用法:
  python3 scripts/market.py forex                      # 全部外汇报价
  python3 scripts/market.py forex USD                  # 仅含 USD 的货币对
  python3 scripts/market.py forex USD/CNY              # 精确匹配

  python3 scripts/market.py oil                        # 中国油价最新调整
  python3 scripts/market.py oil history                # 历史调价记录(最近10次)
  python3 scripts/market.py oil detail 上海            # 指定城市/省份油价

  python3 scripts/market.py index                      # 全球股指(前20)
  python3 scripts/market.py index 上证                 # 过滤关键词

  python3 scripts/market.py basis 2026-03-07           # 期货现货基差(指定日期)
  python3 scripts/market.py basis 2026-03-07 原油      # 过滤品种

  python3 scripts/market.py position dce 2026-03-10   # 大商所持仓排名
  python3 scripts/market.py position shfe 2026-03-10  # 上期所持仓排名
  python3 scripts/market.py position gfex             # 广期所持仓排名(工业硅/碳酸锂)
  python3 scripts/market.py position ine 2026-03-10   # INE日报(SC原油/LU低硫)

  python3 scripts/market.py cftc                       # CFTC商业持仓(纽约原油净仓位)
  python3 scripts/market.py cftc --full                # 所有品种多空净仓

  python3 scripts/market.py usaprod                    # 美国原油产量(最近5条)

  python3 scripts/market.py shibor                     # 中国银行间利率(Shibor)最新
  python3 scripts/market.py shibor --limit 5           # 最近5条

  python3 scripts/market.py wci                        # 德鲁里世界集装箱指数(最近5条)

  python3 scripts/market.py overseas                   # 海外能源期货 (WTI/Brent/天然气/欧洲碳)
  python3 scripts/market.py overseas CL                # 仅 WTI 原油
  python3 scripts/market.py overseas OIL               # 仅 Brent 原油

  python3 scripts/market.py lme                        # LME金属库存最新 (铜/铝/锌/镍/铅/锡)

  python3 scripts/market.py fedrate                    # 美联储最新利率决议

  --json    JSON 输出
  --full    输出全部列（默认只输出关键列）
  --limit N 最多输出 N 行 (默认 20)
"""

import sys
import json
import argparse
from datetime import datetime, timedelta

import akshare as ak
import pandas as pd


def to_json(df):
    return json.dumps(json.loads(df.to_json(orient='records', force_ascii=False)), 
                      ensure_ascii=False, indent=2)


def filter_df(df, keyword, columns=None):
    """在指定列中搜索关键词，未指定则搜索全部字符串列"""
    if not keyword:
        return df
    cols = columns or df.select_dtypes(include='object').columns.tolist()
    mask = pd.Series([False] * len(df), index=df.index)
    for col in cols:
        if col in df.columns:
            mask |= df[col].astype(str).str.contains(keyword, case=False, na=False)
    return df[mask]


# ─── 外汇 ────────────────────────────────────────────────────────────────────

def cmd_forex(args):
    """外汇即期报价 - 中国银行"""
    df = ak.fx_spot_quote()
    # 列名标准化
    # 输出: 货币对, 买报价, 卖报价
    if args.filter:
        df = filter_df(df, args.filter, ['货币对'])
    if df.empty:
        print(f"未找到: {args.filter}")
        return
    if args.json:
        print(to_json(df))
    else:
        print(f"\n💱 外汇即期报价\n")
        for _, row in df.iterrows():
            pair = row.get('货币对', '-')
            buy = row.get('买报价', '-')
            sell = row.get('卖报价', '-')
            print(f"  {pair:<15} 买: {buy:<10} 卖: {sell}")
        print()


# ─── 中国油价 ─────────────────────────────────────────────────────────────────

def cmd_oil(args):
    """中国成品油调价"""
    mode = args.mode or 'latest'

    if mode == 'history':
        df = ak.energy_oil_hist()
        n = args.limit or 10
        df = df.tail(n)
        if args.json:
            print(to_json(df))
        else:
            print(f"\n⛽ 中国成品油调价历史 (最近{n}次)\n")
            cols = ['调整日期', '汽油价格', '柴油价格', '汽油涨跌', '柴油涨跌']
            available = [c for c in cols if c in df.columns]
            for _, row in df[available].iterrows():
                date = row.get('调整日期', '-')
                gas = row.get('汽油价格', '-')
                diesel = row.get('柴油价格', '-')
                gas_chg = row.get('汽油涨跌', 0)
                diesel_chg = row.get('柴油涨跌', 0)
                gas_arrow = '🔺' if gas_chg > 0 else ('🔻' if gas_chg < 0 else '─')
                diesel_arrow = '🔺' if diesel_chg > 0 else ('🔻' if diesel_chg < 0 else '─')
                print(f"  {date}  汽油: {gas} {gas_arrow}{gas_chg:+.0f}  柴油: {diesel} {diesel_arrow}{diesel_chg:+.0f}")
            print()

    elif mode == 'detail':
        # 先获取最新调价日期
        hist_df = ak.energy_oil_hist()
        latest_date = str(hist_df.iloc[-1]['调整日期']).replace('-', '')
        df = ak.energy_oil_detail(date=latest_date)
        # 过滤地区
        if args.filter:
            df = filter_df(df, args.filter, ['日期', '地区'])
        n = args.limit or 10
        df = df.head(n)
        if args.json:
            print(to_json(df))
        else:
            cols = ['地区', 'V_92', 'V_95', 'V_0']
            available = [c for c in cols if c in df.columns]
            print(f"\n⛽ 各地成品油价格 (调价日: {hist_df.iloc[-1]['调整日期']})\n")
            for _, row in df[available].iterrows():
                region = row.get('地区', '-')
                g92 = row.get('V_92', '-')
                g95 = row.get('V_95', '-')
                d0 = row.get('V_0', '-')
                print(f"  {region:<8} 92#: {g92}  95#: {g95}  柴油: {d0}")
            print()

    else:
        # 默认: 最新调价
        df = ak.energy_oil_hist()
        row = df.iloc[-1]
        if args.json:
            print(to_json(df.tail(1)))
        else:
            date = row.get('调整日期', '-')
            gas = row.get('汽油价格', '-')
            diesel = row.get('柴油价格', '-')
            gas_chg = row.get('汽油涨跌', 0)
            diesel_chg = row.get('柴油涨跌', 0)
            gas_arrow = '🔺' if gas_chg > 0 else '🔻'
            diesel_arrow = '🔺' if diesel_chg > 0 else '🔻'
            print(f"\n⛽ 中国成品油最新调价 ({date})\n")
            print(f"  92# 汽油: {gas} 元/吨  {gas_arrow} {gas_chg:+.0f}")
            print(f"  柴油:     {diesel} 元/吨  {diesel_arrow} {diesel_chg:+.0f}\n")


# ─── 全球指数 ─────────────────────────────────────────────────────────────────

def cmd_index(args):
    """全球股票指数"""
    df = ak.index_global_spot_em()
    if args.filter:
        df = filter_df(df, args.filter, ['名称', '代码'])
    n = args.limit or 20
    df = df.head(n)
    if df.empty:
        print(f"未找到: {args.filter}")
        return
    cols_full = ['代码', '名称', '最新价', '涨跌额', '涨跌幅', '开盘价', '最高价', '最低价', '昨收价', '最新行情时间']
    cols_brief = ['名称', '最新价', '涨跌幅', '最新行情时间']
    cols = (cols_full if args.full else cols_brief)
    available = [c for c in cols if c in df.columns]
    if args.json:
        print(to_json(df[available]))
    else:
        print(f"\n🌍 全球股票指数\n")
        for _, row in df[available].iterrows():
            name = row.get('名称', '-')
            price = row.get('最新价', '-')
            chg = row.get('涨跌幅', 0)
            t = row.get('最新行情时间', '')
            arrow = '🔺' if chg > 0 else ('🔻' if chg < 0 else '─')
            print(f"  {name:<20} {price:<12} {arrow} {chg:+.2f}%  {t}")
        print()


# ─── 期货现货基差 ──────────────────────────────────────────────────────────────

def cmd_basis(args):
    """期货现货基差"""
    date_str = args.date
    if not date_str:
        # 上一个工作日
        d = datetime.today()
        while d.weekday() >= 5:
            d -= timedelta(days=1)
        date_str = d.strftime('%Y-%m-%d')

    df = ak.futures_spot_price(date=date_str)
    if df is None or df.empty:
        print(f"无数据: {date_str} (可能是非交易日)")
        return
    all_symbols = sorted(df['symbol'].tolist())
    if args.filter:
        df = filter_df(df, args.filter, ['symbol'])
        if df.empty:
            print(f"未找到品种: {args.filter}")
            print(f"可用品种: {', '.join(all_symbols)}")
            return
    n = args.limit or 20
    df = df.head(n)
    # 实际列名
    cols_brief = ['symbol', 'spot_price', 'dominant_contract', 'dominant_contract_price', 'dom_basis', 'dom_basis_rate']
    cols_full = df.columns.tolist()
    cols = cols_full if args.full else [c for c in cols_brief if c in df.columns]
    if args.json:
        print(to_json(df[cols]))
    else:
        print(f"\n📊 期现基差 ({date_str})\n")
        for _, row in df[cols].iterrows():
            sym = row.get('symbol', '-')
            spot = row.get('spot_price', '-')
            fut = row.get('dominant_contract_price', '-')
            basis = row.get('dom_basis', '-')
            rate = row.get('dom_basis_rate', 0)
            arrow = '🔺' if float(basis) > 0 else '🔻' if float(basis) < 0 else '─'
            print(f"  {sym:<6} 现货:{spot:<10} 主力:{fut:<10} 基差:{arrow}{basis:.1f}  ({rate*100:.2f}%)")
        print()


# ─── 期货持仓排名 ──────────────────────────────────────────────────────────────

def cmd_position(args):
    """期货持仓排名 - 使用 get_rank_table 系列接口"""
    from datetime import datetime as _dt
    exchange = (args.exchange or 'shfe').lower()

    # 注意: 这些接口返回 dict {合约代码: DataFrame}
    # 数据量较大，建议配合 --filter 过滤品种
    try:
        if exchange == 'shfe':
            result = ak.get_shfe_rank_table()
        elif exchange == 'dce':
            # get_dce_rank_table 常超时，尝试 futures_dce_position_rank 作为备用
            try:
                result = ak.get_dce_rank_table()
            except Exception:
                try:
                    df_dce = ak.futures_dce_position_rank()
                    if df_dce is not None and not df_dce.empty:
                        print(df_dce.head(args.limit or 10).to_string(index=False))
                    else:
                        print("DCE 持仓数据暂不可用（接口维护中）")
                    return
                except Exception as e2:
                    print(f"DCE 持仓数据暂不可用: {e2}")
                    return
        elif exchange == 'czce':
            result = ak.get_rank_table_czce()
        elif exchange == 'cffex':
            result = ak.get_cffex_rank_table()
        elif exchange == 'gfex':
            result = ak.futures_gfex_position_rank()
        elif exchange == 'ine':
            # INE 无持仓排名接口，改用日报（含持仓量）
            date_str = args.date.replace('-', '') if args.date else _dt.today().strftime('%Y%m%d')
            df_ine = ak.get_ine_daily(date=date_str)
            if df_ine is None or df_ine.empty:
                print(f"INE 无数据: {date_str} (可能非交易日)")
                return
            if args.filter:
                df_ine = filter_df(df_ine, args.filter.upper(), ['variety', 'symbol'])
            n = args.limit or 5
            cols = ['symbol', 'close', 'volume', 'open_interest', 'settle', 'variety']
            available = [c for c in cols if c in df_ine.columns]
            print(f"\n📋 INE 日报 ({date_str})\n")
            print(df_ine[available].head(n).to_string(index=False))
            print()
            return
        else:
            print(f"不支持的交易所: {exchange}. 可选: shfe, dce, czce, cffex, gfex, ine")
            return
    except Exception as e:
        print(f"查询失败: {e}")
        return

    if not result:
        print(f"无数据: {exchange}")
        return

    # 过滤合约
    filter_kw = args.filter or ''
    keys = [k for k in result.keys() if filter_kw.upper() in k.upper()] if filter_kw else list(result.keys())

    if not keys:
        print(f"未找到合约: {filter_kw}")
        print(f"可用合约: {', '.join(list(result.keys())[:10])}...")
        return

    n = args.limit or 10
    all_dfs = []
    for k in keys[:3]:  # 最多显示3个合约
        df = result[k].head(n)
        df.insert(0, '合约', k)
        all_dfs.append(df)

    if not all_dfs:
        return

    combined = pd.concat(all_dfs, ignore_index=True)
    # 精简输出列
    brief_cols = ['合约', 'rank', 'vol_party_name', 'vol', 'vol_chg',
                  'long_party_name', 'long_open_interest', 'long_open_interest_chg',
                  'short_party_name', 'short_open_interest', 'short_open_interest_chg']
    available = [c for c in brief_cols if c in combined.columns]
    out = combined[available] if not args.full else combined

    if args.json:
        print(to_json(out))
    else:
        print(f"\n📋 期货持仓排名 ({exchange.upper()} {'·'.join(keys[:3])})\n")
        print(out.to_string(index=False))
        print()


# ─── 美国钻井数 ────────────────────────────────────────────────────────────────


# ─── CFTC 持仓 ────────────────────────────────────────────────────────────────

def cmd_cftc(args):
    """CFTC 商品期货持仓报告 (非商业头寸)"""
    df = ak.macro_usa_cftc_c_holding()
    n = args.limit or 5
    df = df.tail(n)
    if args.json:
        print(to_json(df))
    elif args.full:
        print(f"\n📊 CFTC 持仓报告 (最近{n}条)\n")
        print(df.to_string(index=False))
        print()
    else:
        # 精简: 只显示纽约原油净仓位
        print(f"\n📊 CFTC 持仓报告 (最近{n}条) — 纽约原油\n")
        for _, row in df.iterrows():
            date = row.get('日期', '-')
            long_ = row.get('纽约原油-多头仓位', 0)
            short_ = row.get('纽约原油-空头仓位', 0)
            net = row.get('纽约原油-净仓位', 0)
            arrow = '🔺' if float(net) > 0 else '🔻'
            print(f"  {date}  多: {int(long_):>8,}  空: {int(short_):>8,}  净: {arrow}{int(net):>8,}")
        print(f"\n  💡 使用 --full 查看所有品种 (原糖/大豆/天然气/黄金等)\n")


# ─── 美国原油产量 ──────────────────────────────────────────────────────────────

def cmd_usaprod(args):
    """美国原油产量 (EIA周报)"""
    df = ak.macro_usa_crude_inner()
    n = args.limit or 5
    df = df.tail(n)
    if args.json:
        print(to_json(df))
    else:
        print(f"\n🛢️  美国原油产量 (万桶/日, 最近{n}条)\n")
        for _, row in df.iterrows():
            date = row.get('日期', '-')
            total = row.get('美国国内原油总量-产量', '-')
            total_chg = row.get('美国国内原油总量-变化', 0)
            lower48 = row.get('美国本土48州原油产量-产量', '-')
            alaska = row.get('美国阿拉斯加州原油产量-产量', '-')
            arrow = '🔺' if float(total_chg) > 0 else ('🔻' if float(total_chg) < 0 else '─')
            print(f"  {date}  总量: {total} {arrow}{float(total_chg):+.1f}  本土48州: {lower48}  阿拉斯加: {alaska}")
        print()


# ─── Shibor 银行间利率 ────────────────────────────────────────────────────────

def cmd_shibor(args):
    """中国银行间同业拆借利率 (Shibor)"""
    df = ak.macro_china_shibor_all()
    n = args.limit or 3
    df = df.tail(n)
    if args.json:
        print(to_json(df))
    elif args.full:
        print(f"\n💹 Shibor 银行间利率 (最近{n}条)\n")
        print(df.to_string(index=False))
        print()
    else:
        # 精简: O/N, 1W, 1M, 3M, 1Y
        key_cols = ['日期', 'O/N-定价', '1W-定价', '1M-定价', '3M-定价', '1Y-定价']
        available = [c for c in key_cols if c in df.columns]
        print(f"\n💹 Shibor 银行间利率 (%)\n")
        header = f"  {'日期':<12} {'O/N':>6} {'1W':>6} {'1M':>6} {'3M':>6} {'1Y':>6}"
        print(header)
        print('  ' + '-' * 45)
        for _, row in df[available].iterrows():
            date = str(row.get('日期', '-'))
            on = row.get('O/N-定价', '-')
            w1 = row.get('1W-定价', '-')
            m1 = row.get('1M-定价', '-')
            m3 = row.get('3M-定价', '-')
            y1 = row.get('1Y-定价', '-')
            print(f"  {date:<12} {on:>6} {w1:>6} {m1:>6} {m3:>6} {y1:>6}")
        print(f"\n  💡 使用 --full 查看全期限 (2W/6M/9M等)\n")


# ─── 德鲁里集装箱运价指数 ────────────────────────────────────────────────────

def cmd_wci(args):
    """德鲁里世界集装箱指数 (Drewry WCI)"""
    df = ak.drewry_wci_index()
    n = args.limit or 5
    df = df.tail(n)
    if args.json:
        print(to_json(df))
    else:
        print(f"\n🚢 德鲁里世界集装箱指数 (Drewry WCI, $/FEU)\n")
        for _, row in df.iterrows():
            date = str(row.get('date', '-'))
            wci = row.get('wci', '-')
            print(f"  {date}  WCI: {wci:.0f}")
        print()


# ─── 海外能源期货 ─────────────────────────────────────────────────────────────

# 可用 symbol 参照 ak.futures_hq_subscribe_exchange_symbol()
OVERSEAS_ENERGY_SYMBOLS = [
    ('CL',  'WTI原油',   '美元/桶'),
    ('OIL', '布伦特原油', '美元/桶'),
    ('NG',  'NYMEX天然气', '美元/MMBtu'),
    ('EUA', '欧洲碳排放', '欧元/吨'),
]

def cmd_overseas(args):
    """海外能源期货实时行情 (新浪)"""
    filter_sym = (args.filter or '').upper()
    targets = [(s, n, u) for s, n, u in OVERSEAS_ENERGY_SYMBOLS
               if not filter_sym or filter_sym in s or filter_sym in n]
    if not targets:
        # 尝试直接查询用户指定的 symbol
        targets = [(filter_sym, filter_sym, '')]

    rows = []
    for sym, label, unit in targets:
        try:
            df = ak.futures_foreign_commodity_realtime(symbol=sym)
            if not df.empty:
                row = df.iloc[0]
                rows.append({
                    'symbol': sym,
                    'name': row.get('名称', label),
                    'price': row.get('最新价', '-'),
                    'cny': row.get('人民币报价', '-'),
                    'chg': row.get('涨跌额', 0),
                    'pct': row.get('涨跌幅', 0),
                    'time': row.get('行情时间', '-'),
                    'unit': unit,
                })
        except Exception as e:
            rows.append({'symbol': sym, 'name': label, 'price': 'ERR', 'cny': '-',
                         'chg': 0, 'pct': 0, 'time': '-', 'unit': unit})

    if args.json:
        print(json.dumps(rows, ensure_ascii=False, indent=2))
    else:
        print(f"\n🌐 海外能源期货实时行情\n")
        for r in rows:
            pct = float(r['pct']) if r['pct'] not in ('-', None) else 0
            arrow = '🔺' if pct > 0 else ('🔻' if pct < 0 else '─')
            chg = float(r['chg']) if r['chg'] not in ('-', None) else 0
            try:
                cny_str = f"{float(r['cny']):.2f}"
            except (ValueError, TypeError):
                cny_str = str(r['cny'])
            print(f"  [{r['symbol']:>3}] {r['name']:<10} {r['price']:<10} {arrow}{chg:+.3f} ({pct:+.2f}%)  "
                  f"CNY:{cny_str:<12} {r['time']}")
        print()


# ─── LME 金属库存 ─────────────────────────────────────────────────────────────

def cmd_lme(args):
    """LME 金属库存 (伦敦金属交易所)"""
    df = ak.macro_euro_lme_stock()
    if df.empty:
        print("无数据")
        return
    # 只取最新一行
    row = df.iloc[-1]
    date = str(row.get('日期', '-'))
    metals = [
        ('铜',  '铜-库存',  '铜-注册仓单',  '铜-注销仓单'),
        ('铝',  '铝-库存',  '铝-注册仓单',  '铝-注销仓单'),
        ('锌',  '锌-库存',  '锌-注册仓单',  '锌-注销仓单'),
        ('镍',  '镍-库存',  '镍-注册仓单',  '镍-注销仓单'),
        ('铅',  '铅-库存',  '铅-注册仓单',  '铅-注销仓单'),
        ('锡',  '锡-库存',  '锡-注册仓单',  '锡-注销仓单'),
    ]
    if args.json:
        out = {'日期': date}
        for m, k_stock, k_reg, k_cancel in metals:
            out[m] = {'库存': row.get(k_stock), '注册仓单': row.get(k_reg), '注销仓单': row.get(k_cancel)}
        print(json.dumps(out, ensure_ascii=False, indent=2))
    else:
        print(f"\n🏭 LME 金属库存 ({date})  单位: 吨\n")
        print(f"  {'品种':<4} {'库存':>10} {'注册仓单':>10} {'注销仓单':>10}")
        print('  ' + '-' * 40)
        for m, k_stock, k_reg, k_cancel in metals:
            stock = row.get(k_stock, '-')
            reg = row.get(k_reg, '-')
            cancel = row.get(k_cancel, '-')
            try:
                print(f"  {m:<4} {int(stock):>10,} {int(reg):>10,} {int(cancel):>10,}")
            except (ValueError, TypeError):
                print(f"  {m:<4} {stock:>10} {reg:>10} {cancel:>10}")
        print()


# ─── 美联储利率 ───────────────────────────────────────────────────────────────

def cmd_fedrate(args):
    """美联储利率决议 (最新实际值)"""
    df = ak.macro_bank_usa_interest_rate()
    # 只保留有实际今值的行
    df_actual = df[df['今值'].notna()].copy()
    if df_actual.empty:
        print("无数据")
        return
    n = args.limit or 3
    df_show = df_actual.tail(n)
    if args.json:
        print(to_json(df_show))
    else:
        print(f"\n🏦 美联储利率决议 (最近{n}次)\n")
        print(f"  {'日期':<14} {'今值':>6} {'预测值':>8} {'前值':>6}")
        print('  ' + '-' * 40)
        for _, row in df_show.iterrows():
            date = str(row.get('日期', '-'))
            now = row.get('今值', '-')
            pred = row.get('预测值', '-')
            prev = row.get('前值', '-')
            print(f"  {date:<14} {str(now):>6} {str(pred):>8} {str(prev):>6}")
        print()


# ─── 主入口 ───────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description='市场数据查询 (AKShare)')
    parser.add_argument('--json', action='store_true')
    parser.add_argument('--full', action='store_true', help='输出全部列')
    parser.add_argument('--limit', type=int, default=None, help='最多输出N行')

    sub = parser.add_subparsers(dest='command')

    # forex
    p = sub.add_parser('forex', help='外汇即期报价')
    p.add_argument('filter', nargs='?', help='过滤关键词 (如: USD, EUR/CNY)')
    p.add_argument('--limit', type=int)

    # oil
    p = sub.add_parser('oil', help='中国成品油价格')
    p.add_argument('mode', nargs='?', choices=['latest', 'history', 'detail'], default='latest')
    p.add_argument('filter', nargs='?', help='过滤 (detail模式下为地区)')
    p.add_argument('--limit', type=int)

    # index
    p = sub.add_parser('index', help='全球股票指数')
    p.add_argument('filter', nargs='?', help='过滤关键词 (如: 上证, S&P, 纳斯达克)')
    p.add_argument('--limit', type=int)

    # basis
    p = sub.add_parser('basis', help='期货现货基差')
    p.add_argument('date', nargs='?', help='日期 YYYY-MM-DD (默认最近交易日)')
    p.add_argument('filter', nargs='?', help='过滤品种')
    p.add_argument('--limit', type=int)

    # position
    p = sub.add_parser('position', help='期货持仓排名')
    p.add_argument('exchange', nargs='?', default='dce', help='交易所: dce/shfe/czce/ine/gfex')
    p.add_argument('date', nargs='?', help='日期 YYYYMMDD 或 YYYY-MM-DD')
    p.add_argument('filter', nargs='?', help='过滤品种')
    p.add_argument('--limit', type=int)

    # cftc
    p = sub.add_parser('cftc', help='CFTC持仓报告 (非商业头寸)')
    p.add_argument('--limit', type=int)

    # usaprod
    p = sub.add_parser('usaprod', help='美国原油产量 (EIA)')
    p.add_argument('--limit', type=int)

    # shibor
    p = sub.add_parser('shibor', help='中国银行间同业拆借利率')
    p.add_argument('--limit', type=int)

    # wci
    p = sub.add_parser('wci', help='德鲁里世界集装箱指数')
    p.add_argument('--limit', type=int)

    # overseas
    p = sub.add_parser('overseas', help='海外能源期货 (WTI/Brent/天然气/欧洲碳)')
    p.add_argument('filter', nargs='?', help='过滤: CL(WTI), OIL(Brent), NG(天然气), EUA(碳)')

    # lme
    p = sub.add_parser('lme', help='LME金属库存 (铜/铝/锌/镍/铅/锡)')

    # fedrate
    p = sub.add_parser('fedrate', help='美联储利率决议')
    p.add_argument('--limit', type=int)

    args = parser.parse_args()
    if not args.command:
        parser.print_help()
        return

    # 继承公共参数
    dispatch = {
        'forex': cmd_forex,
        'oil': cmd_oil,
        'index': cmd_index,
        'basis': cmd_basis,
        'position': cmd_position,
        'cftc': cmd_cftc,
        'usaprod': cmd_usaprod,
        'shibor': cmd_shibor,
        'wci': cmd_wci,
        'overseas': cmd_overseas,
        'lme': cmd_lme,
        'fedrate': cmd_fedrate,
    }
    dispatch[args.command](args)


if __name__ == '__main__':
    main()
