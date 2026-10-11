# Stage 1B: source access evidence and validation without APKs

> Historical report: Stage 2 removed the Pola Paito viewer and its capture/viewport CI job. Descriptions below record behavior at this report's original stage, not current UI instructions. Pola Visual, archived SVGs, visual audits, P5 and collector history sources remain.

MAIN_BEFORE: `0ebd14ce545dee7c5ce8471e0d6dd5d2e6defd38`.
Checked out main with a clean working tree in a separate checkout; prior local
work in another workspace was retained. No AGENTS.md exists in this repository.
No branch, PR, force push, signing or release action is part of this task.

## Rechecked baseline

- Debug workflow run #141 (38083141293): success, now historical.
- Collector run #311 (38084782846): failure. The actual job log records
  101 Python tests passed, `/live.html` HTTP 403, `/live` HTTP 403,
  mirror draw date not found. Generated data was published, then exit code 1.
- Existing production `HK_FINALITY_CONTRACTS` is empty. Complete generic parsed
  boards remain `unknown` with `finality_evidence=None`. Controlled fixtures
  do not activate production acceptance.

## Actual new access checks

[`hk-stage1b-access.json`](hk-stage1b-access.json) records the actual HTTP check
on 2026-10-10 at 21:02 UTC: requested/final `/live.html`, HTTP 403, no redirects,
title `Just a moment...`, visible message to enable JavaScript/cookies, SHA256
of the raw response. No challenge HTML, cookies, headers or tokens are retained.

The normal cloud browser displayed `Tunggu sebentar...` and a Cloudflare security
verification page. One reload produced the same blocker; no additional browser
routes or bypass attempts were made. A successful result response, source date,
digit representation, prize structure, update logic and finality semantics remain
unverified. The existing collector source-error status/exit behavior is unchanged.

HK_SOURCE_ACCESS=BLOCKED; HK_FINALITY_EVIDENCE=NOT_VERIFIED;
HK_CANONICAL_E2E=NOT_VERIFIED. No finality contract or selector is guessed.
The single validated primary source may still become canonical through the
existing acceptance boundary once real evidence supports its adapter/contract.

## Completed independent changes

Deleted `.github/workflows/deploy.yml` entirely. No remaining workflow compiles
a Debug APK. New `.github/workflows/validation.yml` runs on main code changes and
PRs, with read-only permissions, full Python tests (including release guards),
JavaScript tests, web build, controlled foreground browser synchronization,
diagnostic bookmarklet tests and the preserved paito before/after viewport audit.
It has no Android compilation, signing secrets or release metadata publication.
The preexisting tolerant historical baseline viewport capture is retained; it
does not handle HK source access and cannot conceal collector failure.

The obsolete Python test requiring deploy.yml/assembleDebug is replaced with
checks for actual deletion, absence of debug compilation in every workflow,
secret-free validation and retention of important checks. Signed release guards,
the signed release workflow and existing collector/Python workflows are preserved.
README active instructions now point to validation.yml; audit documents identify
the retired workflow as historical. Old run/artifact history is not deleted.

The owner-only offline DOM diagnostic kit is documented in
[`hk-android-diagnostic.md`](hk-android-diagnostic.md). It exports a sanitized DOM
from a successfully loaded Chrome Android tab via a bookmarklet, and packages
only explicitly named captures into one Download ZIP with timestamps, URL,
observed phase/date, table rows, digit image paths and structure. It rejects
challenge/unsafe captures, exports no browser credentials/profile, and leaves
owner observations separate from backend canonical data. Failed packaging still
writes a SUMMARY ZIP and returns nonzero. No relay/infrastructure is deployed.

## Validation and preserved behavior

- Full local Python suite: 110 passed (101 baseline tests retained, 9 diagnostic cases added).
- JavaScript suite: 106 passed.
- Web build: passed, with the preexisting mixed Capacitor import warning.
- Controlled browser sync: passed; cold start, remaining on Analisis, torn-pair
  rejection, prediction catch-up, focus/resume, reload and identical canonical
  display across Analisis/Data/LiveDraw all checked.
- Diagnostic one-line bookmarklet/download, leading zeroes, sanitization and
  rejection paths are checked on controlled DOM, not the real source/device.

P1-P8 computation/weights, P5 model/visual separation, foreground reconciliation,
whole-dataset revision/fingerprint guards, canonical cache, notification behavior,
SDY/SGP, history and all visual/paito application code and assets are unchanged.
No draw data/archives are edited to force tests. Physical Android testing remains
NOT_TESTED. The preexisting clipped mobile paito control remains outside scope;
retaining its audit does not certify that layout or a physical device.

The owner must return actual DOM captures to analyze source parsing/finality.
Such captures will still not prove that the cloud collector can fetch the page.
If a relay is necessary, its requirements need owner approval before deployment.
This task ends at the Stage 1B report; no Kotlin migration or paito removal follows.
