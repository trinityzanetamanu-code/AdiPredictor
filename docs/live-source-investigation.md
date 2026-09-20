# LiveDraw source investigation

Investigated on 19–20 September 2026. This report records public implementation evidence; it does not authorize rebroadcasting or bypassing site controls.

## Singapore Pools 4D

- Official page: `https://www.singaporepools.com.sg/ms/lotteryhomepage/4d/index.html`
- The page exposes a delayed-draw player container with official YouTube video/playlist metadata: video `SByHDTZjxEI`, playlist `PLaXhIWKbyl3U-lDz1iRRZ8-rabk_uZbCY`.
- Player script: `/ms/lotteryhomepage/delayed-draw-video-assets/delayed-draw-video-script.js`.
- No public HLS, DASH, or live MP4 source was found. AdiPredictor therefore embeds the official YouTube privacy-enhanced playlist and always retains an official-page fallback.
- The page uses a date-of-birth gate. AdiPredictor does not bypass the gate, authentication, geo controls, or expiring tokens.
- Official public result resource: `https://www.singaporepools.com.sg/DataFileArchive/Lottery/Output/fourd_result_top_draws_en.html`.

## Singapore Pools TOTO

- Official page: `https://www.singaporepools.com.sg/ms/lotteryhomepage/toto/index.html`
- The same delayed-draw implementation exposes video `1xc5gepZWQU` and playlist `PLaXhIWKbyl3VHtnNcMwG6KOg04q6QQXge`.
- Official live result page: `https://toto-results.singaporepools.com.sg/`.
- Official persistent result resource: `https://www.singaporepools.com.sg/DataFileArchive/Lottery/Output/toto_result_top_draws_en.html`. The official results page itself references this pregenerated file; the collector uses it because the live page displays a publication placeholder outside a draw window.
- No public HLS/DASH/MP4 stream was found. The app uses the official YouTube playlist plus official-page fallback.
- TOTO winning numbers are presented separately from the existing four-digit SGP composite market dataset. The latter is never labelled an official Singapore Pools 4D result.

## HK market feed

- Exact source page: `https://www.hongkongpools.com/live`.
- Browser inspection reached a Cloudflare human-verification challenge and remained there after one normal reload. No attempt was made to bypass anti-bot protection.
- Because iframe policy and a stable public media endpoint could not be verified, AdiPredictor does not embed or proxy this page. Capacitor Browser opens the exact page as the safe fallback.
- The label is `HongkongPools Market Source`, never `Official Hong Kong Lottery`. HKJC Mark Six is a different lottery and is not substituted for this dataset.

## SDY

The configured sources are cross-checked market-result providers. No public, embeddable broadcast matching the exact dataset was verified. SDY remains a real result monitor and is not given an official badge.

## Third-party reconnaissance

`https://sgnlive.org/` was inspected for architecture only. It embeds third-party/backend pages including `rankcrack.com/sgp.php`, `rankcrack.com/toto.php`, and a separate result table. It is not an official-player embed and is not used by AdiPredictor.

`https://98toto.info/pasaran.html` was also rechecked on 20 September 2026. Its public market table remained at 8 January 2025, so it was disabled as a composite SGP verification source. The two current independent SGP sources remain enabled and the required confirmation count remains two.

## Security and Android assessment

- No CSP/X-Frame-Options stripping, insecure CORS proxy, DRM bypass, geo bypass, token capture, or video rebroadcasting is implemented.
- YouTube iframe playback is supported by Android System WebView. Audio is not autoplayed; the user initiates playback/unmute.
- Exact source pages open through the official `@capacitor/browser` plugin on Android and `window.open` on the web.
- A scheduled draw window is displayed as `DRAW WINDOW`; iframe load is only `PLAYER READY`. The UI does not claim active live playback unless an actual media element reports playback.
