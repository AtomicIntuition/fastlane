import { Skeleton } from '@/components/ui/skeleton';

export default function TeamsLoading() {
  return (
    <>
      <div className="h-16 border-b border-border bg-surface" />
      <main className="min-h-screen max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <Skeleton variant="text" width={160} height={28} className="mb-8" />

        {/* Two conferences */}
        {[0, 1].map((conf) => (
          <div key={conf} className="mb-10">
            <Skeleton variant="text" width={40} height={20} className="mb-4" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Four divisions */}
              {Array.from({ length: 4 }).map((_, div) => (
                <div key={div}>
                  <Skeleton variant="text" width={80} className="mb-2" />
                  <div className="space-y-2">
                    {/* Four teams per division */}
                    {Array.from({ length: 4 }).map((_, t) => (
                      <div key={t} className="rounded-xl bg-surface border border-border p-3">
                        <div className="flex items-center gap-3">
                          <Skeleton variant="circular" width={40} height={40} />
                          <div className="flex-1 min-w-0">
                            <Skeleton variant="text" width={100} className="mb-1" />
                            <Skeleton variant="text" width={30} />
                          </div>
                          <Skeleton variant="text" width={40} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </main>
    </>
  );
}
