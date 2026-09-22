# Native live-board source investigation

Audit date: 21 September 2026. This document describes result-table ingestion only. AdiPredictor does not embed advertisements, execute source JavaScript, or proxy third-party pages.

## HK market

- Primary page: `https://www.hongkongpools.com/live`
- Fallback page: `https://www.hongkongpools.com/live.html`
- Product label: **HongkongPools Market Source**. It is not labelled as an official Hong Kong government lottery. HKJC Mark Six is a different market and is not substituted for this dataset.
- Expected board structure: labelled rows for 1st Prize, 2nd Prize, 3rd Prize, Starter Prize, and Consolation Prize. Every accepted number must contain exactly six digits. The AdiPredictor market value is derived only as `first[-4:]` and is compared with, but never silently written into, the verified prediction dataset.
- Network result from the audit environment: both URLs returned an HTTP 403 Cloudflare managed challenge with `cf-mitigated: challenge`. The collector and app explicitly detect this response and do not attempt to solve or bypass it.
- Post-release runtime audit (21 September 2026): the public `/live` document contains the validated six-digit result table after a user completes the site challenge, but no separate public JSON/XHR/static result endpoint that was demonstrably challenge-free was found. The app therefore does not invent or use a hidden endpoint.
- Native Android path: `CapacitorHttp.get()` performs a normal public GET and parses the response only if it is a valid result document. A challenge or malformed result is rejected.
- Manual verification: the Android build includes a dedicated, non-exported WebView activity restricted to `https://www.hongkongpools.com/`. A user can complete the Cloudflare challenge manually. Only after the result page is visible can the user submit the result DOM for strict six-digit parsing. Cookies, `cf_clearance`, and challenge tokens are never exported from the WebView.
- Device fallback: only the normalized result board (date, prizes, derived 4D, retrieval time) may be stored locally. No security cookie or token is stored by AdiPredictor.
- Two-layer runtime UX: the qualified collector-compatible sources provide the independently verified 4D result without waiting for the full table. The full 6D prizes are added by a validated public page response or the manual in-app WebView. During the configured draw window, empty prize rows use non-numeric spinner rings; the app never animates random or guessed digits.
- Cached fallback: `public/data/live-draw.json`, maintained idempotently by the existing Auto Result Collector whenever a complete board can be validated. The separate table at `https://www.livedrawhkpools6d.com/` only publishes the six-digit first result; its last-four sequence is qualified for dataset cross-checking, but it is not fabricated into a complete native prize board.
- Final fallback: open the exact source page with Capacitor Browser. External advertising/script content is never inserted into the native result board.

### KocokHK public mirror investigation

- `https://kocokhk.live/` is publicly accessible without authentication or a managed challenge in the audit environment. It is an AMP shell and must be labelled **KocokHK Mirror**, not official.
- Its live iframe is `https://rankcrack.com/live-draw-hk.php`. That page performs a public jQuery `.load('hk.php')` at startup and every **30 seconds**.
- The resolved public result endpoint is `https://rankcrack.com/hk.php`. It returned a text HTML table containing the draw date, exact 6-digit Prize 1/2/3, Starter, and Consolation rows. It did not require credentials, challenge solving, cookies, or a token.
- At audit time the table published 21 September 2026 with Prize 1 `219608`, whose structurally derived last-four is `9608`. This value is runtime evidence only and is not hard-coded.
- A separate result-history iframe exists at `https://tabelupdate.online/`; it exposed the matching recent 4D sequence but lagged the live endpoint by one draw during the audit. It is not selected as the primary live feed.
- `https://kocokhk.online/` redirected through changing domains and timed out in the audit environment. It is not selected.
- No public JSON, WebSocket, or YouTube/video endpoint was found. The selected mode is a normal public HTML-table GET. The app parses text only; it does not frame the advertising page or execute its scripts.
- Runtime priority: KocokHK public table, existing structurally valid public source, device/GitHub normalized cache, then the HongkongPools page as a manually opened reference. Persistent `hk.json` and P1–P8 remain controlled exclusively by the existing multi-source collector.

### HK freshness and market identity

The previous single-source path could remain at 19 September 2026 (`0860`) after the next draw. The collector now requires source qualification against the exact recent sequence `0040, 9298, 4332, 0379, 5065, 9059, 3725, 0860`. NexiPools is parsed from the exact **HK Pools** column; the adjacent **HK Lotto** column is explicitly rejected. On 20 September 2026, NexiPools, LiveNomor, and the 6D table independently resolved the target draw to `2036`. A single qualified fresh source is marked provisional; two or more exact matches are confirmed. Conflicts are not appended.

## SDY market

- Public page: `https://www.sydneypoolstoday.com/live.html`
- Data endpoint discovered from the page: `https://www.sydneypoolstoday.com/getLiveContent`
- Product label: **SydneyPoolsToday Market Source**. It is not labelled official.
- DOM structure: `live.html` is a static shell with an empty `#App` container. Its own jQuery code calls `GET getLiveContent`. A normal source session must first request `live.html`, then request the data endpoint with the page as Referer and `X-Requested-With: XMLHttpRequest`.
- Digit representation: current prize digits are image elements. The digit is encoded in deterministic filenames such as `biru_2.jpg`, `hijau_1.jpg`, `pink_7.jpg`, `orange_0.jpg`, and `kuning_3.jpg`. The parser also supports exact text-based six-digit cells. OCR is not used.
- Safety: only the returned HTML text is parsed. Ad banners, links, jQuery, inline scripts, and tracking code from the page are neither inserted into the DOM nor executed.
- Native Android path: a session-warming GET followed by a text-only `CapacitorHttp.get()` for the data endpoint.
- Cached fallback: `public/data/live-draw.json`. Polls that contain the same actual board do not rewrite the file merely because time has advanced.
- Final fallback: open `live.html` through Capacitor Browser if both native fetch and cached data are unavailable.

## Singapore

The result architecture remains independent from the player:

- Singapore 4D and TOTO use the official Singapore Pools draw pages and current official YouTube playlists. Playback uses the YouTube IFrame API; iframe load/readiness alone is not treated as playback evidence.
- A bounded watchdog replaces an unusable or blocked player with a clear official-link fallback. Official result boards remain visible even if Android WebView cannot play the video.
- Official 4D/TOTO results remain separate from the SGP composite prediction market.
- The SGP composite value is never labelled as an official Singapore Pools result.

## Native HTTP API

The project uses the Capacitor HTTP API bundled with `@capacitor/core` 6. The supported helper is `CapacitorHttp.get(options)`. Responses are requested as text, validated, and converted to a small normalized object before React renders them. Web builds do not attempt cross-origin source fetching; they use the normalized GitHub snapshot.
