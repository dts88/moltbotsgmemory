#!/usr/bin/env python3
"""
原油每日价格片段生成器
用法:
  python generate.py            # 自动取最近一个完整交易日
  python generate.py 2026-06-23 # 指定评估日期

读取 ~/.platts_config.json 的 access_token，经 spgci 查询 6 个 Platts 代码，
按固定中文格式输出文字片段。
"""

import sys
import os
import json
import math
import warnings
from datetime import date, timedelta

warnings.filterwarnings('ignore')

# 确保中文在任意终端/管道下都按 UTF-8 输出
try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

# 代码 -> 含义
SYMBOLS = {
    "PCAAT00": "Dubai Mo1",      # 迪拜
    "PCAAV00": "Dubai Mo3",      # 迪拜 M1-M3 用
    "PCAAS00": "Dated Brent",    # Dated 现货布伦特
    "AAYES00": "ICE Brent 16:30 London",  # 伦敦16:30 ICE布伦特
    "ICLL001": "ICE Brent Settlement",    # 期货收盘 ICE布伦特
    "ICIC001": "ICE WTI Settlement",      # 期货收盘 WTI
}
# 用来确定"完整交易日"的伦敦/期货收盘锚定代码
ANCHOR = ["PCAAS00", "AAYES00", "ICLL001", "ICIC001"]


def load_token():
    token = os.environ.get('PLATTS_TOKEN')
    if token:
        return token
    path = os.path.expanduser('~/.platts_config.json')
    if os.path.exists(path):
        with open(path) as f:
            data = json.load(f)
            return data.get('access_token') or data.get('token')
    return None


def setup():
    try:
        import spgci
        import spgci.config as config
    except ImportError:
        print(json.dumps({"error": "spgci 未安装: pip install spgci --break-system-packages"}))
        sys.exit(1)
    token = load_token()
    if not token:
        print(json.dumps({"error": "未找到 Platts Token，请检查 ~/.platts_config.json"}))
        sys.exit(1)
    config.set_token(token)
    return spgci.MarketData()


def fetch_series(md, symbol, days=20):
    """返回 {date_str: value}（仅收盘 c）"""
    end = date.today()
    start = end - timedelta(days=days)
    df = md.get_assessments_by_symbol_historical(
        symbol=symbol, bate='c',
        assess_date_gte=start, assess_date_lte=end,
        page_size=500, paginate=False,
    )
    out = {}
    for _, r in df.iterrows():
        d = str(r['assessDate'])[:10]
        v = r['value']
        if v is None or (isinstance(v, float) and math.isnan(v)):
            continue
        out[d] = round(float(v), 4)
    return out


def fmt_num(x):
    """去掉多余的尾随 0"""
    s = f"{x:.4f}".rstrip('0').rstrip('.')
    return s if s not in ('', '-0') else '0'


def fmt_chg(cur, prev):
    if prev is None:
        return "—"
    diff = round(cur - prev, 4)
    if abs(diff) < 1e-9:
        return "持平"
    return ("涨" if diff > 0 else "跌") + fmt_num(abs(diff))


def val_and_prev(series, anchor):
    """返回 (anchor日值, 前一可用日值)"""
    if anchor not in series:
        return None, None
    cur = series[anchor]
    earlier = sorted(d for d in series if d < anchor)
    prev = series[earlier[-1]] if earlier else None
    return cur, prev


def main():
    md = setup()
    series = {s: fetch_series(md, s) for s in SYMBOLS}

    # 确定锚定日期
    if len(sys.argv) > 1:
        anchor = sys.argv[1]
    else:
        common = None
        for s in ANCHOR:
            ds = set(series[s].keys())
            common = ds if common is None else (common & ds)
        if not common:
            print(json.dumps({"error": "无可用的完整交易日数据"}))
            sys.exit(1)
        anchor = max(common)

    # 各代码 当日值 + 涨跌
    out = {}
    for s in SYMBOLS:
        cur, prev = val_and_prev(series[s], anchor)
        out[s] = (cur, prev)

    # 迪拜 M1-M3 价差
    t = series["PCAAT00"]
    v = series["PCAAV00"]
    common_tv = sorted(d for d in t if d in v)
    spread = {d: round(t[d] - v[d], 4) for d in common_tv}
    sp_cur, sp_prev = val_and_prev(spread, anchor)

    m = int(anchor[5:7])
    d = int(anchor[8:10])

    def line(sym):
        cur, prev = out[sym]
        if cur is None:
            return f"  （{sym} 当日无数据）"
        return f"{fmt_num(cur)}（{fmt_chg(cur, prev)}）"

    dubai = line("PCAAT00")
    dated = line("PCAAS00")
    ice_lon = line("AAYES00")
    ice_fut = line("ICLL001")
    wti_fut = line("ICIC001")
    if sp_cur is None:
        spread_line = "（无数据）"
    else:
        spread_line = f"{fmt_num(sp_cur)}（{fmt_chg(sp_cur, sp_prev)}）"

    text = (
        f"{m}月{d}日 \n"
        f"新加坡16:30\n"
        f"迪拜 {dubai}\n"
        f"迪拜M1-M3 {spread_line}\n"
        f"\n"
        f"伦敦16:30\n"
        f"Dated现货布伦特 {dated}\n"
        f"ICE布伦特 {ice_lon}\n"
        f"\n"
        f"期货收盘结算价\n"
        f"ICE布伦特 {ice_fut}\n"
        f"WTI  {wti_fut}\n"
    )
    print(text)


if __name__ == '__main__':
    main()
