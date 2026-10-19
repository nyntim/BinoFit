import TabNavigator from '@/components/navigation/TabNavigator';
import { DateProvider } from '@/context/DateContext';

export default function TabLayout() {
  return <DateProvider><TabNavigator /></DateProvider>;
}
