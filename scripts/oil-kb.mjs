#!/usr/bin/env node
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const KB = path.join(ROOT, 'knowledge');
const POLICY = path.join(KB, 'config', 'retrieval-policy.json');
const SCHEMA_DIR = path.join(KB, 'schema', 'v1');
const DATA_DIRS = [
  path.join(KB, 'data', 'curated'),
  path.join(KB, 'data', 'raw'),
  path.join(KB, 'data', 'runtime'),
  path.join(KB, 'data', 'runtime', 'jobs')
];

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

function readJsonl(file) {
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line));
}

function writeJson(file, data) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}

function now() {
  return new Date().toISOString();
}

function slug(input) {
  return String(input || 'job')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'job';
}

function jobDir(id) {
  return path.join(KB, 'data', 'runtime', 'jobs', id);
}

function jobFile(id) {
  return path.join(jobDir(id), 'job.json');
}

function readJob(id) {
  const file = jobFile(id);
  if (!existsSync(file)) throw new Error(`Job not found: ${id}`);
  return readJson(file);
}

function saveJob(job) {
  job.updatedAt = now();
  writeJson(jobFile(job.id), job);
  return job;
}

function status() {
  const policy = readJson(POLICY);
  const schemas = readdirSync(SCHEMA_DIR).filter(name => name.endsWith('.schema.json')).sort();
  const dirs = DATA_DIRS.map(dir => ({ dir: path.relative(ROOT, dir), exists: existsSync(dir) }));
  return {
    ok: true,
    knowledgeRoot: path.relative(ROOT, KB),
    defaultMode: policy.defaultMode,
    modes: Object.keys(policy.modes),
    schemas,
    dataDirs: dirs
  };
}

function init() {
  for (const dir of DATA_DIRS) mkdirSync(dir, { recursive: true });
  return status();
}

function policy(mode) {
  const p = readJson(POLICY);
  if (!mode) return p;
  if (!p.modes[mode]) {
    throw new Error(`Unknown mode: ${mode}. Expected one of ${Object.keys(p.modes).join(', ')}`);
  }
  return { mode, ...p.modes[mode] };
}

function validateJsonFiles() {
  const files = [POLICY, ...readdirSync(SCHEMA_DIR).filter(name => name.endsWith('.json')).map(name => path.join(SCHEMA_DIR, name))];
  for (const file of files) readJson(file);
  const curated = path.join(KB, 'data', 'curated');
  const jsonlFiles = existsSync(curated)
    ? readdirSync(curated).filter(name => name.endsWith('.jsonl')).map(name => path.join(curated, name))
    : [];
  const jsonl = [];
  for (const file of jsonlFiles) {
    const lines = readFileSync(file, 'utf8').split('\n').filter(Boolean);
    for (const [idx, line] of lines.entries()) {
      try {
        JSON.parse(line);
      } catch (err) {
        throw new Error(`Invalid JSONL ${path.relative(ROOT, file)}:${idx + 1}: ${err.message}`);
      }
    }
    jsonl.push({ file: path.relative(ROOT, file), lines: lines.length });
  }
  return { ok: true, checked: files.map(file => path.relative(ROOT, file)), jsonl };
}

function jobCreate(type, nameParts) {
  const allowed = new Set(['ingestion', 'backfill', 'query', 'audit', 'playbook_update', 'maintenance']);
  if (!allowed.has(type)) throw new Error(`Unknown job type: ${type}`);
  const name = nameParts.join(' ').trim();
  if (!name) throw new Error('Missing job name');
  const id = `${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${slug(name)}`;
  const t = now();
  const job = {
    id,
    type,
    name,
    status: 'pending',
    createdAt: t,
    updatedAt: t,
    cursor: {},
    phases: [],
    items: { completed: [], failed: [], skipped: [] },
    artifacts: [],
    notes: [{ at: t, text: 'Job created. Update phase before starting work.' }],
    nextAction: 'Set the first phase with job-step <job-id> <phase> in_progress.'
  };
  writeJson(jobFile(id), job);
  return job;
}

function jobList() {
  const dir = path.join(KB, 'data', 'runtime', 'jobs');
  if (!existsSync(dir)) return { jobs: [] };
  const jobs = readdirSync(dir)
    .map(id => {
      const file = jobFile(id);
      if (!existsSync(file)) return null;
      const job = readJson(file);
      return {
        id: job.id,
        type: job.type,
        name: job.name,
        status: job.status,
        updatedAt: job.updatedAt,
        nextAction: job.nextAction
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return { jobs };
}

function jobStatus(id) {
  const job = readJob(id);
  return {
    ...job,
    summary: {
      completed: job.items.completed.length,
      failed: job.items.failed.length,
      skipped: job.items.skipped.length,
      artifacts: job.artifacts.length
    }
  };
}

function jobStep(id, phase, phaseStatus, note = '') {
  if (!phase || !phaseStatus) throw new Error('Usage: job-step <job-id> <phase> <status> [note]');
  const job = readJob(id);
  const t = now();
  const existing = job.phases.find(p => p.name === phase);
  if (existing) {
    existing.status = phaseStatus;
    existing.note = note || existing.note || '';
    existing.updatedAt = t;
  } else {
    job.phases.push({ name: phase, status: phaseStatus, note, updatedAt: t });
  }
  job.status = phaseStatus === 'completed' && job.phases.every(p => p.status === 'completed')
    ? 'completed'
    : phaseStatus === 'blocked'
      ? 'blocked'
      : 'in_progress';
  job.notes.push({ at: t, text: `Phase ${phase} -> ${phaseStatus}${note ? `: ${note}` : ''}` });
  job.nextAction = job.status === 'completed'
    ? 'Job completed. No resume action required unless adding a new phase or rerunning a batch.'
    : phaseStatus === 'completed'
    ? 'Start or update the next phase, or mark the job completed if all work is done.'
    : phaseStatus === 'blocked'
      ? 'Resolve the blocker in the latest phase note, then resume with job-step.'
      : `Continue phase ${phase}; record each batch with job-item.`;
  return saveJob(job);
}

function jobItem(id, bucket, itemId, note = '') {
  if (!['completed', 'failed', 'skipped'].includes(bucket)) {
    throw new Error('Bucket must be completed, failed, or skipped');
  }
  if (!itemId) throw new Error('Missing item id');
  const job = readJob(id);
  const t = now();
  for (const key of ['completed', 'failed', 'skipped']) {
    job.items[key] = job.items[key].filter(item => item.id !== itemId);
  }
  job.items[bucket].push({ id: itemId, at: t, note });
  job.status = bucket === 'failed' ? 'in_progress' : job.status === 'pending' ? 'in_progress' : job.status;
  job.notes.push({ at: t, text: `Item ${itemId} -> ${bucket}${note ? `: ${note}` : ''}` });
  job.nextAction = bucket === 'failed'
    ? `Inspect failed item ${itemId}; retry, skip, or block the job.`
    : 'Continue with the next queued item or phase.';
  return saveJob(job);
}

function jobArtifact(id, artifact) {
  if (!artifact) throw new Error('Missing artifact path/id');
  const job = readJob(id);
  if (!job.artifacts.includes(artifact)) job.artifacts.push(artifact);
  job.notes.push({ at: now(), text: `Artifact recorded: ${artifact}` });
  job.nextAction = 'Verify artifact and continue with the next phase.';
  return saveJob(job);
}

function search(query, mode = 'standard') {
  const terms = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) throw new Error('Usage: search <query> [mode]');
  const p = policy(mode);
  const curated = path.join(KB, 'data', 'curated');
  const cards = readJsonl(path.join(curated, 'cards.jsonl'));
  const observations = readJsonl(path.join(curated, 'observations.jsonl'));
  const points = readJsonl(path.join(curated, 'timeseries-points.jsonl'));
  const forecasts = readJsonl(path.join(curated, 'forecasts.jsonl'));
  const playbooks = readJsonl(path.join(curated, 'playbooks.jsonl'));

  const score = obj => {
    const hay = JSON.stringify(obj).toLowerCase();
    return terms.reduce((sum, term) => sum + (hay.includes(term) ? 1 : 0), 0);
  };
  const rankedCards = cards.map(card => ({ score: score(card), card })).filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score).slice(0, p.maxCards).map(x => x.card);
  const rankedObservations = observations.map(observation => ({ score: score(observation), observation })).filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score).slice(0, p.maxEvidenceSnippets).map(x => x.observation);
  const rankedPoints = points.map(point => ({ score: score(point), point })).filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score).slice(0, 10).map(x => x.point);
  const rankedForecasts = forecasts.map(forecast => ({ score: score(forecast), forecast })).filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score).slice(0, p.maxEvidenceSnippets).map(x => x.forecast);
  const rankedPlaybooks = playbooks.map(playbook => ({ score: score(playbook), playbook })).filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score).slice(0, p.maxEvidenceSnippets).map(x => x.playbook);

  return {
    ok: true,
    mode,
    query,
    policy: {
      maxCards: p.maxCards,
      maxEvidenceSnippets: p.maxEvidenceSnippets,
      openFullSources: p.openFullSources
    },
    counts: {
      cards: rankedCards.length,
      observations: rankedObservations.length,
      timeseriesPoints: rankedPoints.length,
      forecasts: rankedForecasts.length,
      playbooks: rankedPlaybooks.length
    },
    cards: rankedCards,
    observations: rankedObservations,
    timeseriesPoints: rankedPoints,
    forecasts: rankedForecasts,
    playbooks: rankedPlaybooks
  };
}

const [cmd = 'status', ...args] = process.argv.slice(2);

try {
  let result;
  if (cmd === 'status') result = status();
  else if (cmd === 'init') result = init();
  else if (cmd === 'policy') result = policy(args[0]);
  else if (cmd === 'validate') result = validateJsonFiles();
  else if (cmd === 'job-create') result = jobCreate(args[0], args.slice(1));
  else if (cmd === 'job-list') result = jobList();
  else if (cmd === 'job-status') result = jobStatus(args[0]);
  else if (cmd === 'job-step') result = jobStep(args[0], args[1], args[2], args.slice(3).join(' '));
  else if (cmd === 'job-item') result = jobItem(args[0], args[1], args[2], args.slice(3).join(' '));
  else if (cmd === 'job-artifact') result = jobArtifact(args[0], args.slice(1).join(' '));
  else if (cmd === 'search') result = search(args.slice(0, -1).join(' ') || args.join(' '), ['quick', 'standard', 'deep', 'audit'].includes(args.at(-1)) ? args.at(-1) : 'standard');
  else {
    throw new Error(`Usage: node scripts/oil-kb.mjs [status|init|policy <mode>|validate|search <query> [mode]|job-create|job-list|job-status|job-step|job-item|job-artifact]`);
  }
  console.log(JSON.stringify(result, null, 2));
} catch (err) {
  console.error(JSON.stringify({ ok: false, error: err.message }, null, 2));
  process.exit(1);
}
