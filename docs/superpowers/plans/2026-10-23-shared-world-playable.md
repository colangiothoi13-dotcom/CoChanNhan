# Shared World Playable Implementation Plan

> **For agentic workers:** Use test driven implementation with independent server and UI work against the protocol below. Track verification in `.tmp/shared-world/progress.md`.

**Goal:** Build a playable shared adventure from the approved Cổ Tiên Lộ design: 30 locations across five regions, investigation, preparation, 12 inheritance trials, permanent death, new lives, account journal and one unique Hải Kính Immortal Gu.

**Architecture:** Preserve the existing canvas game as a separate local practice mode. Add a complete world-adventure screen using an authoritative Node HTTP service, shared content, persisted account/life/world state and polling snapshots. The service runs one logical world in one process; this implementation does not claim distributed MMO capacity or realtime PvP.

**Tech Stack:** Existing TypeScript/Vite/CSS/Vitest; Node 24 built-in HTTP, crypto and filesystem; no new runtime dependency.

**Spec:** `docs/co-tien-lo-thiet-ke-the-gioi-chung.md`.

## Global Constraints

- New characters never import local practice inventory, cultivation or money.
- World history persists across deaths and service restarts.
- Decisive trial failure kills; success grants the promised inheritance.
- At most one Hải Kính individual exists across accounts, lives, remains and reservations.
- All original locations, Gu and trials are labelled game adaptations.
- Vietnamese UI, existing jade/gold visual language, keyboard and phone support.
- No publishing or external account setup is required for local shared-world verification.
- Workspace has no `.git`; preserve originals in `.tmp/shared-world/baseline` and work in place. Do not initialize git or overwrite unrelated dormant features.

## Review Focus

1. Lost responses/retries must not duplicate cost, rewards or deaths; command IDs and life IDs are mandatory.
2. Refreshing or opening a second tab cannot undo committed trials, restore a dead life or double-claim unique rewards.
3. Invalid commands, stale stages and insufficient resources must not partially mutate state.
4. Connection failures show a recoverable state; pending command retries retain the same operation ID.
5. Modal closure and backgrounding must not stop authoritative deadlines; destroy removes polling and listeners.

## Files and ownership

- Shared content: `cotienlo-game/shared/world-content.json`, loaded only by the server.
- Public protocol: `cotienlo-game/src/world/types.ts`.
- Server worker: `cotienlo-game/server/world-store.mjs`, `http-server.mjs`, `index.mjs`, `server/*.test.mjs`.
- UI worker: `cotienlo-game/src/world/WorldPanel.ts`, `world.css`, optional UI test files.
- Root: content, protocol, `WorldClient.ts`, client tests, main/index wiring, package/Vite scripts, docs and browser acceptance.

## Protocol

`POST /api/world/session {name}` creates a guest account and returns `{token,snapshot}`. Token is a high entropy bearer capability, never accepted as an actor ID in a command. `GET /api/world` with bearer token resumes/heartbeats that account. `POST /api/world/command` accepts `{operationId,lifeId,action}` and returns a snapshot. `GET /api/world/health` needs no credentials. Public snapshots never expose other accounts' tokens, journals or private inventory.

`WorldStore({filePath?,now?})` exports `createSession(name)`, `snapshot(token)` and `execute(token,request)`. Mutations are synchronous transactions: clone, validate/mutate, persist atomically, then publish. HTTP routes must not expose state until persistence succeeds. Default content comes from shared JSON. Every test uses its own temp file or memory instance.

Types for snapshots and actions are defined in `src/world/types.ts`; it is the binding integration contract. Content JSON has `regions`, `places`, `inheritances`, `legends`, `origins`; trial choices contain server-only `effect` values and public costs/hints.

## Task 1 Content and contracts

- [x] Add tests that require a connected graph reaching 30 unique places, valid inheritance locations, complete eight-part records and playable multi-stage choices.
- [x] Watch tests fail while content is absent.
- [x] Write five regions and 30 places from the design; connect neighbors, including inter-region routes; define all 12 trials and four lesson scenarios.
- [x] Define public protocol types and server/UI task briefs.
- [x] Run focused content tests.

## Task 2 Authoritative service

- [x] Test and implement session identity, snapshots, travel, investigation, work/rest/training and lessons.
- [x] Test and implement commitment, staged choices, recoverable danger, decisive death, rebirth with knowledge only, remains and finite bonuses.
- [x] Test and implement exclusive reservation/ownership, stale life/stage rejection, idempotency conflict and retry, and durable state reload.
- [x] Test timeouts with injected clock and one shared 90-second pause allowance after 15 seconds without heartbeats; server outages add their unavailable duration to outstanding deadlines on restart.
- [x] Add bounded JSON HTTP routes and static serving of `dist`, with a loopback default and configurable host.
- [x] Run `node --test server/*.test.mjs`.

## Task 3 Client and game screen

- [x] Test session restore, token scoping, uncertain-command retry identity, timeout and cleanup using real client with controlled fetch boundary.
- [x] Implement `WorldClient` with `subscribe`, `join`, `restore`, `act`, `retry`, `setEndpoint` and `destroy`.
- [x] Implement screen: labelled connection form, five-region map, nearby routes, contextual actions, trial warning/commitment, choices, journal, lessons, history, presence, unique registry and rebirth origins.
- [x] Keep user text as text, never unescaped HTML; stable IDs/focus, 44px buttons, no horizontal overflow.
- [x] Wire world HUD button and lifecycle; opening world screen pauses practice through existing modal behavior, while server continues.
- [x] Run TypeScript and existing unit suite.

## Task 4 Run and acceptance

- [x] Add `server`, `test:world`, `play:world` scripts and Vite `/api/world` proxy; update README with web and LAN instructions plus Android endpoint constraints.
- [x] Verify two separate browser sessions see shared history and finite reward ownership; reload preserves a dead life and rebirth preserves world revision/journal.
- [x] Check phone and desktop UI, pending/errors, irreversible commitment, failed and successful trials.
- [x] Build and sync Android assets through the established script, then run asset checks.
- [x] Independent code review and fix material findings before delivery.

## Scope of this implementation

This is the first playable implementation of the approved large design, with all 30 sample places, 12 trial types and the complete multi-life rule loop. Travel is a strategic connected-map adventure, not 30 new free-roaming canvas maps. Realtime shared combat, markets, guild sieges, production authentication/database deployment and the long-term 360-place/300-inheritance target remain later production work. The UI and README must make the distinction clear.

