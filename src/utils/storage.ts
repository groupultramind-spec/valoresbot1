export const safeStorage = {
  getItem: (key: string): string | null => {
    try {
      return window.localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  },
  setItem: (key: string, value: string): void => {
    try {
      window.localStorage.setItem(key, value);
    } catch (e) {
      // Ignora erro
    }
  },
  removeItem: (key: string): void => {
    try {
      window.localStorage.removeItem(key);
    } catch (e) {
      // Ignora erro
    }
  }
};
