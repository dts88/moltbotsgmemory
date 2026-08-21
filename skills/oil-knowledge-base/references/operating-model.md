# Operating Model

The knowledge base is a lazy, source-aware market research system.

## Query flow

1. Parse the user request:
   - commodity, geography, metric, institution, date range
   - information type: fact, data, forecast, thesis, methodology, event, rumor, pricing
   - desired depth: quick, standard, deep, audit
2. Check catalogs and cards first.
3. Rank candidates by relevance, freshness, provenance quality, methodology fit, and source diversity.
4. Open only the evidence required by the selected depth.
5. If sources disagree, explain the methodological differences instead of forcing reconciliation.
6. If information is missing, record a knowledge gap.

## Time weighting

Use the policy in `knowledge/config/retrieval-policy.json`.

- MOC/heards and intraday price information decay quickly.
- Inventory, flows, and refinery operations decay over weeks.
- Monthly balances decay over months or quarters.
- Forecasts decay according to their forecast horizon.
- Methodologies and structural playbooks decay slowly, but can be superseded.

Expired information remains available for historical reconstruction and post-mortems.

## Data philosophy

- A number is not just a number; it is a source-specific claim with timing, scope, unit, and methodology.
- A forecast is not a fact; it is a dated subjective view with assumptions and invalidation conditions.
- A playbook is not a summary; it is a reusable analytical procedure with known failure modes.
- Embeddings are retrieval acceleration, not truth storage.

## Suggested ingestion workflow

1. Register the source as a `document`.
2. Create a short `card`.
3. Extract durable `observations`, `timeseries` points, `forecasts`, and `playbook` updates.
4. Link every extracted object to provenance.
5. Run a conflict check against existing records with the same metric/scope/horizon.
6. Keep conflicts unless they are true duplicates.

## Resumability

Every multi-step job needs a checkpoint before meaningful work begins.

1. Create a job with `node scripts/oil-kb.mjs job-create <type> <name>`.
2. Record the planned phases in the first note or job description.
3. After each source/batch, record item status with `job-item`.
4. At phase boundaries, record phase status with `job-step`.
5. If context is lost, inspect `job-status` and continue from `nextAction`.

Job status meanings:

- `pending`: planned but not started.
- `in_progress`: active and resumable.
- `blocked`: needs user input, missing source, or repeated failure.
- `completed`: all required artifacts have been written and verified.

The current conversation is not durable state. The job file is.
