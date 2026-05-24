# pg-inspector

> Five-scenario Postgres sandbox. Visualize multi-schema layouts, write SQL safely, generate it from English, read EXPLAIN plans, get schema-improvement suggestions. AI runs on Azure OpenAI via Managed Identity — no API keys anywhere.

[![ci](https://github.com/pritika292/pg-inspector/actions/workflows/ci.yml/badge.svg)](https://github.com/pritika292/pg-inspector/actions/workflows/ci.yml)
[![deploy](https://github.com/pritika292/pg-inspector/actions/workflows/deploy.yml/badge.svg)](https://github.com/pritika292/pg-inspector/actions/workflows/deploy.yml)
[![demo](https://img.shields.io/badge/demo-live-success)](https://pg.pritika.studio/)
[![license](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)

![TypeScript](https://img.shields.io/badge/-TypeScript-3178C6?logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/-Node.js%2020-339933?logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/-Express%205-000000?logo=express&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/-PostgreSQL%2016-4169E1?logo=postgresql&logoColor=white)
![Redis](https://img.shields.io/badge/-Redis%207-DC382D?logo=redis&logoColor=white)
![React](https://img.shields.io/badge/-React%2018-61DAFB?logo=react&logoColor=black)
![react-flow](https://img.shields.io/badge/-react--flow-FF0072)
![Vite](https://img.shields.io/badge/-Vite-646CFF?logo=vite&logoColor=white)
![Tailwind](https://img.shields.io/badge/-Tailwind%203-06B6D4?logo=tailwindcss&logoColor=white)
![Docker](https://img.shields.io/badge/-Docker-2496ED?logo=docker&logoColor=white)
![Azure](https://img.shields.io/badge/-Azure-0078D4?logo=microsoftazure&logoColor=white)
![Azure OpenAI](https://img.shields.io/badge/-Azure%20OpenAI-0078D4?logo=microsoftazure&logoColor=white)
![GitHub Actions](https://img.shields.io/badge/-GitHub%20Actions-2088FF?logo=githubactions&logoColor=white)
![Vitest](https://img.shields.io/badge/-Vitest-6E9F18?logo=vitest&logoColor=white)

**Live**: <https://pg.pritika.studio/>  ·  no signup, ~75K seeded rows across 5 scenarios.

---

## What it is

A web sandbox for exploring Postgres with AI help. Five named-industry scenarios are seeded into one database, each modeled as a small constellation of schemas the way a real company's services own their own data:

- **social_media** (Reddit-shaped) — recursive comments, vote skew, hot-content reads
- **enterprise_saas** (Salesforce-shaped) — account hierarchy, audit trails, opportunity pipeline
- **infra_startup** (Datadog-shaped) — time-series metrics with BRIN, alert dedup, incident lifecycle
- **ecommerce** (Shopify-shaped) — orders + items + payments, partial index on transient states
- **fintech** (Stripe-shaped) — double-entry ledger, idempotency keys, webhook log

Three things the page lets you do, all read-only:

1. **See the schema.** Click a scenario; the visualizer (react-flow + dagre) draws each sub-schema as a group box with table nodes inside, FKs as solid edges between tables in the same scenario, and *soft references* (informational columns with `COMMENT ON COLUMN`) as dashed edges between scenarios. Click any table node and the first 100 rows slide in on a docked drawer.

2. **Write or generate SQL.** Type a `SELECT` and run it (1-second statement timeout, server-enforced `LIMIT 500`). Or click ASK IN ENGLISH, describe what you want, and the model populates the editor with a candidate SQL. Click EXPLAIN to render the `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` plan as a tree with the bottleneck node highlighted.

3. **Get architecture-flavored advice.** ADVISE takes a free-form requirement ("show top 5 SKUs by GMV this month"), runs the NL→SQL → EXPLAIN pipeline, then asks the model for a one-paragraph rationale plus zero to four DDL statements (CREATE INDEX, ALTER TABLE) that would make the plan faster. Copy-to-clipboard on each.

Everything is one TypeScript codebase: Express 5 on the back, React 18 + Vite + Tailwind on the front, served by the same Node process. The visualizer is react-flow with custom node + edge components; the rest is plain React with a tiny pushState router.

---

## Why this exists

Most "NL → SQL" demos handwave the safety story and pretend the model is the whole product. This one does the boring engineering instead:

- **SQL safety is three layers, defense in depth.** The HTTP server runs as `inspector_ro`, a Postgres role with `SELECT`-only grants on the scenario schemas. The AST validator (`pgsql-ast-parser`) rejects anything that isn't exactly one `SELECT` before any DB call. Every query runs inside a `BEGIN READ ONLY` transaction with `SET LOCAL search_path` scoped to the chosen scenario, `SET LOCAL statement_timeout = 1000ms`, `SET LOCAL idle_in_transaction_session_timeout = 5000ms`, wrapped in `SELECT * FROM (user_sql) LIMIT 501` so even an unbounded query caps server-side, with `ROLLBACK` at the end.

- **AI authentication uses Managed Identity, not API keys.** The VM's System-Assigned Managed Identity has `Cognitive Services User` on the `pritika-ai` Azure OpenAI resource. The runtime constructs an `AzureOpenAI` client with `getBearerTokenProvider(new DefaultAzureCredential(), "https://cognitiveservices.azure.com/.default")`. Local dev uses the same `DefaultAzureCredential` cascade, falling through to `az login`. Zero secret bytes ever exist in the repo, in CI, or in any env file.

- **Postgres schemas as services.** Each scenario is split into 3–5 sub-schemas (`sm_identity`, `sm_communities`, `sm_content`, …) that own pieces of the domain, the way services-of-record typically do at companies that have outgrown a single schema. Cross-schema FKs *within* a scenario are real foreign keys (the visualizer draws them solid). Cross-*scenario* references are soft — informational columns whose target is declared in `pg_description` and discovered at introspection time. The dashed edges in the visualizer aren't decoration; they're modeling honesty about cross-team data.

- **EXPLAIN plan reading as a first-class deliverable.** The PlanTree component walks the JSON output, finds the slowest node, highlights it, and flags any node whose actual row count is >10× off from the planner's estimate. The AI commentary streams a senior-engineer rewrite of "the bottleneck is X, here's why, here's what to do."

---

## Architecture

```
   browser  (React 18 + Vite + Tailwind + react-flow)
      │  fetch /api/*
      ▼
 Express 5 :3014
 ┌──────────────────────────────────────────────────────────────────────┐
 │ helmet · rate-limit · request log (with redaction)                   │
 │                                                                       │
 │  GET  /health                                                         │
 │  GET  /api/scenarios                       list + counts (Redis 5m)  │
 │  GET  /api/scenarios/:slug                 schema tree + FKs         │
 │  GET  /api/scenarios/:slug/tables/:table   paged rows                │
 │                                                                       │
 │  POST /api/query/run         AST validator → safeRunner              │
 │  POST /api/query/explain     same, with EXPLAIN ANALYZE              │
 │  POST /api/query/nl-to-sql   prompt builder → AzureOpenAI            │
 │  POST /api/query/explain-ai  same + NDJSON streaming                 │
 │  POST /api/query/advise      nl→sql → explain → DDL suggestions      │
 └──────────────────────────────────────────────────────────────────────┘
       │                                                  │
       ▼                                                  ▼
 pritika-postgres                                    pritika-redis (DB 13)
   db:    pg_scenarios                                schema cache, rate buckets
   roles: inspector_admin (boot: migrate + seed)
          inspector_ro    (HTTP server, SELECT only)
   21 schemas across the 5 scenarios (~75K rows)
       │
       ▼
 Azure OpenAI (pritika-ai)
   gpt-4.1-mini · Managed Identity bearer · 200 calls/day budget
```

Two Postgres pools, one process. `getAdminPool()` is used only by the boot-time migrator + seeder; `getPool()` is the long-lived runtime pool and only ever knows the read-only role's DSN. The HTTP server, if it ever wanted to `DROP TABLE`, would have to find a non-existent admin connection first.

---

## SQL safety — three layers in detail

```
                  POST /api/query/run { scenarioSlug, sql }
                                │
                                ▼
                ┌──────────────────────────────────┐
                │ Zod body: scenarioSlug + sql<=10kb│
                └──────────────────────────────────┘
                                │
                                ▼
                ┌──────────────────────────────────┐  reject:
                │ Layer 2: AST validator           │   - any statement type ≠ select
                │ pgsql-ast-parser.parse(sql)      │   - any modifying CTE
                │ check: exactly one SELECT        │   - statement chaining via ;
                └──────────────────────────────────┘   → 400 with reason
                                │
                                ▼
                ┌──────────────────────────────────┐
                │ Layer 3: per-query transaction   │
                │   BEGIN READ ONLY                │
                │   SET LOCAL search_path TO       │
                │     sm_identity, sm_communities, │
                │     sm_content, sm_engagement,   │
                │     public                       │
                │   SET LOCAL statement_timeout    │
                │       = '1000ms'                 │
                │   SET LOCAL idle_in_transaction  │
                │       _session_timeout='5000ms'  │
                │                                  │
                │   SELECT * FROM (user_sql)       │
                │     AS w LIMIT 501;              │
                │                                  │
                │   ROLLBACK;                      │
                └──────────────────────────────────┘
                                │
                                ▼
                ┌──────────────────────────────────┐  pg sends back:
                │ Layer 1: inspector_ro role       │   - 42501 if anything was modifying
                │ grants: SELECT on schema tables  │   - 57014 if timeout fired
                │ no INSERT/UPDATE/DELETE/etc.     │ → mapped to TIMEOUT/PERMISSION_DENIED
                └──────────────────────────────────┘   → 400 with code
```

If all three layers are right, an attacker can't write to the database. If any one is wrong (say a parser bug that lets `INSERT` slip through), the role grants stop them. If the role grants are wrong (Postgres bug, configuration drift), the validator rejected the syntax. If both fail, the statement_timeout kills any quadratic explosion before it consumes the box.

Each is independently testable: `tests/services/sqlValidator.test.ts` covers every modifying statement form the parser knows about; `tests/integration/queryApi.test.ts` hits real Postgres with `pg_sleep(2)` to verify the timeout fires.

---

## Data model

| Scenario | Sub-schemas | Headline tables | Rows |
|---|---|---|---|
| social_media | sm_identity, sm_communities, sm_content, sm_engagement | users, communities, posts (recursive comments), votes | ~35K |
| enterprise_saas | es_identity, es_accounts, es_pipeline, es_tasks | accounts (self-FK), contacts, opportunities, activities | ~15K |
| infra_startup | infra_identity, infra_inventory, infra_metrics, infra_alerting | services, metrics_minutely (BRIN), alerts, incidents | ~16K |
| ecommerce | ec_catalog, ec_customers, ec_orders, ec_payments | stores, products (soft delete), orders (partial idx), order_items | ~28K |
| fintech | ft_identity, ft_ledger, ft_merchants, ft_disputes, ft_webhooks | users, accounts, transactions (paired, idempotency_key UNIQUE), disputes | ~16K |

Cross-scenario soft references, declared via `COMMENT ON COLUMN`:

- `ec_payments.payments.processor_user_id → ft_identity.users.id` (ecommerce uses fintech for payment processing)
- `infra_identity.users.external_contact_email → es_accounts.contacts.email` (infra startup sells through an enterprise SaaS partner)
- `sm_identity.users.payment_account_id → ft_ledger.accounts.id` (social media uses fintech for creator payouts)
- `es_pipeline.activities.actor_external_email → sm_identity.users.email` (enterprise reps post on social media)

The visualizer reads `pg_description` at introspection time and renders these as dashed edges between the scenario boundary boxes.

Seeding uses `@faker-js/faker` with a fixed seed (`FAKER_SEED = 4242`) so two boots produce identical data; bulk-inserted via `pg-format`'s `%L` so each table is one round-trip. Distributions are domain-shaped — opportunities skew to early stages, posts skew to top 50 communities, ~5% of products are soft-deleted, ~10% of disputes are open.

---

## Run locally

Requires Docker and `mise` (or any Node 20 toolchain).

```sh
mise install
npm ci
docker compose -f docker-compose.local.yml up -d        # Postgres on 5433, Redis on 6380
cp .env.example .env                                    # fill in your local DSNs
az login                                                # so DefaultAzureCredential can use you for AI
npm run dev                                             # vite on :5173, express on :3014
```

The first boot runs migrations + seeds in ~10 seconds; subsequent boots are no-op via `_seed_marker`. To re-seed, bump `SEED_VERSION` in `src/server/db/seed/runSeed.ts`.

For AI features locally, your `az login` identity needs `Cognitive Services User` on the `pritika-ai` resource:

```sh
az role assignment create --assignee <your-upn> \
  --role "Cognitive Services User" \
  --scope /subscriptions/.../resourceGroups/pritika-portfolio-rg/providers/Microsoft.CognitiveServices/accounts/pritika-ai
```

---

## Tests

```sh
npm test            # one shot
npm run test:watch  # iterate
```

Vitest workspace with two pools: server (Node env, single-fork so integration tests don't race on shared DB state) and client (jsdom). Integration tests use real Postgres + real Redis — no mocking, per the standing rule that mocks of stateful systems hide more bugs than they catch. The AI client is the one exception: tests inject a fake via `setAiClientForTests()` so no real Azure traffic happens in CI.

72 tests cover the validator, the safeRunner, every API route, the seeders' row-count and shape invariants, the migration runner, helmet headers, and the React shell.

---

## Deploy

GitHub Actions OIDC into Azure, then `az vm run-command invoke` to run an inline shell script that `git pull`s, runs `scripts/bootstrap-vm.sh` (fetches the two Postgres role passwords from Key Vault via the VM's Managed Identity), and brings up the docker-compose stack. Health probed via `curl localhost:3014/health` for 90 seconds (covers the first-time seed window).

No secrets in GitHub Actions secrets. Only repo *variables*:

- `AZURE_DEPLOY_CLIENT_ID` (the `pritika-github-deployer` app's client id)
- `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`
- `AZURE_DEPLOY_RG`, `AZURE_DEPLOY_VM_NAME`

The federated identity credential on the deployer app pins `subject = repo:pritika292/pg-inspector:ref:refs/heads/main` so a feature branch's CI can never trigger a deploy.

Manual fallback: `bash scripts/deploy.sh` from any machine where you're `az login`'d does the same thing.

---

## Honest limitations

- The data is `@faker-js/faker` plus curated word lists. Believable at a glance, not real prod distribution.
- The AST validator is best-effort. The runtime role is the load-bearing defense; if Postgres ever lets a SELECT escape grant checks (which it doesn't, but pretending), the data the attacker sees is the same data already public on the page.
- Schema introspection assumes a small graph (<50 tables per scenario). It doesn't paginate. A 10K-table schema would slow `/api/scenarios/:slug`.
- The 1-second statement timeout is conservative on purpose — it kills any reasonable user query within the latency a recruiter will tolerate, but plans involving the 14K-row `metrics_minutely` table can need 5s. EXPLAIN uses a 5s timeout for that reason; `RUN` doesn't.
- The advise endpoint makes three sequential model calls (nl→sql, explain, advise). At ~300ms each plus the EXPLAIN itself, advise responses take 1.5–3 seconds. Streaming the final advise back would help; not in v1.
- Mobile layout collapses the scenario list into a tab strip and hides the table-data drawer; the visualizer still requires a real touchscreen scroll to use comfortably.

---

## What I'd build next

- A "schema diff" feature: paste two `pg_dump --schema-only` outputs, get a visualized diff with FK/index/column changes called out.
- Per-scenario presets for index-tuning labs: deliberately remove an index, let the user observe the EXPLAIN regression, prompt to restore.
- Live execution preview for advise's suggested DDL — run the index creation against a throwaway schema and re-EXPLAIN, then offer to keep or discard.
- pgvector-backed semantic search over table + column names so the visualizer's "find" handles fuzzy queries.

---

## License

MIT. See [LICENSE](./LICENSE).
