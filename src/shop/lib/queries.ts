import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RB_DB } from '../../lib/db';
import { RB_SETTINGS } from '../../lib/seed';
import type { Result, Settings } from '../../lib/types';

/* The data layer answers with { ok, data | error }. Queries unwrap that:
   errors throw (so React Query can retry / expose them) except where a
   page wants to show the message itself, in which case it calls RB_DB directly. */
async function unwrap<T>(p: Promise<Result<T>>): Promise<T> {
  const r = await p;
  if (!r.ok) throw new Error(r.error);
  return r.data;
}

const STALE = 60_000;

export const useBackendReady = () => useQuery({ queryKey: ['backend'], queryFn: () => RB_DB.ready, staleTime: Infinity });

export const useProducts = () =>
  useQuery({ queryKey: ['products'], queryFn: () => unwrap(RB_DB.products()), staleTime: STALE });

export const useProduct = (slug: string | undefined) =>
  useQuery({ queryKey: ['product', slug], queryFn: () => RB_DB.product(slug!), enabled: !!slug, staleTime: STALE });

export const useCategories = () =>
  useQuery({ queryKey: ['categories'], queryFn: () => unwrap(RB_DB.categories()), staleTime: STALE });

export const useSettings = () =>
  useQuery({
    queryKey: ['settings'],
    queryFn: async (): Promise<Settings> => { const r = await RB_DB.settings(); return r.ok ? r.data : RB_SETTINGS; },
    staleTime: STALE
  });

export const useHero = (device: 'desktop' | 'mobile') =>
  useQuery({ queryKey: ['hero', device], queryFn: () => unwrap(RB_DB.hero(device)), staleTime: STALE });

export const useMe = () => useQuery({ queryKey: ['me'], queryFn: () => RB_DB.me(), staleTime: STALE });

export const useWishlist = () =>
  useQuery({ queryKey: ['wishlist'], queryFn: async () => { const r = await RB_DB.wishlist(); return r.ok ? r.data : []; } });

export const useUnreadCount = () =>
  useQuery({
    queryKey: ['unread'],
    queryFn: async () => { const r = await RB_DB.unreadMessageCount(); return r.ok ? r.data : 0; },
    refetchInterval: 60_000
  });

export function useToggleWishlist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => { const r = await RB_DB.toggleWishlist(id); return r.ok ? r.data : false; },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wishlist'] })
  });
}
