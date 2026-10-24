import { StyleSheet, Text, type TextProps } from 'react-native';

import { Fonts } from '@/constants/theme';
import { useThemeColor } from '@/hooks/use-theme-color';

export type ThemedTextType =
  | 'default'
  | 'title'
  | 'defaultSemiBold'
  | 'subtitle'
  | 'link'
  | 'largeTitle'
  | 'heading'
  | 'hero'
  | 'stat'
  | 'body'
  | 'label'
  | 'caption'
  | 'section';

export type ThemedTextProps = TextProps & {
  lightColor?: string;
  darkColor?: string;
  type?: ThemedTextType;
};

// Secondary types read in the `icon` ink; links in `tint`; everything else in `text`
const MUTED_TYPES: ThemedTextType[] = ['caption', 'section'];

export function ThemedText({
  style,
  lightColor,
  darkColor,
  type = 'default',
  ...rest
}: ThemedTextProps) {
  const colorName = type === 'link' ? 'tint' : MUTED_TYPES.includes(type) ? 'icon' : 'text';
  const color = useThemeColor({ light: lightColor, dark: darkColor }, colorName);

  return <Text style={[{ color }, styles[type], style]} {...rest} />;
}

const styles = StyleSheet.create({
  default: {
    fontSize: 16,
    lineHeight: 24,
  },
  defaultSemiBold: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '600',
  },
  // Card and row titles; the old 32 pt bold screen title is now `largeTitle`
  title: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '600',
  },
  subtitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  link: {
    lineHeight: 30,
    fontSize: 16,
  },
  largeTitle: {
    fontFamily: Fonts.rounded,
    fontSize: 34,
    lineHeight: 38,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  heading: {
    fontFamily: Fonts.rounded,
    fontSize: 30,
    lineHeight: 35,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  // 40 to 64 by context; override fontSize and lineHeight together
  hero: {
    fontFamily: Fonts.rounded,
    fontSize: 48,
    lineHeight: 52,
    fontWeight: '800',
    letterSpacing: -1,
    fontVariant: ['tabular-nums'],
  },
  // 20 to 26 by context
  stat: {
    fontFamily: Fonts.rounded,
    fontSize: 22,
    lineHeight: 26,
    fontWeight: '800',
    letterSpacing: -0.3,
    fontVariant: ['tabular-nums'],
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
  },
  label: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  caption: {
    fontSize: 12,
    lineHeight: 16,
  },
  section: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    paddingHorizontal: 4,
  },
});
