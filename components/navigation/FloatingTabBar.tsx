import { useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { Keyboard, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HapticTab } from '@/components/haptic-tab';
import { ActiveWorkoutBar } from '@/components/workouts/ActiveWorkoutBar';
import { TabBarSurface } from '@/components/navigation/TabBarSurface';
import { useSetTabBarInset } from '@/context/TabBarInsetContext';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useActiveWorkout } from '@/hooks/useActiveWorkout';
import { useShadow } from '@/hooks/useShadow';

const tabs = {
  index: { label: 'Nutrition', icon: 'restaurant-outline' },
  training: { label: 'Training', icon: 'barbell-outline' },
  progress: { label: 'Progress', icon: 'stats-chart-outline' },
  settings: { label: 'Settings', icon: 'settings-outline' },
} as const;

export function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const safe = useSafeAreaInsets();
  const setInset = useSetTabBarInset();
  const { workout } = useActiveWorkout();
  const [keyboardVisible, setKeyboardVisible] = useState(() => Keyboard.isVisible());
  const [lastHeight, setLastHeight] = useState(72 + safe.bottom);
  const [pressedKey, setPressedKey] = useState<string | null>(null);
  const surface = useThemeColor({}, 'cardBackground');
  const border = useThemeColor({}, 'navBorder');
  const shadow = useShadow('floating');
  const active = useThemeColor({}, 'navActive');
  const activePressed = useThemeColor({}, 'navActivePressed');
  const icon = useThemeColor({}, 'icon');
  const tint = useThemeColor({}, 'tint');

  useEffect(() => {
    const showEvent = process.env.EXPO_OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = process.env.EXPO_OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, () => setKeyboardVisible(true));
    const hide = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  useEffect(() => { setInset(keyboardVisible ? 0 : lastHeight); }, [keyboardVisible, lastHeight, setInset]);

  if (keyboardVisible) return null;
  return (
    <View
      testID="floating-overlay"
      pointerEvents="box-none"
      style={[styles.overlay, { paddingBottom: safe.bottom + 8, paddingLeft: 16 + safe.left, paddingRight: 16 + safe.right }]}
      onLayout={(event) => {
        const height = event.nativeEvent.layout.height;
        setLastHeight(height);
        setInset(height);
      }}
    >
      <View pointerEvents="box-none" style={styles.stack}>
        {workout ? <View style={[styles.session, { backgroundColor: surface, borderColor: border, boxShadow: shadow }]}><View style={styles.sessionClip}><ActiveWorkoutBar /></View></View> : null}
        <View style={[styles.shadow, { boxShadow: shadow }]}>
          <TabBarSurface>
            <View style={styles.row}>
              {state.routes.map((route, index) => {
                const tab = tabs[route.name as keyof typeof tabs];
                if (!tab) return null;
                const focused = state.index === index;
                const options = descriptors[route.key].options;
                const label = options.tabBarAccessibilityLabel ?? tab.label;
                const pressed = pressedKey === route.key;
                return (
                  <HapticTab
                    key={route.key}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: focused }}
                    accessibilityLabel={label}
                    testID={options.tabBarButtonTestID}
                    onPress={() => {
                      const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                      if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
                    }}
                    onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
                    onPressIn={() => setPressedKey(route.key)}
                    onPressOut={() => setPressedKey(null)}
                    style={[styles.item, focused && { backgroundColor: pressed ? activePressed : active }, pressed && !focused && styles.pressed]}
                  >
                    <Ionicons name={tab.icon} size={26} color={focused ? tint : icon} accessible={false} importantForAccessibility="no" />
                  </HapticTab>
                );
              })}
            </View>
          </TabBarSurface>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', bottom: 0, left: 0, right: 0, alignItems: 'center' },
  stack: { width: '100%', maxWidth: 440, gap: 8 },
  // Live workout accessory pill above the shell; solid surface, not material
  session: { minHeight: 54, borderRadius: 27, borderWidth: 1 },
  sessionClip: { flex: 1, borderRadius: 27, overflow: 'hidden', justifyContent: 'center' },
  shadow: { borderRadius: 32 },
  row: { height: 64, padding: 8, flexDirection: 'row', alignItems: 'center' },
  item: { flex: 1, height: 48, minWidth: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.7 },
});
