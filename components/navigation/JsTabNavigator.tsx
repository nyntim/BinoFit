import { Tabs } from 'expo-router';
import { FloatingTabBar } from '@/components/navigation/FloatingTabBar';
import { TabBarInsetProvider } from '@/context/TabBarInsetContext';

export default function JsTabNavigator() {
  return (
    <TabBarInsetProvider>
      <Tabs
        tabBar={(props) => <FloatingTabBar {...props} />}
        screenOptions={{
          headerShown: false,
          tabBarStyle: { position: 'absolute', height: 0, borderTopWidth: 0, backgroundColor: 'transparent' },
        }}
      >
        <Tabs.Screen name="index" options={{ title: 'Nutrition' }} />
        <Tabs.Screen name="training" options={{ title: 'Training' }} />
        <Tabs.Screen name="progress" options={{ title: 'Progress' }} />
        <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
      </Tabs>
    </TabBarInsetProvider>
  );
}
