export function isValidSentryDsn(value: string | undefined | null): value is string {
  if (!value) return false;
  if (value.includes('...')) return false;

  try {
    const url = new URL(value);
    return (
      (url.protocol === 'https:' || url.protocol === 'http:') &&
      Boolean(url.username) &&
      Boolean(url.host) &&
      /^\/\d+$/.test(url.pathname)
    );
  } catch {
    return false;
  }
}
