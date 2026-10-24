import { Platform } from 'react-native';

const tintLight = '#3D4B7A';   // slate indigo, DESIGN.md slate-indigo
const tintDark  = '#8FA3D6';   // lighter slate for dark-mode readability

export const Colors = {
  light: {
    text:            '#1A1A22',   // DESIGN.md ink-primary
    background:      '#F4F0E8',   // DESIGN.md lifted paper page
    tint:            tintLight,
    tintSoft:        '#E3E6F0',   // soft buttons, selected rows, icon tiles
    onTint:          '#FBF9F5',   // text and icons on a tint fill
    overlay:         'rgba(26,26,34,0.42)',
    icon:            '#5E5E6E',   // DESIGN.md ink-secondary
    tabIconDefault:  '#5E5E6E',
    tabIconSelected: tintLight,
    navSurface:     'rgba(251,249,245,0.74)',
    navOpaque:      '#FBF9F5',
    navBorder:      'rgba(26,26,34,0.08)',
    navActive:      '#E3E6F0',   // tintSoft
    navActivePressed: '#D6DBE8',
    navShadow:      '#1A1A22',
    cardBackground:  '#FBF9F5',   // cards lift above the page
    cardSecondary:   '#EDE8DE',   // nested surfaces: fields, tracks, chips at rest
    raised:          '#FBF9F5',   // selected segment, stepper buttons
    sheetBackground: '#FBF9F5',
    separator:       '#E2DDD2',
    fieldBorder:     '#D9D3C7',   // outlined input at rest
    track:           '#E4DFD4',   // ring and bar tracks
    chartBar:        '#A9A4A0',   // resting chart bars
    success:         '#1E7A45',
    successSoft:     '#DDEFE4',
    danger:          '#B3261E',
    dangerSoft:      '#F8E1DE',
    ember:           '#C2410C',   // acknowledgement only: streaks, records, celebrations
    emberSoft:       '#FBE6D9',
  },
  dark: {
    text:            '#EDEDF0',   // graphite near-white
    background:      '#0E0E10',   // graphite near-black
    tint:            tintDark,
    tintSoft:        'rgba(143,163,214,0.16)',
    onTint:          '#0E0E10',
    overlay:         'rgba(0,0,0,0.55)',
    icon:            '#9A9AA3',   // cool mid-gray
    tabIconDefault:  '#9A9AA3',
    tabIconSelected: tintDark,
    navSurface:     'rgba(36,36,40,0.74)',
    navOpaque:      '#242428',
    navBorder:      'rgba(237,237,240,0.12)',
    navActive:      'rgba(143,163,214,0.16)',   // tintSoft
    navActivePressed: 'rgba(143,163,214,0.26)',
    navShadow:      '#000000',
    cardBackground:  '#1A1A1D',   // graphite card
    cardSecondary:   '#242428',   // graphite secondary
    raised:          '#3A3A40',
    sheetBackground: '#1F1F23',
    separator:       'rgba(237,237,240,0.10)',  // cool white hairline
    fieldBorder:     'rgba(237,237,240,0.28)',  // stronger so inputs read as tappable
    track:           'rgba(237,237,240,0.14)',  // visible against cardBackground
    chartBar:        '#5A5A62',
    success:         '#52D68A',   // brighter for dark backgrounds
    successSoft:     'rgba(82,214,138,0.14)',
    danger:          '#FF8A80',   // brighter for dark backgrounds
    dangerSoft:      'rgba(255,138,128,0.14)',
    ember:           '#FF8A3D',
    emberSoft:       'rgba(255,138,61,0.14)',
  },
};

// Cards lift with a soft shadow in light mode; dark mode gets depth from the lighter surface instead.
export const Shadows = {
  light: {
    card: '0 1px 2px rgba(26,26,34,0.05), 0 6px 20px rgba(26,26,34,0.06)',
    floating: '0 10px 30px rgba(14,14,16,0.25)',
    segment: '0 1px 3px rgba(26,26,34,0.12)',
  },
  dark: {
    card: 'none',
    floating: '0 10px 30px rgba(14,14,16,0.25)',
    segment: '0 1px 3px rgba(0,0,0,0.3)',
  },
};

export const MacroColors = {
  protein: '#E74C3C',   // DESIGN.md protein-signal
  carbs:   '#F39C12',   // DESIGN.md carb-signal
  fat:     '#3498DB',   // DESIGN.md fat-signal
  accent:  '#FFF260',
};

// Pale tints marking what the food being picked adds to a target bar
export const TargetTints = {
  light: { energy: '#A9AEC4', protein: '#F0B1A9', carbs: '#F5D299', fat: '#A8CDE8' },
  dark:  { energy: '#C9D3F0', protein: '#F4A59B', carbs: '#F8CF8A', fat: '#9FCFF0' },
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
