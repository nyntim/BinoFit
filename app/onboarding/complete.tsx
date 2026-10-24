import { useEffect, useRef, useState } from 'react';
import { Alert, Image, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { MacroColors } from '@/constants/theme';
import { useThemeColor } from '@/hooks/use-theme-color';
import { getDatabase } from '@/lib/database';
import { getUserGoals, setOnboardingComplete } from '@/lib/storage';
import { homeRouteFor } from '@/lib/tracking-mode';
import type { UserGoals } from '@/lib/types';

/** Static confetti behind the header: no motion, so Reduce Motion needs nothing. */
function Decoration() {
  const ember = useThemeColor({}, 'ember');
  const tint = useThemeColor({}, 'tint');
  const icon = useThemeColor({}, 'icon');
  return (
    <View
      style={styles.decoration}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View style={[styles.dot, { top: 120, left: 64, width: 12, height: 12, backgroundColor: ember }]} />
      <View style={[styles.dot, { top: 100, right: 66, width: 10, height: 10, backgroundColor: tint }]} />
      <View style={[styles.bar, { top: 210, right: 72, backgroundColor: MacroColors.carbs, transform: [{ rotate: '30deg' }] }]} />
      <View style={[styles.bar, { top: 240, left: 54, backgroundColor: MacroColors.fat, transform: [{ rotate: '-25deg' }] }]} />
      <View style={[styles.dot, { top: 330, left: 106, width: 8, height: 8, backgroundColor: MacroColors.protein }]} />
      <View style={[styles.dot, { top: 320, right: 94, width: 12, height: 12, backgroundColor: ember, opacity: 0.6 }]} />
      <View style={[styles.stroke, { top: 180, left: 40, backgroundColor: icon, transform: [{ rotate: '-45deg' }] }]} />
      <View style={[styles.stroke, { top: 160, right: 40, backgroundColor: icon, transform: [{ rotate: '45deg' }] }]} />
      <View style={[styles.stroke, { top: 280, right: 52, backgroundColor: icon }]} />
    </View>
  );
}

export default function CompleteScreen() {
  const background = useThemeColor({}, 'background');
  const emberSoft = useThemeColor({}, 'emberSoft');
  const [goals, setGoals] = useState<UserGoals | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    // Initialize DB in background while user reads the screen
    getDatabase().catch(console.error);
    let active = true;
    getUserGoals().then((g) => { if (active) setGoals(g); }).catch(() => {});
    return () => { active = false; };
  }, []);

  async function handleStart() {
    if (busy.current) return;
    busy.current = true;
    try {
      await setOnboardingComplete();
    } catch {
      busy.current = false;
      Alert.alert('Could not finish setup', 'Try again.');
      return;
    }
    router.replace(homeRouteFor());
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: background }]}>
      <Decoration />
      <ScrollView contentContainerStyle={styles.scroll} bounces={false}>
        <View style={styles.hero}>
          <View style={[styles.halo, { backgroundColor: emberSoft }]} accessible={false}>
            <Image source={require('@/assets/images/icon.png')} style={styles.dino} accessible={false} />
          </View>
          <ThemedText type="heading" accessibilityRole="header" style={styles.title}>You&apos;re all set</ThemedText>
          {goals && (
            <View style={styles.chips}>
              <Chip
                label={`${goals.calorie_goal.toLocaleString('en-US')} cal`}
                accessibilityLabel={`${goals.calorie_goal.toLocaleString('en-US')} calories a day`}
                surface="card"
              />
              <Chip
                label={`${goals.protein_goal.toLocaleString('en-US')} g protein`}
                accessibilityLabel={`${goals.protein_goal.toLocaleString('en-US')} grams of protein`}
                surface="card"
              />
            </View>
          )}
        </View>

        <View style={styles.spacer} />
        <Button label="Go to Today" size="lg" onPress={handleStart} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  decoration: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  dot: { position: 'absolute', borderRadius: 6 },
  bar: { position: 'absolute', width: 12, height: 5, borderRadius: 2.5 },
  stroke: { position: 'absolute', width: 8, height: 2.5, borderRadius: 1.25, opacity: 0.4 },
  scroll: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 48, paddingBottom: 24, gap: 22 },
  hero: { alignItems: 'center', gap: 14 },
  halo: { width: 148, height: 148, borderRadius: 74, alignItems: 'center', justifyContent: 'center' },
  dino: { width: 124, height: 124 },
  title: { fontSize: 36, lineHeight: 40, letterSpacing: -0.6, textAlign: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  spacer: { flex: 1 },
});
