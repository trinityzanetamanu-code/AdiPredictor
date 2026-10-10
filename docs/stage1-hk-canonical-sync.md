# Stage 1: HK acceptance, automatic reconciliation, P5 metadata

Baseline remote main: `1fa79a8455884fb0f49b5e6851d214e2f6037881`.
No AGENTS.md exists in that tree. Direct git clone was blocked by the environment;
the GitHub connector supplied the exact source/data snapshot. There was no local
repository or local work to overwrite. Remote updates use an expected-head lease
and a normal fast-forward commit, without a branch or PR.

## Actual source access and remaining blocker

`https://www.hongkongpools.com/live.html` returned HTTP 403, no redirects, with a
Cloudflare challenge. `tests/fixtures/hk-live-access.json` records the actual
check and response hash. The HTML fixture retains only the visible title/message;
challenge scripts/session attributes are removed. No cookies/tokens are saved.

The successful result DOM, digit image naming, refresh behavior and a source
signal distinguishing partial from final have **not** been verified. The owner's
screenshot illustrates 813534 -> 3534 for 2026-10-10; it is not a response fixture
and does not prove finality. Existing generic text/image/span parsing is tested
with controlled fixtures, not claimed as a verified HongkongPools adapter.

HongkongPools /live.html is attempted first by collector and Android. All source
candidates are checked for freshness; an old board cannot end source discovery.
Filled fields alone produce `unknown`, incomplete observations produce `partial`.
No bypass or guessed finality selector is implemented.

`HK_FINALITY_CONTRACTS` is intentionally empty. `validate_hk_canonical()` rejects
unproven finality, wrong market/source, numeric 6D values, future/invalid dates and
incorrect last-four derivation. Tests temporarily register a clearly synthetic
contract; this does not enable production acceptance. A future successful
partial/final capture must support a specific adapter/contract before activating
that boundary. Until then HK canonical end-to-end acceptance is BLOCKED.

## Collector and publication

Pipeline: source observations -> validated-final acceptance boundary -> canonical
HK dataset -> existing history collectors -> reconciliation using the resulting
dataset -> prediction engine -> existing atomic Git publication -> UI.

A validated-final primary needs only one source. Identity is HK + source draw
date, using Asia/Hong_Kong for source/market dates; retrieval and user display
are separate timestamps. 6D stays a string, with 4D derived from its last four.
An identical observation changes no draw timestamp or numeric fingerprint.
One-time provenance enrichment preserves earlier source evidence. Differences
in 4D or known 6D for the same draw enter hk-conflicts.json with old/new evidence;
canonical history is retained for owner review.

live-draw.json schema 2 includes a separate status object for each market:
last valid canonical row, last check, source URL/date, partial/unknown/final,
fetch/parse errors, conflicts, canonical decision, and cache status. Old cached
boards are re-compared against THIS cycle's dataset, retaining their original
observation timestamp. Previous schemas remain readable.

HK access/finality failure returns a nonzero collector result. The existing
publisher still publishes valid datasets, prediction metadata and diagnostics,
then propagates that failure. SDY success cannot turn blocked HK into a green
collector run. Such a failure is expected until the source blocker is resolved.
The existing retry mechanism retains concurrent remote main updates.

## App reconciliation and dataset alignment

One bounded foreground cycle coordinates dataset/prediction loads and LiveDraw
snapshot reconciliation. It runs at cold start, foreground polling, browser
focus/visibility and Capacitor app resume, regardless of the selected tab.
Overlapping calls share one operation; stale request IDs remain guarded. Fetches
have timeouts, a minimum interval and bounded failure backoff. Native HK probes
have a separate bounded cooldown within that coordinated operation.

The LiveDraw panel reads the shared observations. The existing Singapore official
4D/TOTO result path is retained. Per-market live health/errors are visible in
Analisis as well as LiveDraw. No closed-app polling guarantee is made; scheduled
GitHub collection remains independent of the device.

Remote canonical datasets/current predictions are retained in memory and, when
storage permits, persisted. Remote regression/conflict or failure retains that
cache and labels it REMOTE_CACHE, instead of replacing it with an older APK.

Current predictions carry dataset_revision = SHA256("MARKET|date:4D|...") in
ascending date order. The UI hashes the whole fetched dataset, so concurrent
publication, corrections to older rows, or mismatched versions cannot claim a
matching prediction merely because the latest draw matches. Legacy current v2 payloads are verified against the existing known engine-version
whole-dataset fingerprint contract. Payloads lacking either recognized identity
stay readable but cannot claim full alignment. Archive readers keep their existing
compatibility behavior.

## P5 metadata

Model computation and P1-P8 formulas/candidates are unchanged. P5's
model_visual_gate records the mode, enabled contribution, vote weight and
visual-only backtest actually used. Existing model flags now remain accurate.
generate_visual_patterns only adds visual_pattern_evaluation; every SVG retains
its own pattern edge/backtest evidence. It cannot overwrite model flags.

METADATA_REVISION=3 explicitly regenerates current payloads once. ENGINE_VERSION
and schema stay v2, and the numeric dataset_fingerprint stays unchanged, preventing
metadata-only refreshes from becoming new prediction notifications. Historical
archives remain compatible. Current undrawn target metadata is refreshed through
the existing engine publication path.

The actual SGP regression is frozen through 2026-10-10: model hybrid/contribution
true while SVG pattern edges are false. Tests prove both findings coexist and the
model matrix does not change. Controlled regeneration tests also assert identical
final candidates and P8 output, followed by an idempotent unchanged run.

## Validation and limits

Python tests cover acceptance, zeroes, dates/timezones, partial/finality rejection,
duplicate/correction handling, stale source discovery, 403/timeout/parse errors,
per-market diagnostics, board reconciliation, SGP P5 and metadata idempotence.
JavaScript tests cover whole-dataset revisions, APK/cache regression, persisted
cold cache, mixed publication, source errors, coalescing/backoff, notifications and
foreground lifecycle bindings, alongside existing compatibility tests.

scripts/check_foreground_sync.mjs runs a controlled Playwright browser rehearsal:
cold start, remaining on Analisis while data advances, repeated snapshot polling,
stale prediction suppression, prediction catch-up, focus/resume and reload. It
never contacts a real draw source. The debug workflow runs this rehearsal.

Physical Android device testing has not occurred. Local web build succeeds;
local Gradle execution is blocked by unavailable Gradle download networking.
Android Debug APK verification uses the existing CI workflow. No signed release
workflow, release, Kotlin migration, paito removal, signing/applicationId change,
branch cleanup or new PR is part of this stage.


The existing paito viewport harness also revealed a clipped fullscreen Close
control at 393px. VisualPaitoViewer is unchanged in Stage 1. The harness retains
its actual mobile PNG, records EXISTING_MOBILE_CONTROL_CLIPPED, and uses keyboard
activation for closing/navigation to finish the other checks. This is not a mobile-layout
PASS or a device PASS; paito layout is outside this stage's implementation scope.
