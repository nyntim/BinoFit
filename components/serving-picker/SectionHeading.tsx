import { StyleSheet, Text } from 'react-native';
import type { Colors } from '@/constants/theme';

export function SectionHeading({ title, colors }: { title: string; colors: Pick<typeof Colors.light, 'icon'> }) {
  return (
    <Text style={[styles.sectionHeading, { color: colors.icon }]}>{title}</Text>
  );
}

const styles = StyleSheet.create({
  sectionHeading: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginTop: 8,
    marginBottom: 2,
    marginLeft: 4,
  },
});
