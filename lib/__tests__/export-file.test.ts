const mockFiles: { uri: string; content?: string }[] = [];
const mockDirs: { uri: string; created: boolean; deleted: boolean; exists: boolean }[] = [];

jest.mock('expo-file-system', () => {
  class Directory {
    uri: string;
    created = false;
    deleted = false;
    exists: boolean;
    constructor(base: any, name: string) {
      this.uri = `${typeof base === 'string' ? base : base.uri}/${name}`;
      this.exists = (globalThis as any).__dirExists ?? false;
      mockDirs.push(this);
    }
    create() {
      this.created = true;
    }
    delete() {
      this.deleted = true;
    }
  }
  class File {
    uri: string;
    content?: string;
    constructor(dir: any, name: string) {
      this.uri = `${dir.uri}/${name}`;
      mockFiles.push(this);
    }
    create() {}
    write(c: string) {
      this.content = c;
    }
  }
  return { Directory, File, Paths: { cache: { uri: 'file:///cache' } } };
});

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(),
  shareAsync: jest.fn(async () => {}),
}));

import * as Sharing from 'expo-sharing';
import { shareCsv } from '@/lib/export-file';

beforeEach(() => {
  mockFiles.length = 0;
  mockDirs.length = 0;
  (globalThis as any).__dirExists = false;
  (Sharing.isAvailableAsync as jest.Mock).mockReset().mockResolvedValue(true);
  (Sharing.shareAsync as jest.Mock).mockClear();
});

describe('shareCsv', () => {
  it('writes the file under the cache exports dir and shares that URI', async () => {
    await shareCsv('a.csv', 'data');
    expect(mockFiles[0].uri).toBe('file:///cache/exports/a.csv');
    expect(mockFiles[0].content).toBe('data');
    expect(Sharing.shareAsync).toHaveBeenCalledWith(
      'file:///cache/exports/a.csv',
      expect.objectContaining({
        mimeType: 'text/csv',
        UTI: 'public.comma-separated-values-text',
      })
    );
  });

  it('clears a previous exports dir before writing', async () => {
    (globalThis as any).__dirExists = true;
    await shareCsv('a.csv', 'data');
    expect(mockDirs[0].deleted).toBe(true);
    expect(mockDirs[0].created).toBe(true);
  });

  it('does not delete when the dir does not exist yet', async () => {
    await shareCsv('a.csv', 'data');
    expect(mockDirs[0].deleted).toBe(false);
  });

  it('throws when sharing is unavailable and writes nothing', async () => {
    (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(false);
    await expect(shareCsv('a.csv', 'data')).rejects.toThrow('Sharing is not available');
    expect(mockFiles).toHaveLength(0);
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
  });

  it('propagates share errors', async () => {
    (Sharing.shareAsync as jest.Mock).mockRejectedValueOnce(new Error('cancelled'));
    await expect(shareCsv('a.csv', 'data')).rejects.toThrow('cancelled');
  });
});
