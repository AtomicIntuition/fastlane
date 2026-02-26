import { NextResponse } from 'next/server';

export const ADMIN_NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
} as const;

export function adminNoStoreJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: ADMIN_NO_STORE_HEADERS,
  });
}
