/* Is the database actually answering?
   A paused Supabase project still has a URL and a key, but every request
   fails. Without this check the whole shop rendered empty and the admin
   panel hung on "Checking access…". The result is cached per tab so only
   the first page of a visit pays for the round trip. */
export type BackendMode = 'live' | 'offline' | 'local';

const CACHE_KEY = 'rb.backend';
const OK_TTL = 5 * 60_000;      // trust "up" for five minutes
const DOWN_TTL = 45_000;        // retry "down" sooner, so a resume is picked up
const TIMEOUT = 4500;

type Cached = { ok: boolean; at: number };

function readCache(): Cached | null {
  try {
    const c = JSON.parse(sessionStorage.getItem(CACHE_KEY) || 'null') as Cached | null;
    if (!c) return null;
    return Date.now() - c.at < (c.ok ? OK_TTL : DOWN_TTL) ? c : null;
  } catch { return null; }
}

export async function probeBackend(url: string, key: string): Promise<boolean> {
  const cached = readCache();
  if (cached) return cached.ok;
  let ok = false;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT);
  try {
    const res = await fetch(`${url}/rest/v1/site_settings?select=key&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: ctl.signal
    });
    /* any answer from PostgREST (even "table missing") means the project is
       running; a paused project answers 5xx or not at all */
    ok = res.status < 500;
  } catch { ok = false; }
  clearTimeout(timer);
  try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ok, at: Date.now() })); } catch { /* private mode */ }
  return ok;
}

export function forgetBackendProbe(): void {
  try { sessionStorage.removeItem(CACHE_KEY); } catch { /* private mode */ }
}
