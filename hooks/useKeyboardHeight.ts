import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

/** Android keyboard height for padding scroll content; always 0 elsewhere (iOS uses automaticallyAdjustKeyboardInsets). */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const show = Keyboard.addListener('keyboardDidShow', (e) => setHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardDidHide', () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return height;
}
