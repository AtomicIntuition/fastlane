import { Skeleton } from '@/components/ui/skeleton';

export default function LeaderboardLoading() {
  return (
    <>
      <div className="h-16 border-b border-border bg-surface" />
      <main className="min-h-screen bg-midnight">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
          {/* Page header */}
          <div className="mb-8">
            <Skeleton variant="text" width={240} height={28} className="mb-1" />
            <Skeleton variant="text" width={320} />
          </div>

          {/* User rank card */}
          <div className="mb-8">
            <div className="rounded-xl bg-surface border border-border p-5">
              <div className="flex items-center gap-4">
                <Skeleton variant="circular" width={48} height={48} />
                <div className="flex-1">
                  <Skeleton variant="text" width={140} className="mb-2" />
                  <Skeleton variant="text" width={100} />
                </div>
                <div className="text-right">
                  <Skeleton variant="text" width={60} height={24} className="mb-1" />
                  <Skeleton variant="text" width={40} />
                </div>
              </div>
            </div>
          </div>

          {/* Stats bar */}
          <div className="flex items-center justify-between mb-4">
            <Skeleton variant="text" width={120} />
            <Skeleton variant="text" width={100} />
          </div>

          {/* Leaderboard table */}
          <div className="rounded-xl bg-surface border border-border overflow-hidden">
            {/* Header row */}
            <div className="grid grid-cols-[50px_1fr_80px_80px_60px] px-4 py-2 border-b border-border">
              <Skeleton variant="text" width={20} />
              <Skeleton variant="text" width={60} />
              <Skeleton variant="text" width={40} />
              <Skeleton variant="text" width={50} />
              <Skeleton variant="text" width={40} />
            </div>
            {/* Rows */}
            {Array.from({ length: 15 }).map((_, i) => (
              <div
                key={i}
                className="grid grid-cols-[50px_1fr_80px_80px_60px] px-4 py-3 items-center border-b border-border/30"
              >
                <Skeleton variant="text" width={20} />
                <Skeleton variant="text" width={120} />
                <Skeleton variant="text" width={40} />
                <Skeleton variant="text" width={50} />
                <Skeleton variant="text" width={30} />
              </div>
            ))}
          </div>

          {/* Scoring explanation */}
          <div className="rounded-xl bg-surface/50 backdrop-blur border border-border p-4 mt-8">
            <Skeleton variant="text" width={140} className="mb-3" />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i}>
                  <Skeleton variant="text" width={30} height={22} className="mb-1" />
                  <Skeleton variant="text" width={160} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
