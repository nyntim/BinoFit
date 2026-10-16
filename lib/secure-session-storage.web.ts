// Web has no Keychain; the session lives in localStorage like the Supabase default.
const hasStorage = () => typeof localStorage !== 'undefined';

export const secureSessionStorage = {
  async getItem(key: string): Promise<string | null> {
    return hasStorage() ? localStorage.getItem(key) : null;
  },
  async setItem(key: string, value: string): Promise<void> {
    if (hasStorage()) localStorage.setItem(key, value);
  },
  async removeItem(key: string): Promise<void> {
    if (hasStorage()) localStorage.removeItem(key);
  },
};
