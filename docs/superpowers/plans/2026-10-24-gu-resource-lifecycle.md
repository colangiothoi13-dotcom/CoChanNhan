# Gu Resource Lifecycle Implementation Plan

> For agentic workers: implement this approved user request in parallel by owned files, review contracts before integration, and verify with isolated data. The user explicitly asked to implement the saved specification now.

**Goal:** Make the saved resource/Gu lifecycle requirements playable, starting with a complete mortal loop and extending the same data model to immortal resources, production and singleton constraints.

**Architecture:** Keep server authority and the 50 ms world loop. A shared pure resource/lifecycle module owns catalogs, item balances, individual Gu condition/feeding/custody, recipes, production and local economic rules. WorldStore owns physical proximity, shared nodes, cross-account transfers/loans/listings, singleton arbitration and atomic persistence. A dedicated resource modal displays only accepted snapshots and sends commands; the canvas displays nearby discoverable resource points.

**Tech Stack:** Existing JavaScript ESM shared core, Node HTTP/WorldStore, TypeScript canvas client, accessible HTML/CSS modals, Node tests/Vitest and isolated Chrome acceptance.

**Spec:** `docs/TAI_NGUYEN_BAT_CO_LUYEN_HOA_NUOI_CO_LUYEN_CHE.md`, together with `docs/THIET_LAP_TU_VI_1_DEN_9.md`.

## Global Constraints

- No new-life Gu gifts. Preserve existing instance/recipe identifiers and historical assets by migration.
- Finding, physically holding, controlling, authorized use, nutrition and crafting are distinct states.
- A physical Gu exists in exactly one holder collection. Transfers move the actual instance, keeping feeding deadlines, injuries, old will and vital relation.
- Shared immortal uniqueness is keyed by type across ranks, including existing story singletons. Do not expose hidden owners or internal failure causes in public views.
- Every new numeric balance is a game convention. Source-provided canon assertions remain source claims unless a chapter is actually verified.
- No client HP, inventory, chance, price, reward or elapsed-time authority. Critical outcomes publish atomically and commands remain idempotent.
- Use bounded nearby node queries and lazy/batched time settlement, not a full-map simulation per frame. Nutrition/production use the server-owned world clock; clock stops when nobody is active. Cultivation keeps its existing pause behavior. Storage/transfer cannot reset a Gu's remaining feeding time.
- No SMTP secrets or production accounts used for testing. Backup and test migration on a copy before restarting the real service.

## Review Focus

- Two players capturing/buying/crafting one shared target must receive at most one actual instance.
- Interrupted taming can lose progress; paused/borrowed/listed Gu cannot gain a new food deadline by moving containers.
- Two Small Light Gu are separate required recipe inputs. Vital input protection applies to refinement failure, not every cause of death.
- Loan revocation and old-owner will survive changes of holder and death; receipt retries cannot duplicate transfers or money.
- Partial success/failure and persistence errors must not duplicate rewards, consume unrelated inputs or expose hidden singleton custody.

## Tasks and ownership

- [x] Shared core/catalogs: extend `shared/cultivation-core.mjs/.d.mts` compatibly; add `shared/resource-core.mjs/.d.mts` and focused tests for inventories, capture outcomes, gradual taming, feeding, recipes, research, farming and grade-specific resource conversion.
- [x] Server: integrate resource commands/clock/migration/snapshots in WorldStore and field engine; shared capture targets/harvest, NPC shop/jobs, instance transfer/loan/revoke/listing, unique refinement locks, death/remains and rollback tests.
- [x] UI: new `src/ui/ResourceModal.ts` and CSS with resource, discovery/capture, Gu care, recipes, production and market tabs; accessible controls and accurate deficiencies/status.
- [x] Root integration: types, main/index entry points, canvas resource markers, canonical new Gu display/hotbar where active, old refinement routing and meaningful browser tests.
- [x] Validation: focused + all existing suites, browser full mortal loop/two-account race/feeding/refinement/reload/death, build Android, hash assets, update implementation status in the durable spec.

The initial catalogs must support the three supplied examples: Moonlight food as Moon Orchid petals; one Moonlight + two Small Light individuals producing rank-two Moonbeam (separate from the legacy Moonblade ID/recipe); and a Star Fragment Grass → ordinary firefly colony → Star Firefly Gu production chain with explicit game environment/timing rules. No arbitrary Gu breeding mechanic.
