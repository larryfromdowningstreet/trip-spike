// A minimal key-value store on IndexedDB. CryptoKey objects can be stored as they are.

const NAME = 'trip-spike';

const db = new Promise<IDBDatabase>((resolve, reject) => {
  const req = indexedDB.open(NAME, 1);
  req.onupgradeneeded = () => req.result.createObjectStore('kv');
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

async function run<T>(mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const store = (await db).transaction('kv', mode).objectStore('kv');
  return new Promise((resolve, reject) => {
    const req = op(store);
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  });
}

export const load = <T>(key: string) => run<T | undefined>('readonly', (s) => s.get(key));

export const save = (key: string, value: unknown) => run<void>('readwrite', (s) => s.put(value, key));

export async function wipe(): Promise<void> {
  (await db).close();
  await new Promise((done) => {
    const req = indexedDB.deleteDatabase(NAME);
    req.onsuccess = req.onerror = req.onblocked = done;
  });
}
