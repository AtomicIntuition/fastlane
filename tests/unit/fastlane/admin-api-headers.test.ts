import { describe, expect, it } from 'vitest';
import { ADMIN_NO_STORE_HEADERS, adminNoStoreJson } from '@/lib/fastlane/admin-api-headers';

describe('admin API headers helper', () => {
  it('exposes strict no-store cache headers', () => {
    expect(ADMIN_NO_STORE_HEADERS['Cache-Control']).toBe('no-store, no-cache, must-revalidate');
  });

  it('builds JSON response with default status and no-store headers', async () => {
    const response = adminNoStoreJson({ ok: true });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(body).toEqual({ ok: true });
  });

  it('builds JSON response with explicit status and no-store headers', async () => {
    const response = adminNoStoreJson({ error: 'Unauthorized' }, 401);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(body).toEqual({ error: 'Unauthorized' });
  });
});

