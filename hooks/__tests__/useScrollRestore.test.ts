import { act, renderHook } from '@testing-library/react-native';
import type { LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent, ScrollView } from 'react-native';
import { useScrollRestore } from '@/hooks/useScrollRestore';

const scroll = (y: number) => ({ nativeEvent: { contentOffset: { y } } }) as NativeSyntheticEvent<NativeScrollEvent>;
const layout = (height: number) => ({ nativeEvent: { layout: { height } } }) as LayoutChangeEvent;

test('dashboard default restores only when the ScrollView handle exists and only once', async () => {
  const first = await renderHook(() => useScrollRestore('dashboard-test'));
  await act(() => first.result.current.onScroll(scroll(210)));
  await first.unmount();
  const { result } = await renderHook(() => useScrollRestore('dashboard-test'));
  await act(() => result.current.onContentSizeChange(320, 1000));
  const scrollTo = jest.fn();
  result.current.scrollRef.current = { scrollTo } as unknown as ScrollView;
  await act(() => { result.current.onContentSizeChange(320, 1000); result.current.onContentSizeChange(320, 1200); });
  expect(scrollTo).toHaveBeenCalledTimes(1);
  expect(scrollTo).toHaveBeenCalledWith({ y: 210, animated: false });
});

test('virtualized restoration waits for a usable viewport and content, then restores once through the callback', async () => {
  const first = await renderHook(() => useScrollRestore('virtual-test'));
  await act(() => first.result.current.onScroll(scroll(800)));
  await first.unmount();
  const scrollToOffset = jest.fn();
  let ready = false;
  const restore = (offset: number) => { if (!ready) return false; scrollToOffset({ offset, animated: false }); return true; };
  const { result } = await renderHook(() => useScrollRestore('virtual-test', restore));
  await act(() => { result.current.onContentSizeChange(320, 100); result.current.onLayout(layout(400)); result.current.onScroll(scroll(0)); });
  expect(scrollToOffset).not.toHaveBeenCalled();
  await act(() => result.current.onContentSizeChange(320, 2000));
  expect(scrollToOffset).not.toHaveBeenCalled();
  ready = true;
  await act(() => { result.current.onContentSizeChange(320, 2100); result.current.onContentSizeChange(320, 2200); });
  expect(scrollToOffset).toHaveBeenCalledTimes(1);
  expect(scrollToOffset).toHaveBeenCalledWith({ offset: 800, animated: false });
});

test('independent suggestion and result positions survive mode switches', async () => {
  const restoreA = jest.fn(() => true), restoreB = jest.fn(() => true);
  const { result, rerender } = await renderHook<{ a: ReturnType<typeof useScrollRestore>; b: ReturnType<typeof useScrollRestore> }, { active: boolean }>(({ active }) => ({
    a: useScrollRestore('mode-a', restoreA, active), b: useScrollRestore('mode-b', restoreB, !active),
  }), { initialProps: { active: true } });
  await act(() => result.current.a.onScroll(scroll(100)));
  await rerender({ active: false });
  await act(() => result.current.b.onScroll(scroll(500)));
  await rerender({ active: true });
  await act(() => { result.current.a.onLayout(layout(300)); result.current.a.onContentSizeChange(320, 1000); });
  expect(restoreA).toHaveBeenCalledWith(100);
  await rerender({ active: false });
  await act(() => { result.current.b.onContentSizeChange(320, 1200); result.current.b.onLayout(layout(300)); });
  expect(restoreB).toHaveBeenCalledWith(500);
});


test('fresh virtualized lists retain the latest scroll and user scrolling can supersede an unavailable old offset', async () => {
  const restore = jest.fn(() => true);
  const first = await renderHook(() => useScrollRestore('latest-offset', restore));
  await act(() => { first.result.current.onScroll(scroll(100)); first.result.current.onScroll(scroll(900)); });
  await first.unmount();
  const second = await renderHook(() => useScrollRestore('latest-offset', restore));
  await act(() => { second.result.current.onLayout(layout(300)); second.result.current.onContentSizeChange(320, 600); });
  expect(restore).not.toHaveBeenCalled();
  await act(() => { second.result.current.onScroll(scroll(150)); second.result.current.onScroll(scroll(200)); });
  await second.unmount();
  const third = await renderHook(() => useScrollRestore('latest-offset', restore));
  await act(() => { third.result.current.onLayout(layout(300)); third.result.current.onContentSizeChange(320, 1000); });
  expect(restore).toHaveBeenCalledWith(200);
});
