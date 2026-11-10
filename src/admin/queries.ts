import { useQuery } from '@tanstack/react-query';
import { RB_DB } from '../lib/db';
import { loadBiz } from './biz';

export const useBiz = () => useQuery({ queryKey: ['biz'], queryFn: loadBiz, staleTime: 0, refetchOnMount: 'always' });

export const useCategoriesAdmin = () =>
  useQuery({ queryKey: ['categories-admin'], staleTime: 0, refetchOnMount: 'always',
    queryFn: async () => { const r = await RB_DB.categories(true); return r.ok ? r.data : []; } });

export const useProductsAdmin = () =>
  useQuery({ queryKey: ['products-admin'], staleTime: 0, refetchOnMount: 'always',
    queryFn: async () => { const r = await RB_DB.products(true); return r.ok ? r.data : []; } });

export const useSettingsAdmin = () =>
  useQuery({ queryKey: ['settings-admin'], staleTime: 0, refetchOnMount: 'always',
    queryFn: async () => { const r = await RB_DB.settings(); return r.ok ? r.data : {}; } });
