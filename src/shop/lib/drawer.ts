import { useSyncExternalStore } from 'react';

let isOpen = false;
const listeners = new Set<() => void>();
const set = (v: boolean) => {
  isOpen = v;
  document.body.classList.toggle('no-scroll', v);
  listeners.forEach(l => l());
};

export const drawer = { open: () => set(true), close: () => set(false) };
export const useDrawerOpen = () =>
  useSyncExternalStore(l => { listeners.add(l); return () => { listeners.delete(l); }; }, () => isOpen);
