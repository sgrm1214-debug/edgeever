# EdgeEver lightweight personality and memory agent: plan and tradeoffs

[简体中文](personality-memory-agent.zh-CN.md)

Date: 2026-09-03. Status: an interactive preview is implemented in the workspace, not released. P0 performance/real-model evaluation and full P1 acceptance remain incomplete.

## Current preview scope (2026-09-03)

- Entry: Personal settings → AI integration → Open prompt library → “Chat with EdgeEver · Preview.” Requires a non-demo instance with login enabled and reuses the default model. Available online through web/embedded desktop UI; no native Android/iOS entry yet.
- One stable identity and an on-demand ToolLoopAgent. Users explicitly add memories or save their own words, correct/forget them and reuse them in new conversations. No automatic candidates, full-library scanning, reminders or note modifications.
- Instance-server storage is isolated by workspace and user; Cloudflare/Docker share business logic. New `0040_companion_memory.sql`; no changes to old migrations, dependency manifests or release versions. No migration was applied to real instances.
- Note access defaults off. Enabling it only searches/reads active notes in the current workspace; read IDs must come from this run's search. Title/ID/revision snapshots are retained. No write, external sending or system-control tools.
- With memory disabled, complete prior turns from the same conversation remain eligible only if they did not use memory or cite notes; memory-enabled replies are excluded. Memory edits/forgetting still invalidate old context and cancel running generation; previous replies citing notes are not resent automatically. Existing chat text/source snapshots remain: note deletion is not chat deletion. Clear chats separately; exported files and provider-held data are outside this deletion control.
- Request IDs are allocated/persisted before generation; recover by ID after disconnection, never automatically repeat a model call. Failure/cancellation retain recoverable results. A subsequent read marks abandoned runs interrupted after their 90-second expiry. No permanent polling or background replay.
- Separate JSON export includes memories and chats. Import atomically merges/deduplicates memories without replacing existing entries; it does not restore chats. Preview data is not included in note ZIP backups, desktop offline mirrors or native mobile sync; the UI discloses this.

### Implementation budgets

| Item | Current constraint |
| --- | --- |
| New runtime dependencies / always-on processes / bundled models | 0 / 0 / 0 |
| Stored memories / per-request memory context | 50 × 500 characters / 8,000 characters; Unicode segmentation, frequency-weighted matching and update recency, not semantic retrieval |
| Stored history / one list / per-request history | 500 requests / latest 100 / at most 6 eligible prior turns, totaling at most 12,000 characters |
| Input / response length | 4,000 / 16,000 characters |
| Tools / note text | At most 8 calls; 5 search results per call; cumulative 12,000 characters of bodies/excerpts |
| Model steps / output / timeout | At most 4 steps; 2,048 output tokens per step (not the whole run); cancel after 60 seconds |
| Concurrency / retries | 1 running request per account; 0 automatic model retries |

### Verification and outstanding gates

Initial API/storage/actual SDK tests with mock models cover account isolation, conflicts, atomic import capacity, forgetting/context invalidation, tool permissions, duplicate requests, partial-output recovery and UTF-8 stream parsing. Initial browser checks with an isolated in-memory database/fake model cover adding/correcting memories, chatting and disabling memory. No user-paid model calls or real notes were sent. At the initial handoff, the full non-E2E suite passed 1263 tests; this iteration's results are below.

The initial web production build's standalone chat-component chunk was 9.62 kB, or 3.25 kB gzip. It excludes other shared-client/translation changes and is not the total installer delta. The existing local-mirror dynamic-import warning remains in the web build.

### Second iteration (2026-09-03)

- Use built-in `Intl.Segmenter` with NFKC normalization, common stop-word filtering and higher weights for uncommon terms. Chinese questions can match older relevant memories; English matches words rather than substrings such as Rust inside trust. No new dependency, embedding call or persistent index.
- Preserve safe same-conversation continuity when long-term memory is off. Exclude other conversations, expired context revisions, failed turns and replies that may contain memory/note data. The 12,000-character history budget admits complete question/answer pairs; older content is not inserted around a newer pair that does not fit.
- Memory preconditions, context invalidation and mutations share one database transaction. Stale versions, capacity failures, empty imports and fully duplicate imports no longer interrupt generation; successful edits/forgetting still cancel old-context requests. No new migration.
- All 19 focused tests pass, as do web/mobile type checks and web/Worker builds. One full-suite run reported 1277 passing and 1 failing: another uncommitted change in the shared workspace statically imports `ai-runtime` from `plugin-research-routes.ts`, failing the Worker lazy-loading gate. This iteration leaves that plugin file untouched and does not claim a clean full suite.
- A synthetic local Bun 1.3.14 microbenchmark with 50 memories and 50 retrievals measured approximately 0.14 ms median / 0.19 ms P95. This only checks local retrieval overhead, not actual Worker CPU, model recall accuracy or an Electron resource baseline. Real-model and cross-platform performance gates remain incomplete.

Pre-commit verification: exclude the separate plugin changes, export this feature's staged snapshot to an isolated directory, install dependencies from the frozen lockfile, and revalidate. The full non-E2E suite reports **1269 passing, 0 failing**, including the Worker AI runtime lazy-loading gate. `bun run typecheck`, `bun run typecheck:mobile`, and `bun run build:web` also pass. This commit includes no plugin feature, dependency-manifest or lockfile changes; the shared workspace's plugin edits remain untouched.

This is not full P0/P1 acceptance. Real-provider compatibility, personality consistency, adversarial injection and before/after Electron package/startup/RSS measurements remain release gates. Lazy-loading the component and keeping the SDK server-side do not imply zero package/memory growth. Relationship modeling, automatic memory candidates and proactive actions remain unimplemented.

## 1. Product positioning and decision

EdgeEver aims to become a personal agent whose long-term memory is grounded in the user's knowledge, not merely a notes product with AI buttons. Notes carry knowledge and evidence; a stable identity, understanding of the user, shared experiences, and trustworthy actions create the sense of a continuing companion.

The core experience is remembering what matters, connecting past and present, keeping track of commitments, and accepting corrections. Personality should emerge through consistent, honest, considerate behavior, not simulated emotions or manufactured dependency.

**Decision: reuse the existing AI SDK `ToolLoopAgent` and build EdgeEver-owned identity, relationship, memory, permission, and action domains. Constrain phase one to zero additional runtime dependencies; do not introduce Mastra, ElizaOS, or another database.**

Lightweight, fast, and reliable are product requirements. Deepen personality and memory without turning the first release into a general-purpose agent platform. Identity, memories, and evidence should remain exportable, restorable, and usable after changing models, devices, or frameworks. Data portability does not guarantee identical expression across models; that needs evaluation.

## 2. Existing foundations and missing capabilities

Existing foundations:

| Foundation | Reuse |
| --- | --- |
| `ai` and existing OpenAI-compatible / Anthropic / Google providers | Agent loop, model access, streaming; preserve BYOM without requiring a new gateway |
| Zod | Domain data and tool input validation |
| SQLite / D1 and existing storage adapters | Persistence, account isolation, retrieval; shared business logic across runtimes |
| Rust desktop sidecar | Desktop local-data ownership and persistence adapter, without another LibSQL dependency |
| Existing note search, API, revision history | Tool data access, answer citations, and the basis for later mutation audits |
| Existing Croner and scheduled-task code | A foundation for later bounded reminders, not an existing durable task engine |
| Plugin API and MCP server | Extension boundaries; an MCP server does not imply an external MCP client or its security controls already exist |

Before implementation, consult the [README](../README.md), [model adapter](../apps/api/src/ai-runtime.ts), [shared storage contract](../apps/api/src/storage-contract.ts), [cross-runtime architecture](self-hosting-architecture.md), and [desktop packaging configuration](../apps/desktop/electron-builder.yml).

The original text generation lacked personality memory. The preview adds basic conversation storage, explicit memory governance, read-only permissions and recovery; full capabilities and performance gates still follow the plan below. Zero new dependencies does not mean zero new code, model cost, or maintenance.

## 3. Why this approach

| Option | Strengths | Costs and decision |
| --- | --- | --- |
| AI SDK + EdgeEver domain layer | Reuses model adapters; composable; identity and data remain independent of a framework | Requires product-specific memory governance and permissions; selected for phase one |
| Mastra | Integrated memory, workflows, approvals, orchestration, and observability | Additional dependency and runtime cost not yet justified by concrete requirements; defer |
| ElizaOS Core | Personality/autonomous-agent concepts and plugin ecosystem align with the vision | Requires reconciling its memory, plugin, and host concepts with EdgeEver; defer while learning from its design |
| A custom general-purpose agent/workflow framework | Maximum freedom | High maintenance risk; rejected. Reuse the AI SDK loop instead of rebuilding mature general capabilities |

### Size and memory observations during selection

An exploratory test ran in a temporary directory on 2026-09-02: macOS ARM64, Node 26.3.1, Bun 1.3.14; `ai@7.0.58`, `@mastra/core@1.63.2`, `@mastra/memory@1.28.1`, and `@mastra/libsql@1.22.2`. These identify the tested versions, not future latest releases.

The test imported entry points, retained class/function references, and bundled with Bun `--target=node --minify`. `/usr/bin/time -l` measured startup peak RSS; direct ESM imports were measured separately. No model requests, real conversations, or complete storage paths were exercised.

| Exploratory entry point | Single-file bundle (approximate, decimal) | Bundled process startup peak RSS (approximate, decimal) |
| --- | --- | --- |
| Empty Node | Negligible | 50 MB |
| AI SDK `ToolLoopAgent` | 0.38 MB | This bundle was not measured; direct ESM control was about 72 MB |
| Mastra Agent | 5.1 MB | 145 MB |
| Mastra Agent + Memory | 6.1 MB | 172 MB |

Mastra Core reported an npm unpacked size of about 66.2 MB, including substantial source maps and declarations; this is not the installer delta. Direct ESM startup peaks were about 174–185 MB for Mastra Agent and 185–186 MB for Agent + Memory; a separate post-GC RSS snapshot was about 196 MB. Startup peak, instantaneous RSS, and long-term idle usage are different measurements.

Limitations: scripts and raw outputs were not committed as a reproducible benchmark; capabilities were not equivalent, and Electron, Windows, and real agent workloads were not tested. gzip is not DMG/NSIS, and a tree-shaken bundle does not prove inclusion of dynamic assets or native dependencies. Do not infer guaranteed installer growth, resident memory, or performance ratios. The only conclusion is that additional framework cost warrants scrutiny; production metrics require new measurements.

## 4. Phase-one scope and non-goals

Phase one includes only:

- One user-visible agent and one stable default identity.
- Explicit user preferences, goals, and a small set of shared experiences persisted across conversations.
- Knowledge answers using existing note search, with important claims linked to evidence.
- Explicit requests to remember information or review of model-proposed memory candidates.
- A “What she remembers about me” interface for inspecting, correcting, forgetting, and managing sources.
- Cancellation at any time; model or memory failures must not disrupt normal note operations.

The product owns and versions the default identity. Leave room for user-selected names and communication style, but no character marketplace in phase one. The model must not rewrite core identity or permissions.

Exclude multi-agent systems, vector databases, knowledge graphs, background full-library scans, emotion simulation, general workflow engines, always-on autonomous loops, shell/computer control, automatic external messages/publication, and dynamic third-party agent plugin installation. Do not bundle local inference models with the client.

These are sequencing boundaries, not permanent product limits. Validate the experience of being remembered, understood, and able to correct the agent before adding proactive actions.

## 5. Data and memory model

| Domain | Content and boundary |
| --- | --- |
| Identity | Name, purpose, values, expression, and relationship boundaries; controlled updates |
| User model | Explicit preferences, projects, people, and goals; inferences are not facts |
| Relationship / shared experiences | Joint decisions, user feedback, commitments, unfinished topics; no model-generated trust score grants permissions |
| Working context | Current conversation, task, transient tool results; bounded by size and time |
| Evidence | Original notes, messages, revisions, and action results; the factual source of knowledge |

Long-term memories should include instance/account scope, category, content, provenance, status, creation/update times, event time when known, sensitivity, user confirmation, and supersession links. Model confidence is a ranking hint, not a calibrated probability or an authorization signal.

Conceptual tables may start with `agent_profiles`, `agent_memories`, and `agent_memory_sources`; add `agent_threads` and `agent_messages` if no reusable conversation store exists. Names and counts are not finalized SQL. Design indexes, account scope, sync conflicts, backup, and deletion semantics before adding incrementally numbered migrations. Never edit executed migrations or introduce another source of truth for notes.

### Memory lifecycle

1. User messages or authorized tool results produce candidates; retrieved notes are not new system instructions.
2. Validate evidence, account scope, sensitivity, duplicates, and conflicts; retain only information useful for future interactions.
3. “Please remember” can authorize that specific memory. Automatic extraction is off by default; when enabled, only low-risk explicit facts qualify for automatic acceptance. Sensitive information is not saved automatically.
4. Inferences await confirmation. Credentials and tokens must not enter memory. Do not promise perfect model-based sensitivity detection; let users disable extraction and exclude sources.
5. User corrections take precedence. Superseded memories leave active retrieval and may retain explainable replacement links.
6. Forgetting removes content from active memory and derived summaries/indexes, and prevents silent re-extraction from the same source. Deleting original chats or notes is a separate user choice; disclose backup retention and handling of deletion markers after restoration.

Deleted, invalid, or newly inaccessible sources require revalidation of dependent memories; they must not continue leaking the original content. Clear running context on account or instance switches. In-flight results must never be written to the newly selected account.

### Retrieval and cost

Assemble stable identity, a small user model, recent messages, a few relevant memories, and on-demand note search results. Start with existing search and category/project/time/status filters, not full-library prompts. Build real retrieval tests for Chinese, aliases, paraphrases, and temporal questions rather than assuming keyword search is sufficient forever.

Bound tool steps, context size, response time, concurrency, summarization frequency, and model cost. Phase one uses an explicit memory-candidate tool instead of requiring another summarization call every turn. Later compression must preserve evidence and be evaluated for lost commitments and altered facts.

## 6. Runtime and security boundaries

```text
Client: chat, citations, memory management, approval/cancellation
  → Authenticated transport (HTTP; narrow IPC only for local mode)
  → Shared agent domain services: identity, context, permissions, audit
  → AI SDK ToolLoopAgent: existing user model configuration
  → Allowlisted tools: application validation → authorization → storage/business services → result
```

Prefer the existing server-side model-credential and generation path. Do not add an always-on desktop process by default or put SDK credentials in the renderer. A local desktop agent is an optional execution mode requiring validation: only when local execution is needed should implementation choose an on-demand main-process module or isolated process and measure lifecycle, packaging, and permissions. Local knowledge storage does not mean remote model calls keep that knowledge on-device.

Cloudflare and Docker share business services with thin entry/driver adapters; do not rely on an in-process loop continuing after a Workers response. Desktop adapts the existing sidecar. Android and iOS initially reuse the protocol rather than implementing separate agent business logic. Offline note editing and access to synchronized data continue, but remote model unavailability must be explicit rather than presented as successful execution.

Keep initial candidate tools below eight, for example `search_notes`, `read_note`, `propose_memory`, `list_relevant_memories`, `correct_memory`, and `forget_memory`. Corrections and deletion must bind to verifiable user intent/confirmation, not a model claim that permission was granted. The memory UI can call deterministic APIs directly without routing through a model.

Later note writes separate proposal from approved execution. Every tool needs input validation, account/object authorization, quotas, and audit. Approval binds to the concrete operation, arguments, and data version; expiry or changed content requires renewed confirmation. Tool results, notes, attachments, and memories are untrusted data: they cannot grant tools, change permissions, or become identity instructions.

Database transactions and version checks prevent partial writes and overwriting concurrent edits. Stable operation IDs and execution records reduce duplicates. Transactions do not guarantee exactly-once effects in external services: query uncertain outcomes or ask the user instead of blindly retrying. Cancellation does not reverse completed side effects; report the completed portion.

## 7. Reliability and product controls

“What she remembers about me” should distinguish user-confirmed information, direct statements, and AI inferences; show evidence and change history; and support editing, confirmation, forgetting, pausing memory, and source exclusion. Personality must not manipulate intimacy or pressure users to keep interacting.

Load agent UI on demand. With AI disabled, do not scan, poll, issue paid requests, or block startup, editing, search, or sync. Preserve chat drafts on failure and accurately report retrieval, memory persistence, and tool status. Generated text is not evidence that an action succeeded.

Defer automation. Initially persist only necessary conversation and execution state, without building a general durable workflow engine. Future states such as `pending / running / awaiting_approval / completed / failed / cancelled` are only part of a recovery protocol; ownership, leases, timeouts, idempotency, version conflicts, and expired authorization still matter. Persisted state is not safe replay. Cross-device reminders also need deduplication, time zones, quiet hours, and missed-delivery policy.

## 8. Phases and acceptance criteria

### P0: baseline and read-only validation

- Build a fixed conversation set covering preferences, corrections, long-term goals, joint decisions, commitments, and citations.
- Validate tool calling, streaming, cancellation, and context budgets with existing providers. Incompatible models degrade explicitly to non-action chat.
- Compare production package, startup, and idle metrics before/after implementation. Decide execution location and data scope first; do not create multiple packages merely for anticipated abstractions.

### P1: manageable personality memory

- Implement controlled identity, conversation storage, memory candidates, provenance, and the memory-management UI.
- Validate cross-conversation recall, correction precedence, no recall after forgetting, source-deletion propagation, account isolation, and model switching.
- Include new data in export/restore policy. If cross-device synchronization is not yet available, show device scope explicitly instead of implying continuous memory everywhere.
- Proactive notifications and automatic note changes are not prerequisites for accepting this phase.

### P2: controlled actions and limited initiative

- Add change previews, approvals, version checks, and audit only after separate requirements are confirmed.
- Then consider user-enabled reminders/reviews using existing scheduling, not an unbounded background agent.
- Permit unattended execution only after repeated validation of recovery, deduplication, and cost limits.

### Quality and resource gates

- Initial constraints: zero new runtime dependencies, one user-visible agent, zero new always-on autonomous loops, and zero bundled local models. Table/tool counts are complexity budgets, not reasons to sacrifice isolation or correctness.
- On the same machine/configuration, record package size, cold start, RSS/heap, CPU, network, and model usage with AI disabled, idle, first-run, sustained use, and after cancellation/failure. Separate peak from steady state and verify resources can be reclaimed.
- Measure download size, installed size, renderer bundle, and server deployment separately. An SDK already present at the repository root does not make bundling it into desktop free.
- Set numerical thresholds after the P0 baseline. Do not treat exploratory Node numbers as Electron guarantees or trade unbounded caching for apparent speed.
- Test prompt injection, forged approvals, duplicate calls, concurrent edits, completion after cancellation, account switching, timeouts, and recovery. Repeatedly evaluate identity consistency, memory accuracy, and citation correctness with fixed models/configurations.
- Implementation must pass repository-required `bun run typecheck`, `bun run typecheck:mobile`, `bun run build:web`, and relevant non-E2E tests. Record client performance against the [desktop performance baseline](desktop-performance-baseline.md).

## 9. When to revisit the decision

Reevaluate dependencies only when real use and measurements show a limitation: embeddings for inadequate recall; mature workflow/agent runtimes when recovery/orchestration exceeds maintainable scope; an MCP client and permission model when external tools become a requirement.

Zero additional dependencies is a phase-one strategy, not a permanent ban. Never build a general framework just to preserve that number. For any new dependency, record user value, package/memory/cold-start deltas, platform support, licensing, maintenance, and an exit path. Avoid two competing agent loops, identities, or memory sources of truth.

This delivery is the bounded preview above, without version changes or real-instance deployment. Next complete the P0 baseline and real-model evaluation before expanding P1, rather than implementing the entire document at once.

## 10. References

- [AI SDK Agent interface](https://ai-sdk.dev/docs/reference/ai-sdk-core/agent): verify APIs against the locked version's local docs/source before implementation instead of copying old examples.
- [Mastra](https://github.com/mastra-ai/mastra) and [ElizaOS](https://github.com/elizaos/eliza): comparison candidates, not new project dependencies.
- [Existing Notion AI research](notion-ai-feature-landscape.en-US.md): product background, not a commitment to replicate its features.
