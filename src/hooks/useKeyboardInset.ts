import { useEffect, useRef, useState } from 'react';
import { Keyboard, type LayoutChangeEvent, useWindowDimensions } from 'react-native';

/**
 * Space to leave at the bottom so buttons stay above the keyboard.
 *
 * On Android it depends on the version: some resize the window when the keyboard opens and some
 * (Android 15+ edge-to-edge) do not. Instead of guessing, this compares the screen height with
 * and without the keyboard: if the window already shrank, no extra space is added.
 */
export function useKeyboardInset(): { inset: number; onLayout: (e: LayoutChangeEvent) => void; keyboardOpen: boolean } {
  const [keyboard, setKeyboard] = useState(0);
  const [height, setHeight] = useState(0);
  const baseline = useRef(0);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) => setKeyboard(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboard(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const onLayout = (e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    // The baseline only grows (full height without keyboard), so a shrunk layout that arrives
    // before the keyboard event can never be taken as the full height.
    if (h > baseline.current) baseline.current = h;
    setHeight(h);
  };

  // Rotation or split screen: start over.
  useEffect(() => {
    baseline.current = 0;
  }, [windowWidth, windowHeight]);

  const shrunk = baseline.current > 0 && height > 0 ? baseline.current - height : 0;
  const inset = keyboard === 0 || shrunk > keyboard / 2 ? 0 : keyboard;
  return { inset, onLayout, keyboardOpen: keyboard > 0 };
}
