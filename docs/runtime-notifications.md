# Runtime freshness and Android notifications

## Separate freshness layers

AdiPredictor deliberately keeps two result layers separate:

- A structurally valid LiveDraw board may immediately update the **displayed latest result** in the running app.
- Only the repository collector may append the persistent historical dataset and trigger P1–P8.

When LiveDraw is ahead, Analysis labels the value as `LiveDraw terbaru`, hides the old prediction, triggers an immediate data refresh, and retries every 12 seconds for at most 20 attempts. Matching dataset date and number reconcile without inserting a duplicate. A same-date disagreement is reported as `LIVE_DATASET_CONFLICT`; the persistent verified dataset remains the prediction authority.

## Collector health

The app polling interval and backend collector are different systems. The UI reports them separately. A published source-check timestamp is classified as normal through 25 minutes, delayed through 90 minutes, and stale afterward. Because unchanged scheduled checks intentionally do not create timestamp-only commits, this label is the age of the latest **published** source check, not proof of exact GitHub scheduler execution.

The GitHub schedule keeps a 10-minute cadence at minutes `3,13,23,33,43,53` to avoid the busiest exact hour boundaries. GitHub Actions may still queue or delay a scheduled run; the UI therefore never promises exact real-time execution.

## Native notifications

The Android build uses `@capacitor/local-notifications` 6.x, compatible with Capacitor 6. Permission is requested only after the user enables notifications in Settings. Result, prediction, audit, LiveDraw reminder, and stable-update categories can be controlled separately.

Deterministic event keys are persisted locally, so repeated app refreshes do not repeat the same notification. Result notifications require a verified dataset row; an ephemeral LiveDraw overlay never emits a verified-result notification.

Scheduled draw reminders can fire while the app is not open. New-result, prediction-ready, and audit-ready notifications are generated only when the application processes a newer remote snapshot. There is currently no push backend or WorkManager result scraper, so those data-change notifications are not claimed to work while the app is fully terminated.
