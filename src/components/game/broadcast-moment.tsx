'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import type {
  GameEvent,
  GameState,
  BoxScore,
  PlayerGameStats,
} from '@/lib/simulation/types';

interface BroadcastMomentProps {
  currentEvent: GameEvent | null;
  previousEvents: GameEvent[];
  gameState: GameState | null;
  boxScore: BoxScore | null;
}

type CardType =
  | 'pre_snap'
  | 'player_spotlight'
  | 'drive_summary'
  | 'situation_alert'
  | 'scoring_summary'
  | 'momentum_shift';

interface BroadcastCard {
  type: CardType;
  label: string;
  content: string;
  accent?: string;
}

/**
 * Contextual broadcast cards shown between plays.
 * Picks the most relevant card based on game situation,
 * displays for a few seconds after each new play, then fades.
 */
export function BroadcastMoment({
  currentEvent,
  previousEvents,
  gameState,
  boxScore,
}: BroadcastMomentProps) {
  const [visible, setVisible] = useState(false);
  const [card, setCard] = useState<BroadcastCard | null>(null);
  const prevEventRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Pick the best card when a new event arrives
  useEffect(() => {
    if (!currentEvent || !gameState) return;

    // Skip pregame/coin_toss events
    if (currentEvent.playResult.type === 'pregame' || currentEvent.playResult.type === 'coin_toss') return;

    // Only trigger on new events
    if (currentEvent.eventNumber === prevEventRef.current) return;
    prevEventRef.current = currentEvent.eventNumber;

    const newCard = selectCard(currentEvent, previousEvents, gameState, boxScore);
    if (!newCard) return;

    // Clear previous timer
    if (timerRef.current) clearTimeout(timerRef.current);

    setCard(newCard);
    setVisible(true);

    // Fade out after 5 seconds
    timerRef.current = setTimeout(() => {
      setVisible(false);
    }, 5000);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [currentEvent?.eventNumber]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!card) return null;

  return (
    <div
      className="px-3 py-1.5 border-b border-border/30 overflow-hidden transition-all duration-500"
      style={{
        maxHeight: visible ? '80px' : '0px',
        opacity: visible ? 1 : 0,
        paddingTop: visible ? undefined : '0px',
        paddingBottom: visible ? undefined : '0px',
      }}
    >
      <div className="flex items-center gap-2">
        <span
          className="text-[9px] font-black tracking-widest uppercase px-1.5 py-0.5 rounded flex-shrink-0"
          style={{
            backgroundColor: `${card.accent ?? '#60a5fa'}20`,
            color: card.accent ?? '#60a5fa',
          }}
        >
          {card.label}
        </span>
        <span className="text-xs text-text-secondary leading-snug line-clamp-2">
          {card.content}
        </span>
      </div>
    </div>
  );
}

function selectCard(
  event: GameEvent,
  previousEvents: GameEvent[],
  gameState: GameState,
  boxScore: BoxScore | null,
): BroadcastCard | null {
  const play = event.playResult;
  const narrative = event.narrativeContext;

  // Situation alerts take priority
  if (gameState.ballPosition >= 80 && gameState.ballPosition < 95 && !gameState.kickoff && !gameState.patAttempt) {
    return { type: 'situation_alert', label: 'RED ZONE', content: `${getPossessingTeamName(gameState)} driving inside the ${100 - gameState.ballPosition}-yard line.`, accent: '#ef4444' };
  }
  if (gameState.ballPosition >= 95 && !gameState.kickoff && !gameState.patAttempt) {
    return { type: 'situation_alert', label: 'GOAL LINE', content: `${getPossessingTeamName(gameState)} knocking on the door at the ${100 - gameState.ballPosition}-yard line.`, accent: '#ef4444' };
  }
  if (gameState.down === 4 && !gameState.kickoff && !gameState.patAttempt && play.type !== 'punt' && play.type !== 'field_goal') {
    return { type: 'situation_alert', label: '4TH DOWN', content: `4th & ${gameState.yardsToGo} — big decision coming up for ${getPossessingTeamName(gameState)}.`, accent: '#f97316' };
  }

  // Momentum shift
  if (Math.abs(narrative.momentum) > 50) {
    const team = narrative.momentum > 0 ? gameState.homeTeam.name : gameState.awayTeam.name;
    return { type: 'momentum_shift', label: 'MOMENTUM', content: `Momentum swinging to ${team}.`, accent: '#a855f7' };
  }

  // Scoring summary after a score
  if (play.scoring) {
    return {
      type: 'scoring_summary',
      label: 'SCORE UPDATE',
      content: `${gameState.awayTeam.abbreviation} ${gameState.awayScore} — ${gameState.homeTeam.abbreviation} ${gameState.homeScore} | Q${gameState.quarter === 'OT' ? 'OT' : gameState.quarter}`,
      accent: '#fbbf24',
    };
  }

  // Player spotlight — find top performers from box score
  if (boxScore && previousEvents.length > 10 && Math.random() < 0.4) {
    const spotlight = getPlayerSpotlight(boxScore);
    if (spotlight) {
      return { type: 'player_spotlight', label: 'PLAYER SPOTLIGHT', content: spotlight, accent: '#22c55e' };
    }
  }

  // 3rd down analysis
  if (gameState.down === 3 && boxScore) {
    const teamStats = gameState.possession === 'home' ? boxScore.homeStats : boxScore.awayStats;
    const convRate = teamStats.thirdDownAttempts > 0
      ? `${teamStats.thirdDownConversions}-for-${teamStats.thirdDownAttempts}`
      : '0-for-0';
    return {
      type: 'pre_snap',
      label: '3RD DOWN',
      content: `3rd & ${gameState.yardsToGo} — ${getPossessingTeamName(gameState)} is ${convRate} on 3rd down today.`,
      accent: '#60a5fa',
    };
  }

  // Drive summary after 4+ plays in a drive
  if (event.driveNumber > 0) {
    const drivePlays = previousEvents.filter(e => e.driveNumber === event.driveNumber);
    if (drivePlays.length >= 4 && drivePlays.length % 3 === 0) {
      const driveYards = drivePlays.reduce((sum, e) => {
        const yd = e.playResult.yardsGained;
        if (e.playResult.type === 'kickoff' || e.playResult.type === 'punt') return sum;
        return sum + yd;
      }, 0);
      return {
        type: 'drive_summary',
        label: 'DRIVE',
        content: `${drivePlays.length} plays, ${driveYards} yards — ${getPossessingTeamName(gameState)} moving the ball.`,
        accent: '#06b6d4',
      };
    }
  }

  // Default: no card (gaps without cards are fine)
  return null;
}

function getPossessingTeamName(gameState: GameState): string {
  return gameState.possession === 'home'
    ? gameState.homeTeam.name
    : gameState.awayTeam.name;
}

function getPlayerSpotlight(boxScore: BoxScore): string | null {
  // Find top passer
  const allPlayers = [...boxScore.homePlayerStats, ...boxScore.awayPlayerStats];
  const topPasser = allPlayers
    .filter(p => p.attempts > 0)
    .sort((a, b) => b.passingYards - a.passingYards)[0];

  const topRusher = allPlayers
    .filter(p => p.carries > 0)
    .sort((a, b) => b.rushingYards - a.rushingYards)[0];

  const topReceiver = allPlayers
    .filter(p => p.receptions > 0)
    .sort((a, b) => b.receivingYards - a.receivingYards)[0];

  // Pick the most impressive stat line
  const candidates: string[] = [];

  if (topPasser && topPasser.passingYards > 100) {
    candidates.push(
      `${topPasser.player.name} — ${topPasser.completions}/${topPasser.attempts}, ${topPasser.passingYards} yds${topPasser.passingTDs > 0 ? `, ${topPasser.passingTDs} TD` : ''}`,
    );
  }
  if (topRusher && topRusher.rushingYards > 40) {
    candidates.push(
      `${topRusher.player.name} — ${topRusher.carries} carries, ${topRusher.rushingYards} yds${topRusher.rushingTDs > 0 ? `, ${topRusher.rushingTDs} TD` : ''}`,
    );
  }
  if (topReceiver && topReceiver.receivingYards > 50) {
    candidates.push(
      `${topReceiver.player.name} — ${topReceiver.receptions} rec, ${topReceiver.receivingYards} yds${topReceiver.receivingTDs > 0 ? `, ${topReceiver.receivingTDs} TD` : ''}`,
    );
  }

  if (candidates.length === 0) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}
