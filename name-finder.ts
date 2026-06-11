import fs from 'fs';

export function deepFindName(obj: any): string | null {
  if (!obj || typeof obj !== 'object') return null;
  
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = deepFindName(item);
      if (found) return found;
    }
    return null;
  }
  
  for (const [key, value] of Object.entries(obj)) {
    const k = key.toLowerCase();
    if (k === 'nome' || k === 'name' || k === 'razao_social') {
      if (typeof value === 'string' && value.trim().length > 0) {
        return value.trim();
      }
    }
    const found = deepFindName(value);
    if (found) return found;
  }
  
  return null;
}
