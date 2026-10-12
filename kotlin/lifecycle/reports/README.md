# Local Stage 3B verification

Before implementation: `390d4addcf54a5e435dd5f7041c2029e8e3f351e`.

- Kotlin build and 22 tests: PASS (core 12, production transaction/codec 10).
- Live Python/Kotlin lifecycle: 16 scenarios PASS, 0 unallowed mismatches; complete JSON/SVG, changed-file sets, clocks, resolved archive hashes and runtime measurements are in `local-lifecycle.json`.
- A separate cached-output validation policy difference is recorded: Python accepts missing models on a matching cache; Kotlin fails without applying output. Partial first-market native writes are not copied to the transactional adapter.
- Real shell publisher retry against isolated local Git origin: PASS; changed source rebuilt, changed data recalculated, stale output discarded, engine failure blocked publication, source exit preserved, no-change created no commit, no fallback.
- Real-input Kotlin simulation: all HK/SDY/SGP unchanged, zero changed files, no apply; input hashes/fingerprints/source/build identity and before/after output manifest hashes are recorded.
- Existing checks: 110 Python, 93 JavaScript, web build, foreground synchronization, HK controlled-DOM diagnostic, Android viewport history/SVG and signed release guards PASS. Browser checks are controlled desktop Chromium evidence, not a physical device claim.
- The production backend is kept Python in the adapter commit. Activation requires all three remote validation gates, then one normal production pipeline (force=false).

See `../../docs/production.md` for reproducible commands and boundaries. CI artifacts are authoritative commit-specific evidence; these local reports precede the adapter commit. No original public file was changed by either harness or simulation.
