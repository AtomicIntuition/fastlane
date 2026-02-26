import { Skeleton } from '@/components/ui/skeleton';

export default function AppLoading() {
  return (
    <main className="min-h-screen bg-midnight text-text-primary">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <Skeleton variant="text" width={180} height={24} className="mb-6" />
        <div className="rounded-xl border border-border bg-surface p-6">
          <Skeleton variant="text" width={240} className="mb-4" />
          <Skeleton variant="rectangular" width="100%" height={180} className="rounded-lg mb-4" />
          <div className="flex gap-3">
            <Skeleton variant="rectangular" width={120} height={36} className="rounded-full" />
            <Skeleton variant="rectangular" width={120} height={36} className="rounded-full" />
          </div>
        </div>
      </div>
    </main>
  );
}
