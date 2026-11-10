/* Admin toast: appended to the #toasts container the shell renders. */
export function toast(msg: string, bad = false): void {
  const host = document.getElementById('toasts');
  if (!host) return;
  const t = document.createElement('div');
  t.className = 'toast' + (bad ? ' bad' : '');
  t.textContent = msg;
  host.appendChild(t);
  setTimeout(() => t.remove(), 3400);
}
