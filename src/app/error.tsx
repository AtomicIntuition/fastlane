'use client';

import * as Sentry from '@sentry/nextjs';
import Link from 'next/link';
import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="flex items-center justify-center min-h-[60vh] p-8">
      <div className="text-center max-w-md mx-auto">
        <div className="text-5xl mb-4">⏱️</div>
        <h2 className="text-xl font-bold mb-2">FastLane Hit a Speed Bump</h2>
        <p className="text-gray-400 mb-6">
          Something unexpected happened. You can retry or return to the main page.
        </p>
        {error.digest && (
          <p className="text-xs text-gray-600 mb-4 font-mono">
            Error ID: {error.digest}
          </p>
        )}
        <div className="flex gap-3 justify-center">
          <button
            onClick={reset}
            className="px-5 py-2.5 bg-gold/20 text-gold border border-gold/30 rounded-lg hover:bg-gold/30 transition-colors font-medium"
          >
            Try Again
          </button>
          <Link
            href="/"
            className="px-5 py-2.5 bg-surface/50 text-gray-300 border border-white/10 rounded-lg hover:bg-surface/70 transition-colors font-medium"
          >
            Go Home
          </Link>
        </div>
      </div>
    </div>
  );
}
