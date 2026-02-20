import { Skeleton } from '@/components/ui/skeleton';

export default function GameLoading() {
  return (
    <div className="min-h-screen bg-midnight">
      {/* Game Nav */}
      <div className="h-12 border-b border-border bg-surface flex items-center px-4 gap-3">
        <Skeleton variant="text" width={60} />
        <Skeleton variant="text" width={100} className="ml-auto" />
      </div>

      {/* Scorebug */}
      <div className="bg-surface-elevated border-b border-border">
        <div className="max-w-4xl mx-auto px-4 py-3">
          <div className="flex items-center justify-center gap-4 sm:gap-8">
            <div className="flex items-center gap-3">
              <Skeleton variant="circular" width={36} height={36} />
              <Skeleton variant="text" width={40} height={20} />
              <Skeleton variant="text" width={30} height={28} />
            </div>
            <div className="text-center">
              <Skeleton variant="text" width={50} className="mx-auto mb-1" />
              <Skeleton variant="text" width={70} className="mx-auto" />
            </div>
            <div className="flex items-center gap-3">
              <Skeleton variant="text" width={30} height={28} />
              <Skeleton variant="text" width={40} height={20} />
              <Skeleton variant="circular" width={36} height={36} />
            </div>
          </div>
        </div>
      </div>

      {/* Field Visual */}
      <div className="max-w-4xl mx-auto px-4 py-4">
        <Skeleton
          variant="rectangular"
          className="w-full rounded-xl"
          height={200}
        />
      </div>

      {/* Possession Strip */}
      <div className="max-w-4xl mx-auto px-4 mb-4">
        <div className="flex items-center justify-between">
          <Skeleton variant="text" width={120} />
          <Skeleton variant="text" width={100} />
        </div>
      </div>

      {/* Play Feed */}
      <div className="max-w-4xl mx-auto px-4 pb-8">
        <Skeleton variant="text" width={100} height={18} className="mb-3" />
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-lg bg-surface border border-border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <Skeleton variant="text" width={80} />
                <Skeleton variant="text" width={50} />
              </div>
              <Skeleton variant="text" width="90%" />
              <Skeleton variant="text" width="60%" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
