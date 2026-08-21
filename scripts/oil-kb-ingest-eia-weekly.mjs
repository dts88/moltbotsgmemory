#!/usr/bin/env node
import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const KB = path.join(ROOT, 'knowledge');
const CURATED = path.join(KB, 'data', 'curated');
const RAW = path.join(KB, 'data', 'raw', 'eia');

const JOB_ARG = process.argv.find(arg => arg.startsWith('--job='));
const JOB_ID = JOB_ARG ? JOB_ARG.split('=')[1] : null;

function now() {
  return new Date().toISOString();
}

function rel(file) {
  return path.relative(ROOT, file);
}

function ensureDir(dir) {
  mkdirSync(dir, { recursive: true });
}

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

function writeJson(file, data) {
  ensureDir(path.dirname(file));
  writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}

function readJsonl(file) {
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line));
}

function upsertJsonl(file, records) {
  ensureDir(path.dirname(file));
  const map = new Map(readJsonl(file).map(record => [record.id || `${record.seriesId}:${record.date}`, record]));
  for (const record of records) {
    map.set(record.id || `${record.seriesId}:${record.date}`, record);
  }
  const sorted = [...map.values()].sort((a, b) => {
    const ak = a.id || `${a.seriesId}:${a.date}`;
    const bk = b.id || `${b.seriesId}:${b.date}`;
    return ak.localeCompare(bk);
  });
  writeFileSync(file, sorted.map(record => JSON.stringify(record)).join('\n') + '\n');
  return records.length;
}

function jobCmd(args) {
  if (!JOB_ID) return;
  execFileSync('node', [path.join(ROOT, 'scripts', 'oil-kb.mjs'), ...args], {
    cwd: ROOT,
    stdio: 'ignore'
  });
}

function formatChange(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'n/a';
  return value >= 0 ? `+${value}` : String(value);
}

const SERIES_META = {
  crudeStocksExSPR: {
    metric: 'ending_stocks_excluding_spr',
    commodity: 'crude',
    unit: 'thousand_barrels',
    timeScale: 'weekly',
    decayType: 'weekly_inventory'
  },
  crudeStocksSPR: {
    metric: 'spr_stocks',
    commodity: 'crude',
    unit: 'thousand_barrels',
    timeScale: 'weekly',
    decayType: 'weekly_inventory'
  },
  gasolineStocks: {
    metric: 'ending_stocks',
    commodity: 'gasoline',
    unit: 'thousand_barrels',
    timeScale: 'weekly',
    decayType: 'weekly_inventory'
  },
  distillateStocks: {
    metric: 'ending_stocks',
    commodity: 'distillates',
    unit: 'thousand_barrels',
    timeScale: 'weekly',
    decayType: 'weekly_inventory'
  },
  cushingStocks: {
    metric: 'cushing_crude_stocks',
    commodity: 'crude',
    geography: 'US-Cushing',
    unit: 'thousand_barrels',
    timeScale: 'weekly',
    decayType: 'weekly_inventory'
  },
  jetFuelStocks: {
    metric: 'ending_stocks',
    commodity: 'jet_fuel',
    unit: 'thousand_barrels',
    timeScale: 'weekly',
    decayType: 'weekly_inventory'
  },
  propaneStocks: {
    metric: 'ending_stocks',
    commodity: 'propane',
    unit: 'thousand_barrels',
    timeScale: 'weekly',
    decayType: 'weekly_inventory'
  },
  crudeProduction: {
    metric: 'field_production',
    commodity: 'crude',
    unit: 'thousand_barrels_per_day',
    timeScale: 'weekly',
    decayType: 'weekly_inventory'
  },
  refineryInputs: {
    metric: 'refinery_inputs',
    commodity: 'crude',
    unit: 'thousand_barrels_per_day',
    timeScale: 'weekly',
    decayType: 'weekly_inventory'
  },
  refineryUtilization: {
    metric: 'refinery_utilization',
    commodity: 'refining',
    unit: 'percent',
    timeScale: 'weekly',
    decayType: 'weekly_inventory'
  },
  crudeImports: {
    metric: 'imports',
    commodity: 'crude',
    unit: 'thousand_barrels_per_day',
    timeScale: 'weekly',
    decayType: 'weekly_inventory'
  },
  crudeExports: {
    metric: 'exports',
    commodity: 'crude',
    unit: 'thousand_barrels_per_day',
    timeScale: 'weekly',
    decayType: 'weekly_inventory'
  },
  crudeNetImports: {
    metric: 'net_imports',
    commodity: 'crude',
    unit: 'thousand_barrels_per_day',
    timeScale: 'weekly',
    decayType: 'weekly_inventory'
  },
  gasolineDemand: {
    metric: 'product_supplied',
    commodity: 'gasoline',
    unit: 'thousand_barrels_per_day',
    timeScale: 'weekly',
    decayType: 'weekly_inventory'
  },
  distillateDemand: {
    metric: 'product_supplied',
    commodity: 'distillates',
    unit: 'thousand_barrels_per_day',
    timeScale: 'weekly',
    decayType: 'weekly_inventory'
  },
  jetFuelDemand: {
    metric: 'product_supplied',
    commodity: 'jet_fuel',
    unit: 'thousand_barrels_per_day',
    timeScale: 'weekly',
    decayType: 'weekly_inventory'
  }
};

function buildRecords(results) {
  const period = results.crudeStocksExSPR?.period || Object.values(results)[0]?.period;
  if (!period) throw new Error('No EIA period found in weekly report output');

  const docId = `eia-wpsr-weekly-${period}`;
  const generatedAt = now();
  const rawFile = path.join(RAW, `${docId}.json`);
  const sourceUrl = 'https://api.eia.gov/v2/';

  const rawPayload = {
    id: docId,
    generatedAt,
    source: 'EIA Weekly Petroleum Status Report via EIA API v2',
    period,
    results
  };
  writeJson(rawFile, rawPayload);

  const document = {
    id: docId,
    kind: 'api_payload',
    title: `EIA Weekly Petroleum Status Report data for week ending ${period}`,
    source: 'EIA Weekly Petroleum Status Report',
    institution: 'EIA',
    publicationDate: generatedAt.slice(0, 10),
    coverageStart: period,
    coverageEnd: period,
    commodities: ['crude', 'gasoline', 'distillates', 'jet_fuel', 'propane', 'refining'],
    geographies: ['US'],
    topics: ['inventory', 'supply', 'demand', 'trade', 'refining'],
    timeScale: 'weekly',
    storage: {
      path: rel(rawFile),
      mimeType: 'application/json'
    },
    provenance: {
      sourceUrl,
      localExtractor: 'scripts/eia-weekly-report.mjs json',
      ingestedBy: 'scripts/oil-kb-ingest-eia-weekly.mjs'
    }
  };

  const observations = [];
  const points = [];
  const keyClaims = [];

  for (const [key, result] of Object.entries(results)) {
    const meta = SERIES_META[key] || {};
    const geography = meta.geography || 'US';
    const seriesId = `eia.weekly.${geography.toLowerCase()}.${meta.commodity || key}.${meta.metric || key}`.replace(/[^a-z0-9._-]+/g, '_');
    const value = Number(result.value);
    const change = result.change === undefined ? null : Number(result.change);
    const unit = meta.unit || (result.isPercent ? 'percent' : 'unknown');
    const metric = meta.metric || key;
    const commodity = meta.commodity || key;
    const name = result.name || key;

    points.push({
      seriesId,
      date: result.period || period,
      value,
      unit,
      source: 'EIA Weekly Petroleum Status Report',
      institution: 'EIA',
      releaseDate: generatedAt.slice(0, 10),
      frequency: 'weekly',
      commodity,
      geography,
      metric,
      methodology: 'EIA weekly petroleum data; source-specific methodology and revisions preserved as EIA series.',
      revision: { isRevision: false, previousValue: null, revisionDate: null },
      provenance: { documentId: docId, rawPath: rel(rawFile), field: key }
    });

    observations.push({
      id: `${docId}-obs-${key}`,
      statement: `EIA reported ${name} at ${value} ${unit} for week ending ${result.period || period}, with week-on-week change ${formatChange(change)}.`,
      source: 'EIA Weekly Petroleum Status Report',
      institution: 'EIA',
      publicationDate: generatedAt.slice(0, 10),
      asOfDate: result.period || period,
      effectivePeriod: { start: result.period || period, end: result.period || period },
      scope: { commodity, geography, metric, unit },
      value: { level: value, weeklyChange: change },
      methodology: 'EIA weekly petroleum data; do not merge with API/IEA/OPEC/Platts numbers without preserving source and methodology.',
      confidence: 0.95,
      timeScale: 'weekly',
      provenance: { documentId: docId, section: key, quote: '' }
    });

    if (['crudeStocksExSPR', 'gasolineStocks', 'distillateStocks', 'crudeProduction', 'refineryUtilization'].includes(key)) {
      keyClaims.push(`${name}: ${value} ${unit} (${formatChange(change)} WoW)`);
    }
  }

  const card = {
    id: `card-${docId}`,
    objectType: 'document',
    objectId: docId,
    summary: `EIA weekly petroleum data for week ending ${period}, covering US crude/product inventories, production, refinery activity, trade, and demand indicators.`,
    keyClaims,
    conflictsWith: [],
    tags: ['EIA', 'US', 'weekly_inventory', 'crude', 'products', 'refining'],
    freshness: {
      asOfDate: period,
      timeScale: 'weekly',
      decayType: 'weekly_inventory',
      expiresAfter: null
    },
    drilldown: [
      { label: 'raw payload', target: rel(rawFile), cost: 'medium' },
      { label: 'observations', target: 'knowledge/data/curated/observations.jsonl', cost: 'low' },
      { label: 'timeseries', target: 'knowledge/data/curated/timeseries-points.jsonl', cost: 'low' }
    ]
  };

  return { docId, period, rawFile, document, observations, points, card };
}

jobCmd(['job-step', JOB_ID, 'document_registration', 'in_progress', 'Fetch EIA weekly report JSON and register raw payload.']);

const stdout = execFileSync('node', [path.join(ROOT, 'scripts', 'eia-weekly-report.mjs'), 'json'], {
  cwd: ROOT,
  encoding: 'utf8',
  maxBuffer: 10 * 1024 * 1024
});
const results = JSON.parse(stdout);
const built = buildRecords(results);

const writes = {
  documents: upsertJsonl(path.join(CURATED, 'documents.jsonl'), [built.document]),
  cards: upsertJsonl(path.join(CURATED, 'cards.jsonl'), [built.card]),
  observations: upsertJsonl(path.join(CURATED, 'observations.jsonl'), built.observations),
  timeseries: upsertJsonl(path.join(CURATED, 'timeseries-points.jsonl'), built.points)
};

jobCmd(['job-step', JOB_ID, 'document_registration', 'completed', `Registered ${built.docId} raw payload.`]);
jobCmd(['job-step', JOB_ID, 'card_generation', 'completed', `Wrote card-${built.docId}.`]);
jobCmd(['job-item', JOB_ID, 'completed', built.docId, `Imported EIA weekly data for ${built.period}.`]);
jobCmd(['job-artifact', JOB_ID, rel(built.rawFile)]);
jobCmd(['job-artifact', JOB_ID, 'knowledge/data/curated/documents.jsonl']);
jobCmd(['job-artifact', JOB_ID, 'knowledge/data/curated/cards.jsonl']);
jobCmd(['job-artifact', JOB_ID, 'knowledge/data/curated/observations.jsonl']);
jobCmd(['job-artifact', JOB_ID, 'knowledge/data/curated/timeseries-points.jsonl']);
jobCmd(['job-step', JOB_ID, 'structured_extraction', 'completed', `Wrote ${built.observations.length} observations and ${built.points.length} timeseries points for ${built.period}.`]);
jobCmd(['job-step', JOB_ID, 'conflict_check', 'completed', 'Single-source pilot; no cross-source conflict to resolve yet.']);

console.log(JSON.stringify({
  ok: true,
  docId: built.docId,
  period: built.period,
  writes,
  rawPath: rel(built.rawFile)
}, null, 2));
