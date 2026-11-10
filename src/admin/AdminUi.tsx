import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Product } from '../lib/types';
import { ItemModal, CategoryModal } from './ItemModal';
import { ProductEditor } from './ProductEditor';
import { useCategoriesAdmin } from './queries';

type Tab = 'overview' | 'costs' | 'stock' | 'notes' | 'perf';
interface Ui {
  openItem: (id: string, opts?: { tab?: Tab }) => void;
  openCategory: (slug: string) => void;
  editProduct: (p: Product | null) => void;
}
const Ctx = createContext<Ui | null>(null);
export const useAdminUi = (): Ui => {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAdminUi outside <AdminUiProvider>');
  return c;
};

/* Popups that any screen can open: the item detail popup, the aisle performance popup and the
   product editor. Anything saved from them refreshes every list on screen. */
export function AdminUiProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const cats = useCategoriesAdmin();
  const [item, setItem] = useState<{ id: string; tab?: Tab } | null>(null);
  const [cat, setCat] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ p: Product | null } | null>(null);
  const changed = useCallback(() => { void qc.invalidateQueries(); }, [qc]);

  const ui = useMemo<Ui>(() => ({
    openItem: (id, opts) => setItem({ id, tab: opts?.tab }),
    openCategory: slug => setCat(slug),
    editProduct: p => setEditor({ p })
  }), []);

  return (
    <Ctx.Provider value={ui}>
      {children}
      {item && <ItemModal key={item.id} productId={item.id} initialTab={item.tab} onClose={() => setItem(null)} onChanged={changed}
        onEdit={p => { setItem(null); setEditor({ p }); }} />}
      {cat && <CategoryModal slug={cat} onClose={() => setCat(null)} onOpenItem={id => { setCat(null); setItem({ id }); }} />}
      {editor && <ProductEditor product={editor.p} cats={cats.data ?? []} onClose={() => setEditor(null)} onSaved={changed} />}
    </Ctx.Provider>
  );
}
