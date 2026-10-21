import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

/** Writes the CSV to the cache directory and opens the share sheet. Throws on failure. */
export async function shareCsv(fileName: string, csv: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available');
  const dir = new Directory(Paths.cache, 'exports');
  // Recreate so earlier exports do not pile up.
  if (dir.exists) dir.delete();
  dir.create();
  const file = new File(dir, fileName);
  file.create();
  file.write(csv);
  await Sharing.shareAsync(file.uri, {
    mimeType: 'text/csv',
    UTI: 'public.comma-separated-values-text',
    dialogTitle: 'Export data',
  });
}
