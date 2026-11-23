import { useSyncExternalStore } from 'react';

export type ThemePreference = 'system' | 'light' | 'dark';
declare global {
  interface Window {
    qingTheme: { getPreference: () => ThemePreference; setPreference: (value: ThemePreference) => void };
  }
}
const subscribe = (listener: () => void) => {
  window.addEventListener('qing-theme-change', listener);
  return () => window.removeEventListener('qing-theme-change', listener);
};
export function useTheme() {
  return useSyncExternalStore(subscribe, () => window.qingTheme.getPreference());
}
export function setTheme(value: ThemePreference) { window.qingTheme.setPreference(value); }
