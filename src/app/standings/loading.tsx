import { Skeleton } from '@/components/ui/skeleton';

export default function StandingsLoading() {
  return (
    <>
      <div className="h-16 border-b border-border bg-surface" />
      <main className="min-h-screen bg-midnight max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {/* Page Header */}
        <div className="mb-6">
          <Skeleton variant="text" width={160} height={28} className="mb-1" />
          <Skeleton variant="text" width={200} />
        </div>

        {/* Two-column division tables */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[0, 1].map((col) => (
            <div key={col}>
              <Skeleton variant="text" width={40} height={20} className="mb-4" />
              <div className="space-y-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="rounded-xl bg-surface border border-border overflow-hidden">
                    {/* Division header */}
                    <div className="px-4 py-2 bg-surface-elevated border-b border-border">
                      <Skeleton variant="text" width={90} />
                    </div>
                    {/* Table header */}
                    <div className="grid grid-cols-[1fr_40px_40px_40px_50px] px-4 py-1.5">
                      <Skeleton variant="text" width={40} />
                      <Skeleton variant="text" width={15} />
                      <Skeleton variant="text" width={15} />
                      <Skeleton variant="text" width={15} />
                      <Skeleton variant="text" width={30} />
                    </div>
                    {/* Team rows */}
                    {Array.from({ length: 4 }).map((_, j) => (
                      <div key={j} className="grid grid-cols-[1fr_40px_40px_40px_50px] px-4 py-2 items-center border-t border-border/30">
                        <div className="flex items-center gap-2">
                          <Skeleton variant="circular" width={24} height={24} />
                          <Skeleton variant="text" width={80} />
                        </div>
                        <Skeleton variant="text" width={15} />
                        <Skeleton variant="text" width={15} />
                        <Skeleton variant="text" width={15} />
                        <Skeleton variant="text" width={35} />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </main>
    </>
  );
}
