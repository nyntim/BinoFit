import { useEffect, useState, type RefObject } from 'react';
import { Keyboard, Platform, type KeyboardEvent, type View } from 'react-native';

/** How far the keyboard covers the bottom of a view, in px (0 when it does not reach it). */
export function keyboardOverlap(viewBottom: number, keyboardTop: number): number {
  return Math.max(0, viewBottom - keyboardTop);
}

/**
 * iOS only: how much of `ref`'s view the keyboard covers, measured in window coordinates, so it
 * stays right inside page-sheet modals where `KeyboardAvoidingView` is off by the sheet offset.
 * Returns 0 on Android (adjustResize handles it) and on web.
 */
export function useKeyboardOverlap(ref: RefObject<View | null>): number {
  const [overlap, setOverlap] = useState(0);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    const update = (e: KeyboardEvent) => {
      const view = ref.current;
      if (!view) return;
      view.measureInWindow((_x, y, _w, height) => {
        setOverlap(keyboardOverlap(y + height, e.endCoordinates.screenY));
      });
    };
    const subs = [
      Keyboard.addListener('keyboardWillShow', (e) => {
        Keyboard.scheduleLayoutAnimation(e);
        update(e);
      }),
      Keyboard.addListener('keyboardWillChangeFrame', update),
      Keyboard.addListener('keyboardWillHide', (e) => {
        Keyboard.scheduleLayoutAnimation(e);
        setOverlap(0);
      }),
    ];
    return () => subs.forEach((s) => s.remove());
  }, [ref]);

  return overlap;
}
