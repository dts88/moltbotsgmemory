#!/usr/bin/env node
/**
 * stock.mjs - 股票查询工具
 * 
 * 数据源:
 *   A股: 新浪财经(实时/分时) + 东方财富(历史K线/搜索)
 *   美股: Yahoo Finance(全部)
 *   搜索: 腾讯(A股) + Yahoo(美股)
 * 
 * 用法:
 *   node scripts/stock.mjs quote 600519              # A股实时
 *   node scripts/stock.mjs quote AAPL --market=us    # 美股实时
 *   node scripts/stock.mjs quote 600519,000001       # 批量查询
 *   node scripts/stock.mjs history 600519            # A股历史K线
 *   node scripts/stock.mjs history AAPL --market=us  # 美股历史
 *   node scripts/stock.mjs history 600519 --days=30  # 指定天数
 *   node scripts/stock.mjs history 600519 --klt=102  # 周K线
 *   node scripts/stock.mjs intraday 600519           # A股分时
 *   node scripts/stock.mjs intraday AAPL --market=us # 美股分时
 *   node scripts/stock.mjs intraday 600519 --scale=5 # 5分钟K
 *   node scripts/stock.mjs search 茅台               # 搜索A股
 *   node scripts/stock.mjs search apple --market=us  # 搜索美股
 *   node scripts/stock.mjs search 茅台 --market=all  # 搜索全部
 */

import https from 'https';
import http from 'http';
import { Buffer } from 'buffer';
import { trackUsage } from './usage-tracker.mjs';

// ============================================================
// Helpers
// ============================================================

function fetch(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      ...opts.headers,
    };
    const req = mod.get(url, { headers, timeout: 10000 }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        resolve({ status: res.statusCode, buf, headers: res.headers });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function decodeGBK(buf) {
  const td = new TextDecoder('gbk');
  return td.decode(buf);
}

function parseArgs(argv) {
  const args = { _: [] };
  for (const a of argv) {
    if (a.startsWith('--')) {
      const [k, ...v] = a.slice(2).split('=');
      args[k] = v.length ? v.join('=') : true;
    } else {
      args._.push(a);
    }
  }
  return args;
}

function fmtNum(n, decimals = 2) {
  if (n == null || isNaN(n)) return '-';
  return Number(n).toFixed(decimals);
}

function fmtPct(n) {
  if (n == null || isNaN(n)) return '-';
  const v = Number(n);
  const sign = v > 0 ? '+' : '';
  return `${sign}${v.toFixed(2)}%`;
}

function fmtVolume(v) {
  if (v == null || isNaN(v)) return '-';
  v = Number(v);
  if (v >= 1e8) return (v / 1e8).toFixed(2) + '亿';
  if (v >= 1e4) return (v / 1e4).toFixed(1) + '万';
  return v.toString();
}

function fmtAmount(a) {
  if (a == null || isNaN(a)) return '-';
  a = Number(a);
  if (a >= 1e8) return (a / 1e8).toFixed(2) + '亿';
  if (a >= 1e4) return (a / 1e4).toFixed(1) + '万';
  return a.toFixed(0);
}

// ============================================================
// A股前缀
// ============================================================

function getSinaPrefix(code) {
  if (code.startsWith('6')) return 'sh';
  if (code.startsWith('0') || code.startsWith('3')) return 'sz';
  if (code.startsWith('4') || code.startsWith('8') || code.startsWith('9')) return 'bj';
  return 'sh';
}

function getEastmoneySecid(code) {
  if (code.startsWith('6')) return `1.${code}`;
  return `0.${code}`;
}

function detectMarket(code) {
  // If it's all digits and 6 chars, it's A-share
  if (/^\d{6}$/.test(code)) return 'cn';
  // If it contains CJK characters, it's likely A-share search
  if (/[\u4e00-\u9fff]/.test(code)) return 'cn';
  // Otherwise assume US
  return 'us';
}

// ============================================================
// 1. 实时行情
// ============================================================

async function quoteCN(codes) {
  const symbols = codes.map(c => `${getSinaPrefix(c)}${c}`).join(',');
  const url = `https://hq.sinajs.cn/list=${symbols}`;
  const { buf } = await fetch(url, {
    headers: { 'Referer': 'https://finance.sina.com.cn' },
  });
  const text = decodeGBK(buf);
  const results = [];

  for (const line of text.split('\n')) {
    const m = line.match(/hq_str_(\w+)="(.*)"/);
    if (!m || !m[2]) continue;
    const symbol = m[1];
    const code = symbol.replace(/^(sh|sz|bj)/, '');
    const f = m[2].split(',');
    if (f.length < 32) continue;

    const price = parseFloat(f[3]);
    const prevClose = parseFloat(f[2]);
    const change = price - prevClose;
    const changePct = prevClose ? (change / prevClose) * 100 : 0;

    results.push({
      code,
      name: f[0],
      market: 'cn',
      price,
      open: parseFloat(f[1]),
      prevClose,
      high: parseFloat(f[4]),
      low: parseFloat(f[5]),
      bid1: parseFloat(f[6]),
      ask1: parseFloat(f[7]),
      volume: parseInt(f[8]),     // shares
      amount: parseFloat(f[9]),   // CNY
      change,
      changePct,
      date: f[30],
      time: f[31],
    });
  }
  return results;
}

async function quoteUS(codes) {
  const results = [];
  for (const symbol of codes) {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
    try {
      const { buf } = await fetch(url);
      const json = JSON.parse(buf.toString());
      const meta = json.chart?.result?.[0]?.meta;
      if (!meta) continue;

      const price = meta.regularMarketPrice;
      const prevClose = meta.chartPreviousClose;
      const change = price - prevClose;
      const changePct = prevClose ? (change / prevClose) * 100 : 0;

      results.push({
        code: meta.symbol,
        name: meta.longName || meta.shortName || symbol,
        market: 'us',
        price,
        open: meta.regularMarketDayHigh != null ? undefined : undefined, // meta doesn't always have open
        prevClose,
        high: meta.regularMarketDayHigh,
        low: meta.regularMarketDayLow,
        volume: meta.regularMarketVolume,
        change,
        changePct,
        currency: meta.currency,
        exchange: meta.fullExchangeName,
        marketState: meta.marketState,
        fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh,
        fiftyTwoWeekLow: meta.fiftyTwoWeekLow,
        timezone: meta.timezone,
      });
    } catch (e) {
      console.error(`Failed to fetch ${symbol}: ${e.message}`);
    }
  }
  return results;
}

function printQuote(q) {
  const arrow = q.change > 0 ? '🔴' : q.change < 0 ? '🟢' : '⚪';
  const sign = q.change > 0 ? '+' : '';
  console.log(`${arrow} ${q.name} (${q.code})`);
  console.log(`  价格: ${fmtNum(q.price)} ${q.currency || 'CNY'}  ${sign}${fmtNum(q.change)} (${fmtPct(q.changePct).replace(/^[+-]/, sign)})`);
  if (q.high != null) console.log(`  高/低: ${fmtNum(q.high)} / ${fmtNum(q.low)}`);
  if (q.volume != null) {
    const volLabel = q.market === 'cn' ? `${fmtVolume(q.volume)}股` : fmtVolume(q.volume);
    console.log(`  成交: ${volLabel}` + (q.amount != null ? `  金额: ${fmtAmount(q.amount)}` : ''));
  }
  if (q.bid1 != null) console.log(`  买一/卖一: ${fmtNum(q.bid1)} / ${fmtNum(q.ask1)}`);
  if (q.exchange) console.log(`  交易所: ${q.exchange}  状态: ${q.marketState}`);
  if (q.fiftyTwoWeekHigh != null) console.log(`  52周高/低: ${fmtNum(q.fiftyTwoWeekHigh)} / ${fmtNum(q.fiftyTwoWeekLow)}`);
  if (q.date) console.log(`  时间: ${q.date} ${q.time}`);
  console.log();
}

// ============================================================
// 2. 历史K线
// ============================================================

async function historyCN(code, days = 120, klt = 101) {
  const secid = getEastmoneySecid(code);
  const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secid}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61&klt=${klt}&fqt=1&end=20500101&lmt=${days}`;
  const { buf } = await fetch(url);
  const json = JSON.parse(buf.toString());
  if (!json.data?.klines) throw new Error('No data returned');

  return {
    code: json.data.code,
    name: json.data.name,
    market: 'cn',
    klines: json.data.klines.map(line => {
      const f = line.split(',');
      return {
        date: f[0],
        open: parseFloat(f[1]),
        close: parseFloat(f[2]),
        high: parseFloat(f[3]),
        low: parseFloat(f[4]),
        volume: parseInt(f[5]),    // 手
        amount: parseFloat(f[6]),
        amplitude: parseFloat(f[7]),
        changePct: parseFloat(f[8]),
        change: parseFloat(f[9]),
        turnover: parseFloat(f[10]),
      };
    }),
  };
}

async function historyUS(symbol, days = 120) {
  // Map days to Yahoo range
  let range = '6mo';
  if (days <= 5) range = '5d';
  else if (days <= 30) range = '1mo';
  else if (days <= 90) range = '3mo';
  else if (days <= 180) range = '6mo';
  else if (days <= 365) range = '1y';
  else if (days <= 730) range = '2y';
  else range = '5y';

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=${range}`;
  const { buf } = await fetch(url);
  const json = JSON.parse(buf.toString());
  const result = json.chart?.result?.[0];
  if (!result) throw new Error('No data returned');

  const { timestamp, indicators } = result;
  const q = indicators.quote[0];
  const adj = indicators.adjclose?.[0]?.adjclose;

  const klines = [];
  for (let i = 0; i < timestamp.length; i++) {
    if (q.close[i] == null) continue;
    const d = new Date(timestamp[i] * 1000);
    klines.push({
      date: d.toISOString().slice(0, 10),
      open: q.open[i],
      close: q.close[i],
      high: q.high[i],
      low: q.low[i],
      volume: q.volume[i],
      adjClose: adj?.[i],
    });
  }

  // Trim to requested days
  const trimmed = klines.slice(-days);

  return {
    code: result.meta.symbol,
    name: result.meta.longName || result.meta.shortName || symbol,
    market: 'us',
    currency: result.meta.currency,
    klines: trimmed,
  };
}

function printHistory(data, limit = 20) {
  console.log(`📊 ${data.name} (${data.code}) - ${data.market === 'cn' ? 'A股' : '美股'} K线`);
  if (data.currency) console.log(`   货币: ${data.currency}`);
  console.log(`   共 ${data.klines.length} 条记录\n`);

  const show = data.klines.slice(-limit);
  const isA = data.market === 'cn';

  console.log('日期         开盘     收盘     最高     最低     ' + (isA ? '涨跌%   换手%   成交额' : '成交量'));
  console.log('-'.repeat(isA ? 80 : 65));

  for (const k of show) {
    const parts = [
      k.date.padEnd(12),
      fmtNum(k.open).padStart(8),
      fmtNum(k.close).padStart(8),
      fmtNum(k.high).padStart(8),
      fmtNum(k.low).padStart(8),
    ];
    if (isA) {
      parts.push(fmtPct(k.changePct).padStart(8));
      parts.push((fmtNum(k.turnover) + '%').padStart(8));
      parts.push(fmtAmount(k.amount).padStart(10));
    } else {
      parts.push(fmtVolume(k.volume).padStart(10));
    }
    console.log(parts.join(' '));
  }

  if (data.klines.length > limit) {
    console.log(`\n... 仅显示最近 ${limit} 条，共 ${data.klines.length} 条`);
  }
}

// ============================================================
// 3. 分时数据
// ============================================================

async function intradayCN(code, scale = 1, count = 250) {
  const symbol = `${getSinaPrefix(code)}${code}`;
  const url = `https://quotes.sina.cn/cn/api/jsonp.php/var%20data=/CN_MarketDataService.getKLineData?symbol=${symbol}&scale=${scale}&ma=no&datalen=${count}`;
  const { buf } = await fetch(url, {
    headers: { 'Referer': 'https://finance.sina.com.cn' },
  });
  const text = buf.toString();
  // Extract JSON from JSONP: var data=([ ... ]);
  const m = text.match(/\((\[[\s\S]*?\])\)/);
  if (!m) throw new Error('Failed to parse JSONP response');
  const data = JSON.parse(m[1]);
  return { code, market: 'cn', scale, data };
}

async function intradayUS(symbol, interval = '5m') {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=1d`;
  const { buf } = await fetch(url);
  const json = JSON.parse(buf.toString());
  const result = json.chart?.result?.[0];
  if (!result) throw new Error('No data returned');

  const { timestamp, indicators } = result;
  const q = indicators.quote[0];
  const data = [];
  for (let i = 0; i < (timestamp?.length || 0); i++) {
    if (q.close[i] == null) continue;
    const d = new Date(timestamp[i] * 1000);
    data.push({
      time: d.toISOString().replace('T', ' ').slice(0, 19),
      open: q.open[i],
      high: q.high[i],
      low: q.low[i],
      close: q.close[i],
      volume: q.volume[i],
    });
  }
  return {
    code: result.meta.symbol,
    name: result.meta.longName || result.meta.shortName,
    market: 'us',
    interval,
    data,
  };
}

function printIntraday(result, limit = 30) {
  console.log(`📈 ${result.name || result.code} 分时数据 (${result.scale ? result.scale + '分钟' : result.interval})`);
  console.log(`   共 ${result.data.length} 条\n`);

  const show = result.data.slice(-limit);
  console.log('时间                 开盘     最高     最低     收盘     成交量');
  console.log('-'.repeat(70));

  for (const d of show) {
    const time = (d.day || d.time).padEnd(20);
    console.log(`${time} ${fmtNum(parseFloat(d.open)).padStart(8)} ${fmtNum(parseFloat(d.high)).padStart(8)} ${fmtNum(parseFloat(d.low)).padStart(8)} ${fmtNum(parseFloat(d.close)).padStart(8)} ${fmtVolume(parseInt(d.volume)).padStart(10)}`);
  }

  if (result.data.length > limit) {
    console.log(`\n... 仅显示最近 ${limit} 条，共 ${result.data.length} 条`);
  }
}

// ============================================================
// 4. 搜索
// ============================================================

async function searchCN(keyword) {
  const url = `https://smartbox.gtimg.cn/s3/?v=2&q=${encodeURIComponent(keyword)}&t=all`;
  const { buf } = await fetch(url);
  let text = buf.toString();
  // Decode \uXXXX sequences
  text = text.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  // Format: v_hint="xx~code~name~pinyin~type^..."
  const m = text.match(/"(.*)"/);
  if (!m || !m[1]) return [];

  const results = [];
  for (const item of m[1].split('^')) {
    const f = item.split('~');
    if (f.length < 4) continue;
    const market = f[0]; // sh, sz, hk, us
    if (!['sh', 'sz', 'bj'].includes(market)) continue;
    results.push({
      code: f[1],
      name: f[2],
      pinyin: f[3],
      market,
      type: f[4] || '',
    });
  }
  return results;
}

async function searchUS(keyword, count = 10) {
  const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(keyword)}&quotesCount=${count}&newsCount=0&listsCount=0`;
  const { buf } = await fetch(url);
  const json = JSON.parse(buf.toString());
  return (json.quotes || [])
    .filter(q => q.quoteType === 'EQUITY')
    .map(q => ({
      code: q.symbol,
      name: q.longname || q.shortname,
      exchange: q.exchDisp,
      sector: q.sector,
      industry: q.industry,
    }));
}

function printSearch(results, market) {
  if (!results.length) {
    console.log('未找到结果');
    return;
  }
  console.log(`🔍 搜索结果 (${market === 'us' ? '美股' : 'A股'}):\n`);
  for (const r of results) {
    if (market === 'us') {
      console.log(`  ${r.code.padEnd(8)} ${r.name}  [${r.exchange}]${r.sector ? '  ' + r.sector : ''}`);
    } else {
      console.log(`  ${r.market}${r.code}  ${r.name}  (${r.pinyin})`);
    }
  }
}

// ============================================================
// JSON output
// ============================================================

function outputJSON(data) {
  console.log(JSON.stringify(data, null, 2));
}

// ============================================================
// Main
// ============================================================

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const TRACK_USER = typeof args.user === 'string' ? args.user : 'system';
  const command = args._[0];
  const target = args._[1];
  const market = args.market || (target ? detectMarket(target.split(',')[0]) : 'cn');
  const json = args.json || false;

  if (!command) {
    console.log(`用法:
  node scripts/stock.mjs quote <代码>              # 实时行情
  node scripts/stock.mjs quote <代码1>,<代码2>      # 批量行情
  node scripts/stock.mjs history <代码>             # 历史K线
  node scripts/stock.mjs intraday <代码>            # 分时数据
  node scripts/stock.mjs search <关键词>            # 搜索股票

选项:
  --market=cn|us      市场 (自动检测)
  --days=120          历史天数
  --klt=101           K线类型: 101日/102周/103月
  --scale=1           分时周期: 1/5/15/30/60 分钟
  --interval=5m       美股分时周期: 1m/5m/15m
  --limit=20          显示条数
  --json              JSON 输出`);
    process.exit(0);
  }

  try {
    switch (command) {
      case 'quote':
      case 'q': {
        if (!target) throw new Error('请指定股票代码');
        const codes = target.split(',');
        const results = market === 'us' ? await quoteUS(codes) : await quoteCN(codes);
        if (results.length) { try { trackUsage(TRACK_USER, 'stock', { action: 'quote', market }); } catch {} }
        if (json) { outputJSON(results); break; }
        if (!results.length) { console.log('未获取到数据'); break; }
        for (const q of results) printQuote(q);
        break;
      }

      case 'history':
      case 'h': {
        if (!target) throw new Error('请指定股票代码');
        const days = parseInt(args.days) || 120;
        const klt = parseInt(args.klt) || 101;
        const limit = parseInt(args.limit) || 20;
        const data = market === 'us'
          ? await historyUS(target, days)
          : await historyCN(target, days, klt);
        try { trackUsage(TRACK_USER, 'stock', { action: 'history', market }); } catch {}
        if (json) { outputJSON(data); break; }
        printHistory(data, limit);
        break;
      }

      case 'intraday':
      case 'i': {
        if (!target) throw new Error('请指定股票代码');
        const limit = parseInt(args.limit) || 30;
        let result;
        if (market === 'us') {
          const interval = args.interval || '5m';
          result = await intradayUS(target, interval);
        } else {
          const scale = parseInt(args.scale) || 1;
          const count = parseInt(args.count) || 250;
          result = await intradayCN(target, scale, count);
        }
        try { trackUsage(TRACK_USER, 'stock', { action: 'intraday', market }); } catch {}
        if (json) { outputJSON(result); break; }
        printIntraday(result, limit);
        break;
      }

      case 'search':
      case 's': {
        if (!target) throw new Error('请指定搜索关键词');
        if (market === 'all') {
          const [cn, us] = await Promise.all([searchCN(target), searchUS(target)]);
          if (cn.length || us.length) { try { trackUsage(TRACK_USER, 'stock', { action: 'search', market }); } catch {} }
          if (json) { outputJSON({ cn, us }); break; }
          if (cn.length) printSearch(cn, 'cn');
          if (us.length) { console.log(); printSearch(us, 'us'); }
          if (!cn.length && !us.length) console.log('未找到结果');
        } else if (market === 'us') {
          const results = await searchUS(target);
          if (results.length) { try { trackUsage(TRACK_USER, 'stock', { action: 'search', market }); } catch {} }
          if (json) { outputJSON(results); break; }
          printSearch(results, 'us');
        } else {
          const results = await searchCN(target);
          if (results.length) { try { trackUsage(TRACK_USER, 'stock', { action: 'search', market }); } catch {} }
          if (json) { outputJSON(results); break; }
          printSearch(results, 'cn');
        }
        break;
      }

      default:
        console.error(`未知命令: ${command}`);
        process.exit(1);
    }
  } catch (e) {
    console.error(`错误: ${e.message}`);
    process.exit(1);
  }
}

main();
