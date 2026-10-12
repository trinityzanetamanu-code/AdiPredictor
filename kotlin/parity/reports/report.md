# Python ↔ Kotlin parity
Status: PASS
Frozen source: d22097ffc4772d0436b4deb9bb647a82c77ffed1
Mismatch count: 0

| Case | Records | Python seconds | Kotlin seconds |
|---|---:|---:|---:|
| hk-latest | 1380 | 66.982 | 6.196 |
| hk-2026-09-30 | 1369 | 65.579 | 5.384 |
| hk-2026-10-10 | 1379 | 73.950 | 5.371 |
| sdy-latest | 1380 | 66.105 | 5.380 |
| sdy-2026-09-30 | 1369 | 67.490 | 5.272 |
| sdy-2026-10-10 | 1379 | 68.515 | 5.241 |
| sgp-latest | 986 | 35.375 | 3.047 |
| sgp-2026-09-30 | 978 | 31.786 | 2.910 |
| sgp-2026-10-10 | 985 | 32.395 | 2.974 |
| archive-tie-regression | 1369 | 67.131 | 5.049 |
| hk-identical-repeat | 1380 | 62.937 | 4.980 |
| hk-zero-result | 380 | 0.594 | 0.086 |

All published JSON fields compare exactly; only unpublished matrices permit 1e-13 absolute error.
SVG tags, attributes, coordinates, digits, labels and path order compare exactly.
Measurements are sequential compute wall times on the same host; JVM warmup and host load affect timings.
Production files: UNCHANGED

Mismatch paths:
