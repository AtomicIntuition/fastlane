import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const mockInsertValues = vi.fn(async () => []);
  const mockInsert = vi.fn(() => ({ values: mockInsertValues }));
  const mockGetUserIdFromRequest = vi.fn(() => '11111111-1111-4111-8111-111111111111');

  return {
    mockInsertValues,
    mockInsert,
    mockGetUserIdFromRequest,
  };
});

vi.mock('@/lib/db', () => ({
  db: {
    insert: mocks.mockInsert,
  },
}));

vi.mock('@/lib/utils/signed-cookie', () => ({
  getUserIdFromRequest: mocks.mockGetUserIdFromRequest,
}));

import { POST } from '@/app/api/fastlane/analytics/route';

describe('FastLane analytics route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects unknown query parameters', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/analytics?foo=bar', {
      method: 'POST',
      body: JSON.stringify({ name: 'landing_cta_clicked' }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Unknown query parameter/i);
    expect(mocks.mockInsert).not.toHaveBeenCalled();
  });

  it('rejects invalid event names', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/analytics', {
      method: 'POST',
      body: JSON.stringify({ name: 'bad_event' }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Invalid event name/i);
    expect(mocks.mockInsert).not.toHaveBeenCalled();
  });

  it('accepts valid analytics events', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/analytics', {
      method: 'POST',
      body: JSON.stringify({
        name: 'trial_started',
        at: new Date().toISOString(),
        props: { plan: 'monthly', source: 'modal' },
      }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(202);
    expect(body.ok).toBe(true);
    expect(mocks.mockInsert).toHaveBeenCalledTimes(1);
    expect(mocks.mockInsertValues).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid content-type', async () => {
    const request = new NextRequest('http://localhost:3000/api/fastlane/analytics', {
      method: 'POST',
      body: JSON.stringify({ name: 'landing_cta_clicked' }),
      headers: { 'content-type': 'text/plain' },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Invalid content-type/i);
  });
});
