# 0012. Hand-rolled charts with fixed ranges

- **Status:** Accepted
- **Date:** 2026-10-17
- **Links:** `docs/architecture/progress.md`, `docs/design/progress/`

## Context
Progress needs a calorie trend, macro averages, consistency, weight and training charts. Chart libraries for React Native are heavy and hard to theme precisely.

## Decision
- Charts are hand-rolled SVG on `react-native-svg`. No chart library.
- Range chips 7D, 30D, 90D and All, rolling and ending today, default 7D.
- 7D and 30D draw one bar per day; 90D one per week; All one per week up to about 26 weeks, then one per month.
- The current calorie goal is drawn as a reference line (goals have no history).
- Tapping a daily bar or past calendar day opens that day; weekly and monthly bars only select.

## Alternatives considered
- A chart library (Victory, Skia-based charts): faster to start, larger bundle, less control over theming and accessibility.

## Consequences
- Chart styling (bar colors, highlight, annotations, motion) is ours to design and is open territory in `DESIGN.md`.
- Every chart needs a text alternative for screen readers.
