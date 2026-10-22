import { keyboardOverlap } from '@/hooks/useKeyboardOverlap';

describe('keyboardOverlap', () => {
  it('is 0 when the keyboard top is below the view bottom', () => {
    expect(keyboardOverlap(700, 800)).toBe(0);
  });
  it('is 0 when the keyboard top is exactly at the view bottom', () => {
    expect(keyboardOverlap(700, 700)).toBe(0);
  });
  it('is the covered height when the keyboard top is above the view bottom', () => {
    expect(keyboardOverlap(800, 500)).toBe(300);
  });
});
