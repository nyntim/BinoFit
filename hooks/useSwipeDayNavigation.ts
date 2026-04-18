import { Dimensions } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';
import {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  runOnJS,
  Easing,
} from 'react-native-reanimated';
import { format, addDays, subDays, parseISO } from 'date-fns';
import { useDate } from '@/context/DateContext';

const SCREEN_WIDTH = Dimensions.get('window').width;
const H_DISTANCE_THRESHOLD = 50;
const VELOCITY_THRESHOLD = 500;
// Activate after 15px horizontal; fail (let scroll win) if 10px vertical comes first
const ACTIVE_OFFSET_X = 15;
const FAIL_OFFSET_Y = 10;

export function useSwipeDayNavigation() {
  const { selectedDate, setSelectedDate } = useDate();
  const translateX = useSharedValue(0);
  const isAnimating = useSharedValue(false);

  function animateDay(direction: 'forward' | 'back', newDate: string) {
    isAnimating.value = true;
    const exitX = direction === 'forward' ? -SCREEN_WIDTH : SCREEN_WIDTH;
    const enterX = direction === 'forward' ? SCREEN_WIDTH : -SCREEN_WIDTH;

    translateX.value = withTiming(
      exitX,
      { duration: 120, easing: Easing.in(Easing.ease) },
      (finished) => {
        if (!finished) {
          isAnimating.value = false;
          return;
        }
        runOnJS(setSelectedDate)(newDate);
        translateX.value = enterX;
        translateX.value = withTiming(
          0,
          { duration: 130, easing: Easing.out(Easing.ease) },
          () => {
            isAnimating.value = false;
          }
        );
      }
    );
  }

  // Runs on JS thread — can safely read selectedDate closure and call animateDay
  function handleSwipeEnd(translationX: number) {
    const today = format(new Date(), 'yyyy-MM-dd');
    const minDate = format(subDays(new Date(), 365), 'yyyy-MM-dd');

    if (translationX < 0) {
      // swipe left → forward one day
      if (selectedDate >= today) {
        translateX.value = withSpring(0, { damping: 20, stiffness: 300 });
        return;
      }
      animateDay('forward', format(addDays(parseISO(selectedDate), 1), 'yyyy-MM-dd'));
    } else {
      // swipe right → back one day
      if (selectedDate <= minDate) {
        translateX.value = withSpring(0, { damping: 20, stiffness: 300 });
        return;
      }
      animateDay('back', format(subDays(parseISO(selectedDate), 1), 'yyyy-MM-dd'));
    }
  }

  const panGesture = Gesture.Pan()
    .activeOffsetX([-ACTIVE_OFFSET_X, ACTIVE_OFFSET_X])
    .failOffsetY([-FAIL_OFFSET_Y, FAIL_OFFSET_Y])
    .onUpdate((e) => {
      if (!isAnimating.value) {
        translateX.value = e.translationX;
      }
    })
    .onEnd((e) => {
      if (isAnimating.value) return;

      const absX = Math.abs(e.translationX);
      const absY = Math.abs(e.translationY);
      const meetsThreshold =
        absX > H_DISTANCE_THRESHOLD || Math.abs(e.velocityX) > VELOCITY_THRESHOLD;
      const dominantHorizontal = absX > absY;

      if (!meetsThreshold || !dominantHorizontal) {
        translateX.value = withSpring(0, { damping: 20, stiffness: 300 });
        return;
      }

      runOnJS(handleSwipeEnd)(e.translationX);
    })
    .onFinalize((_, success) => {
      if (!success && !isAnimating.value) {
        translateX.value = withSpring(0, { damping: 20, stiffness: 300 });
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return { panGesture, animatedStyle };
}
