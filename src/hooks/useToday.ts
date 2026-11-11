import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { startOfDay } from '../lib/dates';

const todayKey = () => startOfDay(new Date()).getTime();

/**
 * Start of today (epoch ms). The screen that uses it renders again when the day changes: at
 * midnight with the app open, or when the app comes back from the background on another day.
 * Without this, "este mes", "hoy" and "ayer" stay frozen until the next write.
 */
export function useToday(): number {
  const [today, setToday] = useState(todayKey);

  useEffect(() => {
    const refresh = () => setToday(todayKey());
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    // A little after midnight, so the new date is already in effect.
    const untilMidnight = today + 86_400_000 - Date.now() + 1000;
    const timer = setTimeout(refresh, Math.max(1000, untilMidnight));
    return () => {
      sub.remove();
      clearTimeout(timer);
    };
  }, [today]);

  return today;
}
