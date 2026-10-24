# Design references

Mockups and design-system files. These are references ([ADR 0016](../decisions/0016-design-doc-layers.md)): they show directions that were proposed or built, not specs to match. `PRODUCT.md` and `DESIGN.md` set the direction; `docs/architecture/` describes shipped behavior.

| Source | Status | Notes |
|---|---|---|
| `tokens.json` | Current | Token file for the BinoFit design system in Claude Design. Mirrors `constants/theme.ts`; resync when the theme changes. |
| `redesign/` | Current | Accepted redesign (ADR 0017): every screen as a board, with an implementation directory. Start at `redesign/README.md`. Canvas: https://claude.ai/artifact/3Qz6CX7Ct9budLf5dzHQSG |
| `training/` | Historical | Mockups the Training module was built from (October 2026). |
| `progress/` | Historical | Mockups the Progress tab was built from (October 2026). |
| `../screenshots/` | Snapshot | App screenshots; may lag the current build. |
| `../references/competitor/` | Inspiration | Other apps' screens. |

New explorations (for example in Claude Design) are linked here when a direction is chosen. Mark a folder **Superseded** when a newer direction replaces it rather than deleting it.

Reading the HTML mockups: each `.dc.html` file is one 390 px phone screen with inline styles and inline SVG icons standing in for `IconSymbol`. Sample data is illustrative. Rebuild in React Native with theme tokens; never port the HTML or CSS.
