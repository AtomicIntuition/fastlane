import { Skeleton } from '@/components/ui/skeleton';

export default function HomeLoading() {
  return (
    <>
      {/* Header placeholder */}
      <div className="h-16 border-b border-border bg-surface" />

      <main className="min-h-screen">
        {/* Hero Section */}
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-broadcast via-midnight to-midnight" />
          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 pt-8 pb-12">
            {/* Season status bar */}
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3">
                <Skeleton variant="text" width={80} />
                <Skeleton variant="text" width={120} />
              </div>
              <Skeleton variant="text" width={100} className="hidden sm:block" />
            </div>

            {/* Hero card skeleton */}
            <div className="rounded-xl bg-surface border border-border p-6 sm:p-8">
              <Skeleton variant="text" width={100} height={24} className="mb-6" />
              <div className="flex items-center justify-center gap-6 sm:gap-12">
                <div className="flex flex-col items-center gap-2">
                  <Skeleton variant="circular" width={80} height={80} />
                  <Skeleton variant="text" width={60} />
                  <Skeleton variant="text" width={80} />
                </div>
                <Skeleton variant="text" width={60} height={40} />
                <div className="flex flex-col items-center gap-2">
                  <Skeleton variant="circular" width={80} height={80} />
                  <Skeleton variant="text" width={60} />
                  <Skeleton variant="text" width={80} />
                </div>
              </div>
              <div className="flex justify-center mt-8">
                <Skeleton variant="rectangular" width={180} height={40} className="rounded-full" />
              </div>
            </div>
          </div>
        </section>

        {/* Quick Nav */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 -mt-4 mb-6 relative z-10">
          <div className="flex items-center gap-2">
            {[80, 80, 80, 90].map((w, i) => (
              <Skeleton key={i} variant="rectangular" width={w} height={32} className="rounded-full" />
            ))}
          </div>
        </section>

        {/* Coming Up */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
          <div className="flex items-center justify-between mb-4">
            <Skeleton variant="text" width={180} height={20} />
            <Skeleton variant="text" width={100} />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="rounded-xl bg-surface border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <Skeleton variant="circular" width={24} height={24} />
                    <Skeleton variant="text" width={30} />
                  </div>
                  <Skeleton variant="text" width={10} />
                  <div className="flex items-center gap-1.5">
                    <Skeleton variant="text" width={30} />
                    <Skeleton variant="circular" width={24} height={24} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Division Standings */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
          <div className="flex items-center justify-between mb-6">
            <Skeleton variant="text" width={100} height={20} />
            <Skeleton variant="text" width={120} />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {[0, 1].map((col) => (
              <div key={col}>
                <Skeleton variant="text" width={40} height={16} className="mb-4" />
                <div className="space-y-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="rounded-lg border border-border overflow-hidden">
                      <div className="px-3 py-1.5 bg-surface-elevated border-b border-border">
                        <Skeleton variant="text" width={70} />
                      </div>
                      <div className="divide-y divide-border/50">
                        {Array.from({ length: 4 }).map((_, j) => (
                          <div key={j} className="flex items-center gap-2.5 px-3 py-2">
                            <Skeleton variant="circular" width={24} height={24} />
                            <Skeleton variant="text" width={30} className="flex-1" />
                            <Skeleton variant="text" width={40} />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Season Progress */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 pb-16">
          <div className="rounded-xl bg-surface/50 backdrop-blur border border-border p-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <Skeleton variant="text" width={120} className="mb-2" />
                <Skeleton variant="text" width={160} height={24} />
              </div>
              <Skeleton variant="rectangular" width={256} height={12} className="rounded-full" />
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
