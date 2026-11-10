import { useSyncExternalStore } from 'react';

interface ToastItem { id: number; msg: string; bad: boolean }

let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());

export function toast(msg: string, bad = false): void {
  const id = nextId++;
  items = [...items, { id, msg, bad }];
  emit();
  setTimeout(() => { items = items.filter(t => t.id !== id); emit(); }, 3200);
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

export function Toasts() {
  const list = useSyncExternalStore(subscribe, () => items);
  return (
    <div className="toasts" aria-live="polite">
      {list.map(t => <div key={t.id} className={'toast' + (t.bad ? ' bad' : '')}>{t.msg}</div>)}
    </div>
  );
}
