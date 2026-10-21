export type AppMetadata = {
  nativeAppVersion?: string | null;
  nativeBuildVersion?: string | null;
  expoConfig?: { version?: string | null } | null;
  platform?: { ios?: { buildNumber?: string | null }; android?: { versionCode?: number | null } } | null;
};
export type AppInfo = { version: string; build: string };
export function appInfo(metadata: AppMetadata): AppInfo {
  return {
    version: metadata.nativeAppVersion ?? metadata.expoConfig?.version ?? 'Unavailable',
    build: metadata.nativeBuildVersion ?? metadata.platform?.ios?.buildNumber ?? metadata.platform?.android?.versionCode?.toString() ?? 'Unavailable',
  };
}
export type SupportCategory = 'report' | 'feedback';
export function supportMessage(category: SupportCategory, message: string, info: AppInfo): string {
  return `${category === 'report' ? 'BinoFit problem report' : 'BinoFit feedback'}\n\n${message.trim()}\n\nApp version: ${info.version}\nBuild: ${info.build}`;
}
