# Native live-board source investigation

Audit date: 20 September 2026. This document describes result-table ingestion only. AdiPredictor does not embed advertisements, execute source JavaScript, or proxy third-party pages.

## HK market

- Primary page: `https://www.hongkongpools.com/live`
- Fallback page: `https://www.hongkongpools.com/live.html`
- Product label: **HongkongPools Market Source**. It is not labelled as an official Hong Kong government lottery. HKJC Mark Six is a different market and is not substituted for this dataset.
- Expected board structure: labelled rows for 1st Prize, 2nd Prize, 3rd Prize, Starter Prize, and Consolation Prize. Every accepted number must contain exactly six digits. The AdiPredictor market value is derived only as `first[-4:]` and is compared with, but never silently written into, the verified prediction dataset.
- Network result from the audit environment: both URLs returned an HTTP 403 Cloudflare managed challenge with `cf-mitigated: challenge`. The collector and app explicitly detect this response and do not attempt to solve or bypass it.
- Native Android path: `CapacitorHttp.get()` performs a normal public GET and parses the response only if it is a valid result document. A challenge or malformed result is rejected.
- Cached fallback: `public/data/live-draw.json`, maintained idempotently by the existing Auto Result Collector whenever the public page is fetchable.
- Final fallback: open the exact live page with Capacitor Browser. The source page is never embedded inside the AdiPredictor result board.

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

The existing architecture is unchanged:

- Singapore 4D and TOTO use the official Singapore Pools pages and the existing privacy-enhanced YouTube player.
- Official 4D/TOTO results remain separate from the SGP composite prediction market.
- The SGP composite value is never labelled as an official Singapore Pools result.

## Native HTTP API

The project uses the Capacitor HTTP API bundled with `@capacitor/core` 6. The supported helper is `CapacitorHttp.get(options)`. Responses are requested as text, validated, and converted to a small normalized object before React renders them. Web builds do not attempt cross-origin source fetching; they use the normalized GitHub snapshot.
