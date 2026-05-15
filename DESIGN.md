---
name: BinoFit
description: Calm, precise nutrition tracking for people who care about what they eat, not how the app makes them feel
colors:
  warm-paper: "#F8F5EF"
  card-surface: "#EEEAE2"
  card-subtle: "#E4E0D6"
  ink-primary: "#1A1A22"
  ink-secondary: "#606070"
  slate-indigo: "#3D4B7A"
  separator: "#D6D2C8"
  protein-signal: "#E74C3C"
  carb-signal: "#F39C12"
  fat-signal: "#3498DB"
  success: "#27AE60"
typography:
  display:
    fontFamily: "System, -apple-system, SF Pro Display, sans-serif"
    fontSize: "34px"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.5px"
  headline:
    fontFamily: "System, -apple-system, SF Pro Display, sans-serif"
    fontSize: "22px"
    fontWeight: 600
    lineHeight: 1.2
  title:
    fontFamily: "System, -apple-system, SF Pro Text, sans-serif"
    fontSize: "17px"
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: "System, -apple-system, SF Pro Text, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "System, -apple-system, SF Pro Text, sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.4
  caption:
    fontFamily: "System, -apple-system, SF Pro Text, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.4
rounded:
  sharp: "4px"
  sm: "8px"
  md: "12px"
  lg: "18px"
  pill: "20px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "20px"
  xl: "24px"
  xxl: "40px"
components:
  button-primary:
    backgroundColor: "{colors.slate-indigo}"
    textColor: "{colors.warm-paper}"
    rounded: "{rounded.lg}"
    padding: "12px 24px"
  button-primary-hover:
    backgroundColor: "#2E3960"
    textColor: "{colors.warm-paper}"
    rounded: "{rounded.lg}"
    padding: "12px 24px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.slate-indigo}"
    rounded: "{rounded.md}"
    padding: "10px 20px"
  card:
    backgroundColor: "{colors.card-surface}"
    textColor: "{colors.ink-primary}"
    rounded: "{rounded.lg}"
    padding: "{spacing.lg}"
  input-field:
    backgroundColor: "{colors.card-subtle}"
    textColor: "{colors.ink-primary}"
    rounded: "{rounded.sm}"
    padding: "{spacing.md}"
  chip-filter:
    backgroundColor: "{colors.card-subtle}"
    textColor: "{colors.ink-secondary}"
    rounded: "{rounded.pill}"
    padding: "6px 14px"
  chip-filter-active:
    backgroundColor: "{colors.slate-indigo}"
    textColor: "{colors.warm-paper}"
    rounded: "{rounded.pill}"
    padding: "6px 14px"
---

# Design System: BinoFit

## 1. Overview

**Creative North Star: "The Reference Book"**

BinoFit's visual system is built on the premise that a nutrition tracker should feel like a precise, well-worn reference tool: the kind of object that earns authority through consistent legibility and careful restraint, not decoration. Think of a well-printed field guide or a scientific reference manual — warm paper surfaces, high-contrast ink, dense but organized information, and a single annotation color that marks only what demands attention.

The system says nothing about food choices. It presents data and steps aside. Warm off-white surfaces replace clinical whites; a single slate-indigo accent replaces the generic teal of health-tech convention. Surfaces are layered by lightness, not lifted by shadow — sections in a document, not floating cards in an app.

This is not a system that rewards itself. Every element present is there because it helps the user understand their nutrition picture faster. Every element removed was asking for attention it had not earned. The Cronometer + Linear lineage means: data density that is organized, not overwhelming, and no decorative chrome of any kind.

**Key Characteristics:**
- Warm paper-like surfaces: the page has texture without texture
- Single-accent discipline: slate indigo appears on interactive elements and data-primary highlights only
- Numbers feel authoritative at a glance: tabular figures, weight contrast, clear hierarchy
- No shadows: surfaces are sections, not floating cards
- Macro signal colors are semantic, not decorative: protein/carb/fat use color only to differentiate nutrient type

## 2. Colors: The Reference Palette

A restrained palette anchored in warm paper neutrals with one precise signal color. The accent appears nowhere decoratively.

### Primary
- **Slate Indigo** (#3D4B7A / oklch(45% 0.09 265)): The single interactive signal. Used on the calorie ring stroke, active states, pressed elements, and focused inputs. Its rarity is what makes it meaningful. If you are reaching for it outside those contexts, stop.

### Neutral
- **Warm Paper** (#F8F5EF): Page background. Warm off-white with a faint warm bias. Not the cool gray of iOS system defaults (#f2f2f7). Not clinical white. The warmth reads as paper.
- **Card Surface** (#EEEAE2): Primary card and section background. Slightly deeper than the page, creating tonal separation without shadow.
- **Card Subtle** (#E4E0D6): Nested surfaces, input backgrounds, secondary containers.
- **Ink Primary** (#1A1A22): Body text, headings, primary data values. Near-black with a barely-perceptible cool undertone that sits in harmony with the slate indigo accent.
- **Ink Secondary** (#606070): Labels, secondary metadata, icons at rest. Legible but recessive.
- **Separator** (#D6D2C8): Dividers and row borders. Warm neutral; not stark.

### Signal (Macro Only)
- **Protein Signal** (#E74C3C): Protein macro visualization exclusively.
- **Carb Signal** (#F39C12): Carbohydrate macro visualization exclusively.
- **Fat Signal** (#3498DB): Fat macro visualization exclusively.
- **Success** (#27AE60): Goal-reached states only.

### Named Rules
**The One Accent Rule.** Slate indigo appears on interactive elements and calorie ring stroke only. It occupies less than 10% of any given screen. That scarcity is the signal; dilute it and it loses its function.

**The Signal Isolation Rule.** Protein red, carb amber, and fat blue are reserved strictly for macro visualization. They never appear on navigation, UI chrome, or decorative elements. Seeing these colors means one thing: macros.

**The Warm Neutral Rule.** Every neutral surface carries a faint warm bias (minimum chroma 0.005 toward 85 hue). Pure gray (#888888) and pure white (#ffffff) are prohibited. Black (#000000) is prohibited. The palette reads as paper, not a screen.

## 3. Typography

**Primary Font:** System font stack (SF Pro Text on iOS, Roboto on Android, -apple-system on web)
**Display / Data Font:** System display variant (SF Pro Display on iOS) — leverages system tabular-figure rendering for nutrition values

**Character:** Hierarchy is built entirely through weight contrast and scale. No decorative typefaces, no custom fonts. Numbers at any size should feel precise and authoritative, like a well-typeset almanac entry, not soft or approximate.

### Hierarchy
- **Display** (700, 34px, line-height 1.1): Calorie ring center value. The single most important number on the screen. Used only here.
- **Headline** (700, 22px, line-height 1.2): Calorie summary stats (consumed, remaining, burned). High-emphasis data values where the number is the message.
- **Title** (600, 17px, line-height 1.3): Card labels, section headers, screen navigation titles, macro totals.
- **Body** (400, 15px, line-height 1.5): Food log entry names, descriptions, search results. 65 characters max per line.
- **Label** (500, 13px, line-height 1.4): Date labels, serving amounts, macro gram labels, metadata. The workhorse of dense information.
- **Caption** (400, 12px, line-height 1.4): Timestamps, stat sub-labels (e.g. "kcal" under a calorie number), tertiary data.

### Named Rules
**The Tabular Figures Rule.** All nutrition data (calorie counts, gram values, percentages) must render with tabular/monospaced figure spacing. Columns of numbers that shift width as values change break the reference-book calm. On iOS, SF Pro Mono or the `tabular-nums` font feature achieves this.

**The Weight Contrast Rule.** Minimum 1.5 weight-step gap between adjacent hierarchy levels. A Title at 600 pairs with Body at 400, never at 500. Flat weight scales read as undifferentiated. Contrast creates structure.

## 4. Elevation

BinoFit is a flat system. No box shadows, no drop shadows, no blurred layers. Depth is communicated entirely through tonal steps on the warm neutral scale: pages sit at Warm Paper (#F8F5EF), cards at Card Surface (#EEEAE2), nested inputs at Card Subtle (#E4E0D6).

This is deliberate. A reference book does not have floating cards. The visual language is sections and ink, not objects and depth. The result is calm at high information density: the eye does not parse overlapping layers, only the data.

### Named Rules
**The Flat-By-Default Rule.** When a new surface is needed and a shadow seems tempting, use the next tonal step on the warm-neutral scale. If three tonal steps are exhausted, reconsider whether a new surface is necessary at all. If there is a fourth level of nesting, the layout has a structural problem, not an elevation problem.

## 5. Components

The feel is **precise and functional**: tool-grade clarity, clear affordance, interactions that confirm without performance. Nothing should feel soft, playful, or casual.

### Buttons
- **Shape:** Gently rounded (18px radius, `{rounded.lg}`). Not pill-shaped, not square. Readable without being friendly.
- **Primary:** Slate indigo background (#3D4B7A), warm paper text (#F8F5EF), 12px vertical / 24px horizontal padding, Title weight (600).
- **Press / Active:** Darkens to #2E3960. Opacity 0.85 during active press. No scale transform, no bounce.
- **Ghost:** Transparent background, slate indigo text, 1px separator-colored border (#D6D2C8). Used for secondary actions on shared surfaces.
- **Focus (WCAG AA):** 2px slate indigo outline, 3px offset. Keyboard and screen-reader accessible on all button variants.

### Cards / Sections
- **Corner Style:** 18px radius (`{rounded.lg}`)
- **Background:** Card Surface (#EEEAE2)
- **Shadow:** None. Tonal contrast with the Warm Paper page background defines the edge.
- **Border:** None.
- **Internal Padding:** 20px uniform (`{spacing.lg}`). Secondary/supporting cards use 16px (`{spacing.md}`).
- **Bottom Margin:** 14px between adjacent cards.

### Inputs / Fields
- **Style:** Card Subtle (#E4E0D6) background, no border at rest, 8px radius (`{rounded.sm}`). Blends into the card surface it sits on.
- **Focus:** 1.5px slate indigo border appears. Background shifts to Card Surface (#EEEAE2). No glow, no shadow.
- **Placeholder:** Ink Secondary (#606070).
- **Disabled:** 50% opacity. Shape unchanged.
- **Error:** Border shifts to Danger (#E74C3C). No background fill change.

### Chips / Filter Pills
- **Unselected:** Card Subtle (#E4E0D6) background, Ink Secondary text, 20px radius (`{rounded.pill}`), 6px vertical / 14px horizontal padding.
- **Selected / Active:** Slate indigo background (#3D4B7A), Warm Paper text. No border in either state.

### Macro Bar
- **Height:** 8px
- **Radius:** 4px (`{rounded.sharp}`) — slightly less rounded than cards; precision over softness
- **Track:** Separator (#D6D2C8). Fill uses the three macro signal colors.
- **Layout:** Label left, gram value right at Label scale. Bar spans full width below, with 4px gap.
- **Stack gap:** 4px between protein, carb, and fat bars.

### Calorie Ring
- **Diameter:** 164px default
- **Stroke Width:** 14px — substantial enough to read progress at a glance
- **Track:** Separator (#D6D2C8)
- **Fill:** Slate indigo (#3D4B7A). One color, not segmented.
- **Center:** Display-scale calorie number (34px, 700), Caption-scale "kcal" label below in Ink Secondary.

### Navigation (Bottom Tab Bar)
- **Background:** Warm Paper (#F8F5EF)
- **Active icon:** Slate indigo (#3D4B7A). Active label: Ink Primary, Title weight.
- **Inactive icon:** Ink Secondary (#606070). Inactive label: Ink Secondary, Body weight.
- **Top border:** 1px Separator (#D6D2C8). No shadow.

### Food Log Row
- **Name:** Body scale (400, 15px), Ink Primary. Single line with ellipsis truncation.
- **Serving:** Caption scale (400, 12px), Ink Secondary. Below the name.
- **Calorie value:** Label scale (700, 13px), Ink Primary, right-aligned.
- **Row separator:** 1px Separator line. No card wrapping per row.
- **Swipe-delete action:** Slate indigo background, Warm Paper trash icon. Never red.

## 6. Do's and Don'ts

### Do:
- **Do** use Warm Paper (#F8F5EF) for page backgrounds and Card Surface (#EEEAE2) for elevated sections. The warm bias is intentional — it reads as paper, not a screen.
- **Do** reserve slate indigo exclusively for interactive elements, active states, and the calorie ring. Its scarcity is its power.
- **Do** use weight contrast of at least 1.5 steps between adjacent hierarchy levels. Title at 600 pairs with Body at 400, never with Label at 500.
- **Do** apply tabular figure spacing to all numeric nutrition values (calories, grams, percentages). Columns of numbers must not shift width as values change.
- **Do** convey depth through tonal layering: Warm Paper → Card Surface → Card Subtle. Three tonal steps is the maximum.
- **Do** use the three macro signal colors exclusively for protein, carbohydrate, and fat visualization. They are semantic identifiers.
- **Do** match the WCAG AA standard: 4.5:1 contrast ratio for body text and labels, 3:1 for UI components and large text.

### Don't:
- **Don't** use teal, wellness green, or any health-app-adjacent accent. The outgoing #0a7ea4 is the anti-pattern. It reads as generic health tech at a glance and is explicitly retired.
- **Don't** use coaching tone, streak celebrations, gamification badges, or behavioral-nudge visual patterns (the Noom / WW anti-reference). The design is neutral about food choices. No red warnings, no green celebrations.
- **Don't** add shadows to cards or surfaces. Tonal separation is sufficient. If it isn't, the layout has a structural problem.
- **Don't** apply macro signal colors (protein red, carb amber, fat blue) to navigation, buttons, icons, or any non-macro UI element.
- **Don't** use identical card grids with icon + heading + text repeated without variation. Each section has a distinct data structure and should look distinct.
- **Don't** use border-left or border-right stripes greater than 1px as colored accents on list items, cards, or callouts. Use background tints or leading icons instead.
- **Don't** use pure black (#000000) or pure white (#ffffff). Every neutral carries a warm bias (minimum chroma 0.005 toward hue 85).
- **Don't** default to iOS system grays (#f2f2f7 cards, #ffffff backgrounds) on new screens. BinoFit has its own warm neutral palette — the system grays read as unstyled.
- **Don't** use motivational copy, gradient text, or binary red/green judgment colors. Color signals actionable data only.
