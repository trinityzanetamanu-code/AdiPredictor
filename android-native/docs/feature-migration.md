# Stage 4A feature migration matrix

Checkpoint B review. `SUDAH_TERIMPLEMENTASI` means behavior has source and actions; `TERUJI` is reserved for completed tests. Controlled Compose UI checks are still in progress at this checkpoint. There are no hardcoded prediction outputs or React WebView UI.

| Feature | Implementation | Evidence/status at checkpoint B |
| --- | --- | --- |
| Analisis HK/SDY/SGP | Market selection, canonical latest, provenance, full revision + fingerprint + basis gate, runtime-ahead hold, complete published candidates, copy, P1–P8/P5 diagnostic, raw/weighted/tie consensus, confidence, history entry | SUDAH_TERIMPLEMENTASI; whole-dataset identity/cache unit tests TERUJI; controlled UI pending |
| Data | Actual newest/history rows, text search, from/to filters, verification/source, copy | SUDAH_TERIMPLEMENTASI; search/leading-zero unit tests TERUJI; controlled UI pending |
| LiveDraw | Published snapshot and separate direct HTTP HK/SDY observations, exact six digits including image/span sources, bounded conflicts, source/cache errors, SGP official 4D/TOTO, source and recording navigation | SUDAH_TERIMPLEMENTASI; real legacy HTML fixtures match original JS oracle; runtime conflict/canonical separation TERUJI; playback opens external YouTube/browser |
| Statistik | Per-market counts of every digit in actual canonical rows | SUDAH_TERIMPLEMENTASI; actual count unit tests TERUJI; controlled UI pending |
| Tafsir | Existing `data/tafsir.json`, keyword/number/description search, copy | SUDAH_TERIMPLEMENTASI; real dataset search TERUJI; controlled UI pending |
| Pengaturan | Persistent notifications/categories, Android permission, diagnostics, release metadata, legacy JSON import from document or clipboard | SUDAH_TERIMPLEMENTASI; preference/dedup/migration unit tests TERUJI; Android delivery tests pending |
| Histori | Search/select indexed archive, request generation/cancellation, identity guard, Quick View/candidates/models/consensus, selected target's index outcome audit, original SVG plus zoom, complete payload | SUDAH_TERIMPLEMENTASI; all archive identities/original SVG paths and offline SVG equality TERUJI; controlled render pending |
| Cold start/foreground/resume | Persistent canonical and runtime caches, immediate lifecycle refresh, foreground polling (10s HK draw window / 30s otherwise), serialized refresh; no old response promotion | SUDAH_TERIMPLEMENTASI; overlap/timeout/403/cache restart unit tests TERUJI; controlled lifecycle pending |
| Native reminders/deep links | Original HK and SGP 4D/TOTO schedules; inexact Android alarms, persistent event dedup, category toggles/cancel, internal routes and back/state restore | SUDAH_TERIMPLEMENTASI; schedule/year boundary tests TERUJI; Android tests pending |
| Emulator / physical device | No emulator or device has been used | BLOCKED for local accelerated emulator (`/dev/kvm` unavailable); physical NOT_RUN |

SDY has no schedule in the legacy source contract, so native does not invent one. A schedule badge is not evidence that a source is live or canonical final. HK HTTP 403 is a retained source diagnostic, not an engine failure.

Original SVGs are preserved as markup inputs; AndroidSVG draws their original coordinates, digits, labels and paths on a native Canvas. External playback is deliberate browser/YouTube intent navigation, not an embedded React/WebView implementation and not a claim of device PLAYING evidence.
