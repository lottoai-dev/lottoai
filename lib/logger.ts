// lib/logger.ts

const isDev = typeof __DEV__ !== 'undefined' && __DEV__;

export function logError(tag: string, error: unknown, extra?: Record<string, unknown>) {
  if (isDev) {
    console.error(`[${tag}]`, error, extra ?? '');
  }
  // Production'da buraya Crashlytics, Sentry vb. bağlanabilir
}