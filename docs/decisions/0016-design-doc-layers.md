# 0016. Design docs: principles, invariants, baseline, references

- **Status:** Accepted
- **Date:** 2026-10-23
- **Links:** #98, `PRODUCT.md`, `DESIGN.md`, `docs/design/README.md`

## Context
Design guidance had grown into a rulebook: exact hex values with "if you are reaching for it, stop" rules, per-component pixel specs, phase plans that required screens to match mockups, and separate precedence rules in each mockup folder ("the plan wins on behavior, the mockup wins on layout"). Exceptions piled up (streak flame, glass, smaller Edit button), and the rules discouraged trying anything new.

## Decision
Design guidance has four layers, highest first:
1. **Principles** (`PRODUCT.md`): who it is for, how it should feel, the few lines we do not cross.
2. **Invariants** (`DESIGN.md`, short list): accessibility, color that never judges, tokens through the theme, and the accepted decisions in this folder. Changing one needs an ADR.
3. **Baseline** (`DESIGN.md`, `constants/theme.ts`): the current palette, type, spacing, components and states. It describes what exists, not what must be. A change that improves on it is welcome; update the baseline and theme in the same change.
4. **References** (`docs/design/`, screenshots, competitor captures): mockups and inspiration. They show past or proposed directions and are not specs.

Where layers disagree, the higher one wins. Shipped behavior described in `docs/architecture/` wins over any mockup.

## Alternatives considered
- Keep a strict spec and add exceptions as they come up: predictable, but every new idea becomes an exception.
- No design doc at all: maximum freedom, no consistency.

## Consequences
- Builders and reviewers check invariants and consistency, not pixel matches to old mockups.
- The phase plans are gone; their lasting decisions are 0001 to 0013.
- New explorations (for example in Claude Design) are free within the invariants; once a direction is chosen, it becomes the new baseline.
