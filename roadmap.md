# Unified Yandex release
- [x] Isolate Preview at compile time and remove demo prefilling from real forms.
- [x] Add dependency-aware release planner, artifact verification and universal deployment with confirmation and recovery manifests.
- [x] Add ordered YDB migration tooling with checksums, locking and baseline approval; no live schema changes.
- [x] Test Preview, production-disabled behavior, release rules and migration failure/retry behavior: 13 frontend tests and 15 Node tests passed; Preview browser flow made zero real API calls.
- [x] Replace frontend-only documentation and record architecture rules.
- [ ] Live baseline inspection, Mac yc command validation and initial release/tag setup: require Yandex access and separate approval; no deployment in this task. Full Yandex artifact scan is wired into deployment but has not been run here; module-elimination compile test passed.