import { Skeleton } from '@/components/ui/skeleton';

export default function ScheduleLoading() {
  return (
    <>
      <div className="h-16 border-b border-border bg-surface" />
      <main className="min-h-screen bg-midnight max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {/* Page Header */}
        <div className="mb-6">
          <div className="flex items-end justify-between mb-3">
            <div>
              <Skeleton variant="text" width={80} className="mb-1" />
              <Skeleton variant="text" width={200} height={28} />
            </div>
            <Skeleton variant="text" width={120} />
          </div>
          <div className="flex items-center gap-3">
            <Skeleton variant="rectangular" height={6} className="flex-1 rounded-full" />
            <Skeleton variant="text" width={80} />
          </div>
        </div>

        {/* Week Navigation */}
        <div className="flex gap-1.5 overflow-hidden pb-3 mb-6">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton
              key={i}
              variant="rectangular"
              width={i < 2 ? 80 : 65}
              height={30}
              className="rounded-full flex-shrink-0"
            />
          ))}
        </div>

        {/* Games Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 mb-10">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-xl bg-surface border border-border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <Skeleton variant="text" width={100} />
                <Skeleton variant="text" width={60} />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Skeleton variant="circular" width={28} height={28} />
                    <Skeleton variant="text" width={100} />
                  </div>
                  <Skeleton variant="text" width={30} />
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Skeleton variant="circular" width={28} height={28} />
                    <Skeleton variant="text" width={100} />
                  </div>
                  <Skeleton variant="text" width={30} />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Road to Super Bowl */}
        <div className="mt-8 mb-4">
          <div className="flex items-center gap-3 mb-5">
            <div className="h-px flex-1 bg-border" />
            <Skeleton variant="text" width={180} />
            <div className="h-px flex-1 bg-border" />
          </div>
          <div className="flex items-center justify-center gap-4 mb-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <div className="text-center">
                  <Skeleton variant="circular" width={40} height={40} className="mb-1 mx-auto" />
                  <Skeleton variant="text" width={20} className="mx-auto" />
                </div>
                {i < 3 && <Skeleton variant="rectangular" width={40} height={2} />}
              </div>
            ))}
          </div>
        </div>
      </main>
    </>
  );
}
