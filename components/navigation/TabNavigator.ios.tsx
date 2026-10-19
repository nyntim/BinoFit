import { Platform } from 'react-native';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { ActiveWorkoutBar } from '@/components/workouts/ActiveWorkoutBar';
import { useActiveWorkout } from '@/hooks/useActiveWorkout';
import { useThemeColor } from '@/hooks/use-theme-color';
import { TabBarInsetProvider } from '@/context/TabBarInsetContext';
import JsTabNavigator from '@/components/navigation/JsTabNavigator';

export default function TabNavigator() {
  if (Number(Platform.Version) < 26) return <JsTabNavigator />;
  return <NativeTabNavigator />;
}

export function NativeTabNavigator() {
  const { workout } = useActiveWorkout();
  const tint = useThemeColor({}, 'tint');
  const icon = useThemeColor({}, 'icon');

  return (
    <TabBarInsetProvider mode="automatic">
      <NativeTabs
        tintColor={tint}
        iconColor={{ default: icon, selected: tint }}
        minimizeBehavior="never"
        disableTransparentOnScrollEdge
      >
        <NativeTabs.Trigger name="index" accessibilityLabel="Nutrition" disableScrollToTop disablePopToTop>
          <NativeTabs.Trigger.Icon sf="fork.knife" />
          <NativeTabs.Trigger.Label hidden>Nutrition</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="training" accessibilityLabel="Training" disableScrollToTop disablePopToTop>
          <NativeTabs.Trigger.Icon sf="dumbbell" />
          <NativeTabs.Trigger.Label hidden>Training</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="progress" accessibilityLabel="Progress" disableScrollToTop disablePopToTop>
          <NativeTabs.Trigger.Icon sf="chart.bar" />
          <NativeTabs.Trigger.Label hidden>Progress</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="settings" accessibilityLabel="More" disableScrollToTop disablePopToTop>
          <NativeTabs.Trigger.Icon sf="ellipsis" />
          <NativeTabs.Trigger.Label hidden>More</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        {workout && (
          <NativeTabs.BottomAccessory>
            <ActiveWorkoutBar nativeAccessory />
          </NativeTabs.BottomAccessory>
        )}
      </NativeTabs>
    </TabBarInsetProvider>
  );
}
