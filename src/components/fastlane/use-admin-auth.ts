'use client';

import { useCallback, useEffect, useState } from 'react';

interface AdminAuthResult {
  ok: boolean;
  error?: string;
}

export function getAdminCsrfTokenFromCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const cookie = document.cookie
    .split(';')
    .map((item) => item.trim())
    .find((item) => item.startsWith('fastlaneAdminCsrf='));
  if (!cookie) return null;
  const raw = cookie.slice('fastlaneAdminCsrf='.length);
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export function useAdminAuth(storageKey = 'fastlane.admin.token') {
  const [token, setToken] = useState('');
  const [authenticated, setAuthenticated] = useState(false);

  const checkSession = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/fastlane/auth');
      const body = (await res.json()) as { authenticated?: boolean };
      setAuthenticated(Boolean(body.authenticated));
    } catch {
      setAuthenticated(false);
    }
  }, []);

  useEffect(() => {
    const savedToken = sessionStorage.getItem(storageKey);
    if (savedToken) setToken(savedToken);
    void checkSession();
  }, [checkSession, storageKey]);

  const saveToken = useCallback(() => {
    if (!token) return;
    sessionStorage.setItem(storageKey, token);
  }, [storageKey, token]);

  const clearSavedToken = useCallback(() => {
    sessionStorage.removeItem(storageKey);
    setToken('');
    setAuthenticated(false);
  }, [storageKey]);

  const login = useCallback(async (): Promise<AdminAuthResult> => {
    if (!token) {
      return { ok: false, error: 'Enter admin token first.' };
    }

    try {
      const res = await fetch('/api/admin/fastlane/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: token }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        return { ok: false, error: body.error ?? 'Login failed' };
      }

      sessionStorage.setItem(storageKey, token);
      setAuthenticated(true);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }, [storageKey, token]);

  const logout = useCallback(async () => {
    try {
      await fetch('/api/admin/fastlane/auth', { method: 'DELETE' });
    } finally {
      clearSavedToken();
    }
  }, [clearSavedToken]);

  return {
    token,
    setToken,
    authenticated,
    setAuthenticated,
    checkSession,
    saveToken,
    clearSavedToken,
    login,
    logout,
  };
}
