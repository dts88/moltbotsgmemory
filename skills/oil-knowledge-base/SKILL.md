---
name: oil-knowledge-base
description: "Use, design, update, or query the oil-market knowledge base with source-aware observations, forecasts, time decay, playbooks, and lazy retrieval."
---

# Oil Knowledge Base

Use when working with the new oil-market knowledge base: importing reports, structuring data, comparing institutions, saving forecasts, updating analytical playbooks, or answering from stored knowledge.

## Rules

1. Start with `knowledge/config/retrieval-policy.json`.
2. Default to `standard` mode unless the user asks for quick, deep, complete, audit, or no-omission work.
3. Query order: structured filters -> cards -> evidence snippets -> semantic search within candidates -> source deep dive.
4. Keep source conflicts side by side. Do not merge IEA/OPEC/EIA/Platts/Argus/investment-bank numbers into one truth unless building an explicit house view.
5. Label output as fact, data, forecast, institution view, methodology, or inference.
6. Every durable claim should retain provenance back to a document, dataset, page, section, paragraph, API payload, or message.
7. Store top-institution analytical patterns as `playbook` records, not as loose notes.
8. For any long-running ingestion or analysis job, create/update a checkpoint with `node scripts/oil-kb.mjs job-*`; never rely on chat context as the only state.

## References

- Architecture: `knowledge/README.md`
- Schemas: `knowledge/schema/v1/`
- Operating model: `references/operating-model.md`

## Helper

Use `node scripts/oil-kb.mjs status` to check the scaffold and policy.

Use `node scripts/oil-kb.mjs search "<query>" [quick|standard|deep|audit]` for lightweight retrieval from cards and curated evidence before opening raw sources.

For resumable work:

- `node scripts/oil-kb.mjs job-create <type> <name>`
- `node scripts/oil-kb.mjs job-list`
- `node scripts/oil-kb.mjs job-status <job-id>`
- `node scripts/oil-kb.mjs job-step <job-id> <phase> <status> [note]`
- `node scripts/oil-kb.mjs job-item <job-id> <completed|failed|skipped> <item-id> [note]`
