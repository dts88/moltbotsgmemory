# Oil Knowledge Base

This is the replacement design for the retired `reports/knowledge-base.json` / vector-only RAG system.

The operating principle is:

- Default light: use catalogs, cards, and structured filters first.
- Drill down only when needed: open snippets, tables, source pages, or full documents on demand.
- Keep disagreements: do not collapse source differences into a single truth.
- Preserve provenance: every assertion should point back to source material.
- Separate facts, observations, forecasts, theses, and methodology.

## Layers

- `documents`: immutable source records for PDFs, reports, API payloads, tweets, email attachments, and datasets.
- `cards`: compact summaries used for low-token retrieval.
- `observations`: structured "who said what, when, using which scope/methodology" records.
- `timeseries`: numeric data points and revisions grouped by source-specific series.
- `forecasts`: subjective market views and predictions, versioned by institution and publication date.
- `playbooks`: reusable analytical methods learned from top institutions and historical cases.
- `entities`: institutions, commodities, geographies, contracts, routes, metrics, and named events.
- `embeddings`: optional semantic retrieval over already-filtered candidates; never the source of truth.

## Runtime Modes

- `quick`: metadata and cards only. Suitable for WhatsApp replies.
- `standard`: cards plus selected evidence snippets. Default.
- `deep`: cross-source comparison with targeted source excerpts.
- `audit`: broad source sweep for formal reports, post-mortems, and "do not miss anything" tasks.

See `config/retrieval-policy.json` for budgets and time-decay defaults.

## Checkpointing

Long-running ingestion and analysis work must be resumable without relying on chat history.

- Every multi-step job writes state under `knowledge/data/runtime/jobs/<job-id>/job.json`.
- The job file is the source of truth for current phase, cursor, completed items, failed items, and next action.
- Update the job after each source document, batch, or extraction phase.
- If context is lost, run `node scripts/oil-kb.mjs job-status <job-id>` and continue from `nextAction`.
- Do not restart a job from scratch unless the job state explicitly says it is safe.

Useful commands:

```bash
node scripts/oil-kb.mjs job-create ingestion "EIA weekly inventory pilot"
node scripts/oil-kb.mjs job-list
node scripts/oil-kb.mjs job-status <job-id>
node scripts/oil-kb.mjs job-step <job-id> extracting in_progress "Parsing latest EIA release"
node scripts/oil-kb.mjs job-item <job-id> completed eia-weekly-2026-06-03
```

Lightweight retrieval:

```bash
node scripts/oil-kb.mjs search "EIA crude inventory" quick
node scripts/oil-kb.mjs search "distillate demand" standard
```

## Directory Shape

- `schema/v1/`: JSON schemas for durable objects.
- `config/`: retrieval policy, weighting rules, and controlled vocabularies.
- `data/curated/`: small human-curated JSONL records.
- `data/raw/`: large/raw/private source files, ignored by git.
- `data/runtime/`: generated indexes, caches, embeddings, ignored by git.

## First Implementation Target

Start with structured JSONL and cards. Add SQLite/Postgres only when query volume or joins make it necessary. Add vector search only after structured filters are working.
