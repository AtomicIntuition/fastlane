'use client';

import { useJumbotron } from '@/hooks/use-jumbotron';

const TYPE_LABELS: Record<string, string> = {
  info: 'ANNOUNCEMENT',
  alert: 'ALERT',
  celebration: 'CELEBRATION',
  promo: 'PROMOTION',
};

export function JumbotronOverlay() {
  const { activeMessage } = useJumbotron();

  if (!activeMessage) return null;

  const label = TYPE_LABELS[activeMessage.type] ?? 'JUMBOTRON';

  return (
    <div className="absolute top-0 left-0 right-0 z-40 animate-in fade-in slide-in-from-top-2 duration-300">
      <div className="mx-2 mt-2 rounded-lg bg-gradient-to-r from-gold/90 via-gold to-gold/90 px-4 py-2.5 shadow-lg shadow-gold/20">
        <div className="flex items-center gap-2.5">
          <span className="text-[8px] font-black tracking-widest uppercase text-midnight/60 bg-midnight/10 px-1.5 py-0.5 rounded">
            {label}
          </span>
          <p className="text-sm font-bold text-midnight flex-1 truncate">
            {activeMessage.message}
          </p>
        </div>
      </div>
    </div>
  );
}
