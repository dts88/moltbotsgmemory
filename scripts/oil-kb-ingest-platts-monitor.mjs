#!/usr/bin/env node
import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const KB = path.join(ROOT, 'knowledge');
const CURATED = path.join(KB, 'data', 'curated');
const RAW = path.join(KB, 'data', 'raw', 'platts');
const DEFAULT_SOURCE = path.join(ROOT, '.cache', 'platts-monitor', 'latest.json');

const JOB_ARG = process.argv.find(arg => arg.startsWith('--job='));
const JOB_ID = JOB_ARG ? JOB_ARG.split('=')[1] : null;
const SOURCE_ARG = process.argv.find(arg => arg.startsWith('--source='));
const SOURCE_FILE = SOURCE_ARG ? path.resolve(ROOT, SOURCE_ARG.split('=')[1]) : DEFAULT_SOURCE;

function now() {
  return new Date().toISOString();
}

function ensureDir(dir) {
  mkdirSync(dir, { recursive: true });
}

function rel(file) {
  return path.relative(ROOT, file);
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
  return readFileSync(file, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line));
}

function upsertJsonl(file, records) {
  ensureDir(path.dirname(file));
  const map = new Map(readJsonl(file).map(record => [record.id || `${record.seriesId}:${record.date}`, record]));
  for (const record of records) map.set(record.id || `${record.seriesId}:${record.date}`, record);
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

function slug(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'item';
}

function sectionFor(text) {
  if (/^🔥/.test(text)) return 'top_news';
  if (/^📰/.test(text)) return 'market_stories';
  if (/^📊/.test(text)) return 'heards';
  return null;
}

function inferScope(text, section) {
  const lower = text.toLowerCase();
  const scope = {
    commodity: 'oil',
    geography: 'global',
    metric: section,
    unit: 'text'
  };
  if (lower.includes('dubai') || lower.includes('oman') || lower.includes('murban') || lower.includes('upper zakum') || lower.includes('al-shaheen')) {
    scope.commodity = 'crude';
    scope.geography = 'Middle East';
    scope.metric = 'moc_heard';
  } else if (lower.includes('lng') || lower.includes('jkm')) {
    scope.commodity = 'lng';
    scope.metric = 'market_story';
  } else if (lower.includes('canada') || lower.includes('korea') || lower.includes('cold lake')) {
    scope.commodity = 'crude';
    scope.geography = 'Asia';
    scope.metric = 'trade_flow';
  }
  return scope;
}

function extractNumberedItems(body) {
  const links = new Map();
  const linkBlock = body.split(/\n---\n/).at(-1) || '';
  for (const line of linkBlock.split('\n')) {
    const m = line.match(/^\[(\d+)\]\s+(https?:\/\/\S+)/);
    if (m) links.set(Number(m[1]), m[2]);
  }

  const items = [];
  const main = body.split(/\n---\n/)[0] || body;
  const lines = main.split('\n');
  let currentSection = null;
  let current = null;

  function flush() {
    if (!current) return;
    const itemText = current.lines.join('\n').trim();
    const title = itemText.split('。')[0].slice(0, 120);
    const url = links.get(current.number) || null;
    const sourceId = url?.match(/sourceId=([a-f0-9-]+)/i)?.[1] || null;
    items.push({ number: current.number, section: current.section, text: itemText, title, url, sourceId });
    current = null;
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const section = sectionFor(line);
    if (section) {
      flush();
      currentSection = section;
      continue;
    }
    const m = line.match(/^\[(\d+)\]\s+([\s\S]*)/);
    if (m) {
      flush();
      current = { number: Number(m[1]), section: currentSection || 'unknown', lines: [m[2].trim()] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  flush();
  return items;
}

function buildRecords(payload) {
  const generatedAt = payload.generatedAt || now();
  const date = payload.date || generatedAt.slice(0, 10);
  const docId = `platts-monitor-${date}-${generatedAt.replace(/[-:.TZ]/g, '').slice(0, 14)}`;
  const rawFile = path.join(RAW, `${docId}.json`);
  const items = extractNumberedItems(payload.body || '');
  const rawPayload = {
    id: docId,
    sourceFile: rel(SOURCE_FILE),
    ingestedAt: now(),
    payload,
    parsedItems: items
  };
  writeJson(rawFile, rawPayload);

  const document = {
    id: docId,
    kind: 'api_payload',
    title: `Platts monitor digest ${date}`,
    source: 'Platts News Insights monitor cache',
    institution: 'S&P Global Commodity Insights',
    publicationDate: date,
    coverageStart: date,
    coverageEnd: date,
    commodities: ['crude', 'lng', 'oil'],
    geographies: ['Asia', 'Middle East', 'Global'],
    topics: ['moc', 'heards', 'market_story', 'top_news', 'trade_flow'],
    timeScale: 'daily',
    storage: {
      path: rel(rawFile),
      mimeType: 'application/json'
    },
    provenance: {
      localCache: rel(SOURCE_FILE),
      generatedAt,
      ingestedBy: 'scripts/oil-kb-ingest-platts-monitor.mjs'
    }
  };

  const observations = items.map(item => {
    const scope = inferScope(item.text, item.section);
    return {
      id: `${docId}-obs-${String(item.number).padStart(2, '0')}-${slug(item.title)}`,
      statement: item.text,
      source: 'Platts News Insights',
      institution: 'S&P Global Commodity Insights',
      publicationDate: date,
      asOfDate: date,
      effectivePeriod: { start: date, end: date },
      scope,
      value: { text: item.text, sourceId: item.sourceId },
      methodology: 'Platts monitor digest item. Preserve sourceId and do not merge with exchange, Argus, or internal estimates without source labeling.',
      confidence: 0.9,
      timeScale: item.section === 'heards' ? 'intraday' : 'daily',
      provenance: {
        documentId: docId,
        section: item.section,
        quote: item.text,
        sourceId: item.sourceId,
        url: item.url
      }
    };
  });

  const keyClaims = items.slice(0, 8).map(item => `[${item.number}] ${item.title}`);
  const card = {
    id: `card-${docId}`,
    objectType: 'document',
    objectId: docId,
    summary: `Platts monitor digest for ${date}: ${items.length} parsed items across top news, market stories, and heards/MOC observations.`,
    keyClaims,
    conflictsWith: [],
    tags: ['Platts', 'MOC', 'heards', 'Dubai', 'crude', 'LNG', 'daily_digest'],
    freshness: {
      asOfDate: date,
      timeScale: 'daily',
      decayType: 'moc_heards',
      expiresAfter: null
    },
    drilldown: [
      { label: 'raw payload', target: rel(rawFile), cost: 'medium' },
      { label: 'observations', target: 'knowledge/data/curated/observations.jsonl', cost: 'low' }
    ]
  };

  return { docId, date, rawFile, document, observations, card, itemCount: items.length };
}

jobCmd(['job-step', JOB_ID, 'source_selection', 'completed', `Using Platts monitor cache ${rel(SOURCE_FILE)} as source to avoid duplicate API/token use.`]);
jobCmd(['job-step', JOB_ID, 'document_registration', 'in_progress', 'Parse latest Platts monitor cache and register raw payload.']);

const payload = readJson(SOURCE_FILE);
const built = buildRecords(payload);

const writes = {
  documents: upsertJsonl(path.join(CURATED, 'documents.jsonl'), [built.document]),
  cards: upsertJsonl(path.join(CURATED, 'cards.jsonl'), [built.card]),
  observations: upsertJsonl(path.join(CURATED, 'observations.jsonl'), built.observations)
};

jobCmd(['job-step', JOB_ID, 'document_registration', 'completed', `Registered ${built.docId} raw payload.`]);
jobCmd(['job-step', JOB_ID, 'card_generation', 'completed', `Wrote card-${built.docId}.`]);
jobCmd(['job-step', JOB_ID, 'structured_extraction', 'completed', `Wrote ${built.observations.length} Platts observations for ${built.date}.`]);
jobCmd(['job-step', JOB_ID, 'conflict_check', 'completed', 'Single-source Platts pilot; cross-source conflict checks start when Argus/price series are added.']);
jobCmd(['job-item', JOB_ID, 'completed', built.docId, `Imported Platts monitor digest for ${built.date}.`]);
jobCmd(['job-artifact', JOB_ID, rel(built.rawFile)]);
jobCmd(['job-artifact', JOB_ID, 'knowledge/data/curated/documents.jsonl']);
jobCmd(['job-artifact', JOB_ID, 'knowledge/data/curated/cards.jsonl']);
jobCmd(['job-artifact', JOB_ID, 'knowledge/data/curated/observations.jsonl']);

console.log(JSON.stringify({
  ok: true,
  docId: built.docId,
  date: built.date,
  itemCount: built.itemCount,
  writes,
  rawPath: rel(built.rawFile)
}, null, 2));
