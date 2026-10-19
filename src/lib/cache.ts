// In-memory TTL cache. One process, one map. Good enough for a single-user
// command center; swap for Redis if this ever runs behind more than one node.

type Entry<T> = { value: T; expires: number };

const store = new Map<string, Entry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;

// Sweep expired entries so a long-running process does not grow without bound.
const sweeper = setInterval(() => {
  const now = Date.now();
  for (const [k, e] of store) if (e.expires < now) store.delete(k);
}, 10 * MINUTE);
if (typeof sweeper === "object" && "unref" in sweeper) sweeper.unref();

export async function cached<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
): Promise<T> {
  const now = Date.now();
  const hit = store.get(key) as Entry<T> | undefined;
  if (hit && hit.expires > now) return hit.value;
  if (hit) store.delete(key);

  // Collapse concurrent misses into one upstream call. A rejected loader is
  // not stored, so an outage is retried on the next request.
  const pending = inflight.get(key) as Promise<T> | undefined;
  if (pending) return pending;

  const p = loader()
    .then((value) => {
      store.set(key, { value, expires: Date.now() + ttlMs });
      return value;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}
