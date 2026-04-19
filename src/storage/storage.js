// localStorage wrapper that matches the shape of the artifact sandbox's
// window.storage API. This lets the existing App.jsx code work unchanged.
//
// IMPORTANT: the `shared: true` flag only simulates cross-user storage within
// a single browser. For real multi-device comparison, replace this module
// with a backend client (e.g. Supabase). The call sites are already correct;
// you just need different plumbing behind them.

const NAMESPACE = 'artswipe';

function fullKey(key, shared) {
  return shared
    ? `${NAMESPACE}:shared:${key}`
    : `${NAMESPACE}:user:${key}`;
}

export const storage = {
  async get(key, shared = false) {
    try {
      const value = localStorage.getItem(fullKey(key, shared));
      return value !== null ? { key, value, shared } : null;
    } catch (err) {
      console.error('[storage.get]', err);
      return null;
    }
  },

  async set(key, value, shared = false) {
    try {
      localStorage.setItem(fullKey(key, shared), value);
      return { key, value, shared };
    } catch (err) {
      console.error('[storage.set]', err);
      return null;
    }
  },

  async delete(key, shared = false) {
    try {
      localStorage.removeItem(fullKey(key, shared));
      return { key, deleted: true, shared };
    } catch (err) {
      console.error('[storage.delete]', err);
      return null;
    }
  },

  async list(prefix = '', shared = false) {
    try {
      const searchPrefix = fullKey(prefix, shared);
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(searchPrefix)) {
          // Strip namespace back off to return a clean key
          const cleanKey = k.replace(
            `${NAMESPACE}:${shared ? 'shared:' : 'user:'}`,
            ''
          );
          keys.push(cleanKey);
        }
      }
      return { keys, prefix, shared };
    } catch (err) {
      console.error('[storage.list]', err);
      return { keys: [], prefix, shared };
    }
  },
};

// Expose on window so App.jsx can use `window.storage.get(...)` unchanged.
if (typeof window !== 'undefined') {
  window.storage = storage;
}
