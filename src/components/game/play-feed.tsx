'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { GameEvent } from '@/lib/simulation/types';
import {
  formatDownAndDistance,
  formatYards,
  formatFieldPosition,
  formatClock,
} from '@/lib/utils/formatting';
import { getTeamScoreboardLogoUrl } from '@/lib/utils/team-logos';

interface PlayFeedProps {
  events: GameEvent[];
  isLive: boolean;
}

/** Number of plays rendered per batch (initial + each "load more") */
const BATCH_SIZE = 50;

export function PlayFeed({ events, isLive }: PlayFeedProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isAtTop, setIsAtTop] = useState(true);
  const [unseenCount, setUnseenCount] = useState(0);
  const lastSeenCount = useRef(0);
  const [visibleCount, setVisibleCount] = useState(BATCH_SIZE);

  // Filter out touchbacks for cleaner feed, keep scoring plays
  const displayEvents = events.filter(
    (e) =>
      e.playResult.type !== 'touchback' ||
      e.playResult.isTouchdown ||
      e.playResult.scoring
  );

  // Reverse chronological — newest play at top
  const reversedEvents = [...displayEvents].reverse();

  // Only render up to `visibleCount` items to avoid DOM bloat on long games
  const renderedEvents = reversedEvents.slice(0, visibleCount);
  const hasMoreEvents = visibleCount < reversedEvents.length;
  const hiddenCount = reversedEvents.length - visibleCount;

  // Reset visible count when events list is small (e.g. new game started)
  useEffect(() => {
    if (reversedEvents.length <= BATCH_SIZE) {
      setVisibleCount(BATCH_SIZE);
    }
  }, [reversedEvents.length]);

  const loadMore = useCallback(() => {
    setVisibleCount((prev) => Math.min(prev + BATCH_SIZE, reversedEvents.length));
  }, [reversedEvents.length]);

  // Track unseen plays when user has scrolled down
  useEffect(() => {
    if (!isAtTop && displayEvents.length > lastSeenCount.current) {
      setUnseenCount(displayEvents.length - lastSeenCount.current);
    }
    if (isAtTop) {
      lastSeenCount.current = displayEvents.length;
      setUnseenCount(0);
    }
  }, [displayEvents.length, isAtTop]);

  // Detect scroll position
  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const nearTop = scrollRef.current.scrollTop < 80;
    setIsAtTop(nearTop);
  }, []);

  const scrollToTop = () => {
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    setUnseenCount(0);
    lastSeenCount.current = displayEvents.length;
  };

  return (
    <div className="relative flex flex-col h-full">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-2 space-y-2"
      >
        {displayEvents.length === 0 && (
          <div className="flex items-center justify-center h-32 text-text-muted text-sm">
            Waiting for the first play...
          </div>
        )}

        {renderedEvents.map((event, idx) => {
          // Drive separator: show between plays when possession changes
          const nextEvent = renderedEvents[idx + 1]; // next = older play (reverse order)
          const showDriveSep = nextEvent &&
            nextEvent.gameState.possession !== event.gameState.possession;

          // Determine drive result for separator label
          const getDriveSepLabel = (): string => {
            // The current event is NEWER — it's the first play of the new drive
            // The nextEvent is the LAST play of the old drive
            const lastPlay = nextEvent?.playResult;
            if (!lastPlay) return 'CHANGE OF POSSESSION';
            if (lastPlay.isTouchdown) return 'TOUCHDOWN';
            if (lastPlay.scoring?.type === 'field_goal') return 'FIELD GOAL';
            if (lastPlay.scoring?.type === 'safety') return 'SAFETY';
            if (lastPlay.turnover?.type === 'interception') return 'INTERCEPTION';
            if (lastPlay.turnover?.type === 'fumble') return 'FUMBLE RECOVERY';
            if (lastPlay.turnover?.type === 'turnover_on_downs') return 'TURNOVER ON DOWNS';
            if (lastPlay.type === 'punt') return 'PUNT';
            return 'CHANGE OF POSSESSION';
          };

          return (
            <div key={event.eventNumber}>
              <PlayCard
                event={event}
                isNew={isLive && idx === 0}
                isFeatured={idx === 0}
              />
              {showDriveSep && (
                <div className="flex items-center gap-2 py-1.5 px-1">
                  <div className="flex-1 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
                  <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-text-muted/60 whitespace-nowrap">
                    {getDriveSepLabel()}
                  </span>
                  <div className="flex-1 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
                </div>
              )}
            </div>
          );
        })}

        {/* Load older plays button */}
        {hasMoreEvents && (
          <button
            onClick={loadMore}
            className="w-full py-2.5 rounded-lg border border-border/50 bg-surface/30 text-text-muted hover:text-text-secondary hover:bg-surface/60 hover:border-border transition-colors text-xs font-medium"
          >
            Load older plays ({hiddenCount} more)
          </button>
        )}
      </div>

      {/* Scroll-to-top pill when new plays arrive while scrolled down */}
      {!isAtTop && unseenCount > 0 && isLive && (
        <button
          onClick={scrollToTop}
          className="absolute top-3 left-1/2 -translate-x-1/2 bg-gold/90 backdrop-blur-sm rounded-full px-4 py-1.5 text-[11px] font-bold text-surface shadow-lg hover:bg-gold transition-colors z-10 animate-bounce-subtle"
        >
          {'\u2191'} {unseenCount} new play{unseenCount !== 1 ? 's' : ''}
        </button>
      )}
    </div>
  );
}

// ── Play Card ──────────────────────────────────────────────────

interface PlayCardProps {
  event: GameEvent;
  isNew: boolean;
  isFeatured?: boolean;
}

function PlayCard({ event, isNew, isFeatured = false }: PlayCardProps) {
  const { playResult, commentary, gameState } = event;
  const [showFullCommentary, setShowFullCommentary] = useState(false);

  // Determine border color based on play result
  const borderColor = getPlayBorderColor(event);

  // Determine if this play deserves a badge
  const badge = getPlayBadge(event);

  const situationText = formatDownAndDistance(
    gameState.down,
    gameState.yardsToGo,
    gameState.ballPosition
  );

  const fieldPos = formatFieldPosition(
    gameState.ballPosition,
    gameState.homeTeam.abbreviation,
    gameState.awayTeam.abbreviation,
    gameState.possession
  );

  const clockText = `Q${gameState.quarter === 'OT' ? 'OT' : gameState.quarter} ${formatClock(gameState.clock)}`;

  // Get offensive team logo
  const offensiveTeam = gameState.possession === 'home' ? gameState.homeTeam : gameState.awayTeam;
  const logoUrl = getTeamScoreboardLogoUrl(offensiveTeam.abbreviation);

  return (
    <div
      className={`
        relative rounded-lg border transition-all duration-300
        ${isFeatured
          ? 'bg-surface/80 border-border shadow-lg shadow-black/20 ring-1 ring-white/[0.06]'
          : 'bg-surface/40 border-border/30 opacity-75 hover:opacity-100'
        }
        ${isNew ? 'play-enter' : ''}
      `}
      style={{ borderLeftWidth: isFeatured ? '4px' : '3px', borderLeftColor: borderColor }}
    >
      <div className={isFeatured ? 'p-3.5' : 'p-2.5'}>
        {/* Header: situation + yards */}
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={logoUrl}
              alt={offensiveTeam.abbreviation}
              width={isFeatured ? 18 : 14}
              height={isFeatured ? 18 : 14}
              className="flex-shrink-0 rounded-sm"
            />
            <span className={`font-mono text-text-muted tabular-nums flex-shrink-0 ${isFeatured ? 'text-[12px]' : 'text-[11px]'}`}>
              {clockText}
            </span>
            {badge && (
              <span
                className={`font-black tracking-widest uppercase px-1.5 py-0.5 rounded flex-shrink-0 ${isFeatured ? 'text-[11px]' : 'text-[10px]'}`}
                style={{
                  backgroundColor: `${borderColor}20`,
                  color: borderColor,
                }}
              >
                {badge}
              </span>
            )}
          </div>
          {playResult.yardsGained !== 0 &&
            playResult.type !== 'kickoff' &&
            playResult.type !== 'punt' &&
            playResult.type !== 'extra_point' &&
            playResult.type !== 'field_goal' && (
              <span
                className={`font-mono font-bold tabular-nums flex-shrink-0 ${
                  playResult.yardsGained > 0 ? 'text-success' : 'text-danger'
                } ${isFeatured ? 'text-sm' : 'text-xs'}`}
              >
                {formatYards(playResult.yardsGained)}
              </span>
            )}
        </div>

        {/* Play-by-play commentary */}
        <p className={`font-semibold text-text-primary leading-snug mb-1 ${isFeatured ? 'text-[15px]' : 'text-sm'}`}>
          {isNew ? (
            <TypewriterText text={commentary.playByPlay} speed={18} />
          ) : (
            commentary.playByPlay
          )}
        </p>

        {/* Color analysis */}
        {commentary.colorAnalysis && (
          <p
            className={`italic text-text-secondary leading-snug ${
              isFeatured ? 'text-[13px]' : 'text-xs'
            } ${!showFullCommentary && !isNew && !isFeatured ? 'line-clamp-1' : !showFullCommentary && !isNew ? 'line-clamp-2' : ''}`}
            onClick={() => setShowFullCommentary((prev) => !prev)}
          >
            {isNew ? (
              <TypewriterText
                text={commentary.colorAnalysis}
                speed={12}
                delay={commentary.playByPlay.length * 18 + 200}
              />
            ) : (
              commentary.colorAnalysis
            )}
          </p>
        )}

        {/* Play details footer */}
        <div className={`flex items-center gap-2 mt-2 text-text-muted ${isFeatured ? 'text-[11px]' : 'text-[11px]'}`}>
          {playResult.type !== 'kickoff' &&
            playResult.type !== 'punt' &&
            playResult.type !== 'extra_point' && (
              <>
                <span>{situationText}</span>
                <span className="text-border">{'|'}</span>
                <span>{fieldPos}</span>
              </>
            )}

          {/* Penalty info */}
          {playResult.penalty && !playResult.penalty.declined && !playResult.penalty.offsetting && (
            <>
              <span className="text-border">{'|'}</span>
              <span className="text-penalty-flag font-medium">
                {'\u26A0'} {playResult.penalty.description} ({playResult.penalty.yards} yds)
              </span>
            </>
          )}

          {/* Injury */}
          {playResult.injury && (
            <>
              <span className="text-border">{'|'}</span>
              <span className="text-danger font-medium">
                {'\u2795'} {playResult.injury.player.name} ({playResult.injury.severity})
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Typewriter Effect ────────────────────────────────────────────

function TypewriterText({
  text,
  speed = 20,
  delay = 0,
}: {
  text: string;
  speed?: number;
  delay?: number;
}) {
  const [displayedText, setDisplayedText] = useState('');
  const [isTyping, setIsTyping] = useState(true);

  useEffect(() => {
    setDisplayedText('');
    setIsTyping(true);

    const startTimeout = setTimeout(() => {
      let index = 0;
      const interval = setInterval(() => {
        index++;
        if (index >= text.length) {
          setDisplayedText(text);
          setIsTyping(false);
          clearInterval(interval);
        } else {
          setDisplayedText(text.slice(0, index));
        }
      }, speed);

      return () => clearInterval(interval);
    }, delay);

    return () => clearTimeout(startTimeout);
  }, [text, speed, delay]);

  return (
    <span>
      {displayedText}
      {isTyping && <span className="typewriter-cursor" />}
    </span>
  );
}

// ── Helpers ────────────────────────────────────────────────────

function getPlayBorderColor(event: GameEvent): string {
  const { playResult } = event;

  if (playResult.isTouchdown || playResult.scoring?.type === 'touchdown' || playResult.scoring?.type === 'defensive_touchdown' || playResult.scoring?.type === 'pick_six' || playResult.scoring?.type === 'fumble_recovery_td') {
    return '#fbbf24'; // gold — touchdown
  }
  if (playResult.turnover) {
    return '#ef4444'; // red — turnover
  }
  if (playResult.scoring?.type === 'field_goal' || playResult.scoring?.type === 'extra_point') {
    return '#60a5fa'; // blue — scoring
  }
  if (playResult.scoring?.type === 'safety') {
    return '#ef4444'; // red — safety
  }
  if (playResult.penalty && !playResult.penalty.declined && !playResult.penalty.offsetting) {
    return '#eab308'; // yellow — penalty
  }
  if (playResult.type === 'sack') {
    return '#f97316'; // orange — sack
  }
  if (playResult.yardsGained >= 15) {
    return '#22c55e'; // green — big play
  }
  return '#2d3548'; // subtle gray — normal
}

function getPlayBadge(event: GameEvent): string | null {
  const { playResult } = event;

  if (playResult.isTouchdown) return 'TOUCHDOWN';
  if (playResult.scoring?.type === 'field_goal') return 'FIELD GOAL';
  if (playResult.scoring?.type === 'safety') return 'SAFETY';
  if (playResult.scoring?.type === 'extra_point') return 'XP GOOD';
  if (playResult.scoring?.type === 'two_point_conversion') return '2PT GOOD';
  if (playResult.turnover?.type === 'interception') return 'INTERCEPTED';
  if (playResult.turnover?.type === 'fumble' || playResult.turnover?.type === 'fumble_recovery') return 'FUMBLE';
  if (playResult.turnover?.type === 'turnover_on_downs') return 'TURNOVER ON DOWNS';
  if (playResult.type === 'sack') return 'SACK';
  if (playResult.yardsGained >= 25) return 'BIG PLAY';
  if (playResult.penalty && !playResult.penalty.declined) return 'FLAG';
  return null;
}
