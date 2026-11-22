# Responsive screens
- [x] Adapt login, introduction, constructor, cart, payment result and cabinet for phones, tablets and desktop widths.
- [x] Verify all stages and both purchase modes: 378 browser checks at widths 320–2560px without overflow or runtime errors; DOCX/PDF/ZIP downloads passed. Both login screens additionally checked with intercepted local responses at seven sizes. All 13 existing frontend tests passed; no production deployment or live auth/payment checks.

# Unified Yandex release
- [x] Harden full Function configuration/secret preservation and pinned API activation.
- [x] Add fail-closed pending release handling and locally rehearsed static/Function/Gateway/manifest recovery, including six release-failure stages.
- [x] Verify known/accepted YDB table types/keys/indexes; require separate exact-plan approval and postconditions; block unsafe destructive/multi-statement DDL and automated code recovery after uncertain database changes.
- [x] Block unknown dependencies/unsupported server routes; run regression tests and prepare the second audit/full diff.
- [x] Isolate Preview at compile time and remove demo prefilling from real forms.
- [x] Add dependency-aware release planner, artifact verification and universal deployment with confirmation and recovery manifests.
- [x] Add ordered YDB migration tooling with checksums, locking and baseline approval; no live schema changes.
- [x] Test Preview/production-disabled behavior, release planning, configuration preservation, full mocked release/recovery and migration/schema rules: 13 frontend tests and 64 Node tests passed; no real cloud writes.
- [x] Replace frontend-only documentation and record architecture rules.
- [ ] Read-only live Function/Lockbox/Gateway/IAM/schema inspection, Mac CLI and full artifact validation, isolated UI/API/session/Sandbox compatibility reports, then first release/tag approval: blocked on Yandex/Mac access and separate agreement. No deployment or real migrations in this task.