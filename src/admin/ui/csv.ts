export interface CsvColumn<T> { label: string; get: (row: T) => unknown }

export function toCSV<T>(rows: T[], cols: CsvColumn<T>[]): string {
  const cell = (v: unknown) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  return [cols.map(c => cell(c.label)).join(','), ...rows.map(r => cols.map(c => cell(c.get(r))).join(','))].join('\n');
}

export function downloadFile(name: string, text: string, mime = 'text/plain'): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: mime }));
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
