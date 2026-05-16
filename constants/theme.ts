import { Platform } from 'react-native';

const tintLight = '#3D4B7A';   // slate indigo — DESIGN.md slate-indigo
const tintDark  = '#8FA3D6';   // lighter slate for dark-mode readability

export const Colors = {
  light: {
    text:            '#1A1A22',   // DESIGN.md ink-primary
    background:      '#F8F5EF',   // DESIGN.md warm-paper
    tint:            tintLight,
    icon:            '#606070',   // DESIGN.md ink-secondary
    tabIconDefault:  '#606070',
    tabIconSelected: tintLight,
    cardBackground:  '#EEEAE2',   // DESIGN.md card-surface
    cardSecondary:   '#E4E0D6',   // DESIGN.md card-subtle
    separator:       '#D6D2C8',   // DESIGN.md separator
    success:         '#27AE60',
    danger:          '#E74C3C',
  },
  dark: {
    text:            '#F0EDE6',   // warm near-white
    background:      '#1C1917',   // warm-tinted deep dark
    tint:            tintDark,
    icon:            '#98928A',   // warm mid-gray
    tabIconDefault:  '#98928A',
    tabIconSelected: tintDark,
    cardBackground:  '#272320',   // warm dark card
    cardSecondary:   '#322D29',   // warm dark secondary
    separator:       'rgba(240,237,230,0.12)',  // warm white hairline
    success:         '#52D68A',   // brighter for dark backgrounds
    danger:          '#FF6E6E',   // brighter for dark backgrounds
  },
};

export const MacroColors = {
  protein: '#E74C3C',   // DESIGN.md protein-signal
  carbs:   '#F39C12',   // DESIGN.md carb-signal
  fat:     '#3498DB',   // DESIGN.md fat-signal
  accent:  '#FFF260',
};

export const Fonts = Platform.select({
  ios: {
    sans:    'system-ui',
    serif:   'ui-serif',
    rounded: 'ui-rounded',
    mono:    'ui-monospace',
  },
  default: {
    sans:    'normal',
    serif:   'serif',
    rounded: 'normal',
    mono:    'monospace',
  },
  web: {
    sans:    "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif:   "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono:    "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
