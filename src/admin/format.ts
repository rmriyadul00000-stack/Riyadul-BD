/* Number and date formatting shared by the admin screens. */
export const esc = (s: unknown): string =>
  String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

export const money = (n: unknown): string => '৳' + Number(n || 0).toLocaleString('en-BD', { maximumFractionDigits: 0 });
export const moneyD = (n: unknown): string => '৳' + Number(n || 0).toLocaleString('en-BD', { maximumFractionDigits: 2 });

export const when = (d?: string | number | Date | null): string =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
export const whenFull = (d?: string | number | Date | null): string =>
  d ? new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
