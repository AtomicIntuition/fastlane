import { Skeleton } from '@/components/ui/skeleton';

export default function TeamDetailLoading() {
  return (
    <>
      <div className="h-16 border-b border-border bg-surface" />
      <main className="min-h-screen bg-midnight">
        {/* Team Header */}
        <section className="max-w-5xl mx-auto px-4 sm:px-6 pt-6">
          <div className="flex items-center gap-4 sm:gap-6 mb-4">
            <Skeleton variant="circular" width={80} height={80} />
            <div className="flex-1">
              <Skeleton variant="text" width={200} height={28} className="mb-2" />
              <div className="flex items-center gap-3">
                <Skeleton variant="text" width={60} />
                <Skeleton variant="text" width={40} />
                <Skeleton variant="rectangular" width={80} height={22} className="rounded-full" />
              </div>
            </div>
          </div>
        </section>

        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-10">
          {/* Team Stats */}
          <section>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-xl bg-surface border border-border p-4">
                  <Skeleton variant="text" width={80} className="mb-2" />
                  <Skeleton variant="text" width={50} height={24} />
                </div>
              ))}
            </div>
          </section>

          {/* Season Schedule */}
          <section>
            <Skeleton variant="text" width={180} height={20} className="mb-4" />
            <div className="rounded-xl bg-surface border border-border overflow-hidden">
              {/* Header */}
              <div className="grid grid-cols-[50px_1fr_80px_80px] sm:grid-cols-[60px_1fr_100px_100px] px-4 py-2 border-b border-border">
                <Skeleton variant="text" width={30} />
                <Skeleton variant="text" width={60} />
                <Skeleton variant="text" width={40} className="mx-auto" />
                <Skeleton variant="text" width={40} className="ml-auto" />
              </div>
              {/* Rows */}
              {Array.from({ length: 10 }).map((_, i) => (
                <div
                  key={i}
                  className="grid grid-cols-[50px_1fr_80px_80px] sm:grid-cols-[60px_1fr_100px_100px] px-4 py-2.5 items-center border-b border-border/30"
                >
                  <Skeleton variant="text" width={20} />
                  <div className="flex items-center gap-2">
                    <Skeleton variant="text" width={16} />
                    <Skeleton variant="circular" width={18} height={18} />
                    <Skeleton variant="text" width={30} />
                  </div>
                  <Skeleton variant="rectangular" width={24} height={20} className="rounded-full mx-auto" />
                  <Skeleton variant="text" width={40} className="ml-auto" />
                </div>
              ))}
            </div>
          </section>

          {/* Roster */}
          <section>
            <Skeleton variant="text" width={80} height={20} className="mb-4" />
            <div className="rounded-xl bg-surface border border-border overflow-hidden">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-2.5 border-b border-border/30">
                  <Skeleton variant="text" width={25} />
                  <Skeleton variant="text" width={120} />
                  <Skeleton variant="text" width={25} className="ml-auto" />
                  <Skeleton variant="rectangular" width={40} height={6} className="rounded-full" />
                </div>
              ))}
            </div>
          </section>

          {/* Team Info */}
          <section>
            <Skeleton variant="text" width={90} height={20} className="mb-4" />
            <div className="rounded-xl bg-surface/50 backdrop-blur border border-border p-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i}>
                    <Skeleton variant="text" width={70} className="mb-1" />
                    <Skeleton variant="text" width={90} />
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
