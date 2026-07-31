# EdgeEver Project Structure

```text
edgeever/
├── apps/
│   ├── web/              Vite + React product UI, PWA, offline drafts, sync queue
│   ├── extension/        Chrome/Edge/Firefox Manifest V3 web clipper
│   ├── api/              Cloudflare Worker + Hono API, OpenAPI, MCP endpoint
│   ├── mobile/           Expo + React Native mobile app
│   ├── desktop/          Electron shell, preload bridge, and packaging
│   └── site/             Astro official website
├── packages/
│   ├── client/           Shared API client
│   └── shared/           Shared types, schemas, and content conversion
├── crates/
│   └── desktop-sidecar/  Rust sidecar for local SQLite and native data services
├── migrations/
│   └── 0001_initial.sql
├── scripts/              Wrangler wrapper, CLI, MCP bridge, and build helpers
├── docs/                 API, architecture, migration, and deployment docs
├── .github/workflows/    CI, packaging, deployment, and release workflows
├── tailwind.config.ts
├── wrangler.toml
├── bun.lock
└── package.json
```

## Deployment Shape

EdgeEver should deploy as one Cloudflare Worker:

- `/api/*` is routed to the Hono app first.
- Static files from `apps/web/dist` are served by Workers Assets.
- Unknown static routes fall back to `index.html` for SPA and PWA navigation.
- `env.DB` is the D1 binding.
- `env.RESOURCES` is the R2 bucket binding for images and attachments.

The official website in `apps/site` is an Astro static site. It is built and
deployed independently from the product Worker, typically to Cloudflare Pages.

## Frontend Boundaries

- `components/layout` owns the responsive three-pane shell.
- `components/notebook-tree` renders recursive notebooks from `parent_id`.
- `components/memo-list` owns checkbox selection and merge action surfaces.
- `components/editor` owns TipTap integration and Markdown serialization.
- `lib/api-client.ts` should be the only browser module that talks to `/api/*`.

## API Boundaries

- `routes/*` should stay thin: validate input, call services, return JSON.
- `services/merge-memos.ts` owns the D1 transaction that creates a merged memo, soft deletes source memos, and re-points resources.
- `services/resource-store.ts` owns R2 object keys and upload/download URL policy.
- `db/*` owns SQL snippets and row mapping.

## Data Model Notes

- Notebook nesting is unbounded through `notebooks.parent_id`.
- Every memo belongs to exactly one notebook through `memos.notebook_id`.
- Merge output is represented by a new memo with `source_memo_ids` and `merge_source_count`.
- Merge inputs are retained as soft-deleted rows with `merged_into_memo_id`.
- R2 objects are not moved during merge; `resources.memo_id` is updated to the new memo.
