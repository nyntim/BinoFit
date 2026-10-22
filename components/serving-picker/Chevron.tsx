import { View } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';

export function Chevron({ size, color, up }: { size: number; color: string; up?: boolean }) {
  return (
    <View style={{ transform: [{ rotate: up ? '180deg' : '0deg' }] }}>
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Polyline
          points="6 9 12 15 18 9"
          stroke={color}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
}
