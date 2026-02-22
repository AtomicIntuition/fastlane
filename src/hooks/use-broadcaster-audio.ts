'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import type { GameEvent } from '@/lib/simulation/types';

export type BroadcasterVoice = 'male' | 'female';

/** Patterns to match male English voices across browsers/OS */
const MALE_PATTERN = /male|daniel|james|david|google us|aaron|fred|ralph|tom/i;
/** Patterns to match female English voices across browsers/OS */
const FEMALE_PATTERN = /female|samantha|karen|kate|victoria|zira|google uk english female|fiona|moira|tessa|allison/i;

/**
 * Pick the best English voice matching the requested gender.
 * Falls back to any English voice if no gender-specific match found.
 */
function pickVoiceForGender(
  voices: SpeechSynthesisVoice[],
  gender: BroadcasterVoice,
): SpeechSynthesisVoice | null {
  const english = voices.filter((v) => v.lang.startsWith('en'));
  const pattern = gender === 'male' ? MALE_PATTERN : FEMALE_PATTERN;

  return (
    english.find((v) => pattern.test(v.name)) ??
    english[0] ??
    null
  );
}

/**
 * Web Speech API broadcaster narration.
 * Speaks every play except pregame/coin_toss events.
 * Cancels previous utterance before speaking a new one.
 * Supports switching between male and female broadcaster voices.
 */
export function useBroadcasterAudio() {
  const [isMuted, setIsMuted] = useState(true); // default off
  const [voiceGender, setVoiceGender] = useState<BroadcasterVoice>('male');
  const lastSpokenRef = useRef<number | null>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const voicesLoadedRef = useRef<SpeechSynthesisVoice[]>([]);

  // Initialize synth + pick a voice on mount
  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    synthRef.current = window.speechSynthesis;

    const loadVoices = () => {
      voicesLoadedRef.current = synthRef.current?.getVoices() ?? [];
      voiceRef.current = pickVoiceForGender(voicesLoadedRef.current, voiceGender);
    };

    loadVoices();
    // Voices may load async in some browsers
    window.speechSynthesis.addEventListener('voiceschanged', loadVoices);
    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', loadVoices);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-pick voice when gender changes
  useEffect(() => {
    if (voicesLoadedRef.current.length > 0) {
      voiceRef.current = pickVoiceForGender(voicesLoadedRef.current, voiceGender);
    }
    // Cancel any ongoing speech so the next play uses the new voice
    if (synthRef.current) synthRef.current.cancel();
  }, [voiceGender]);

  const speak = useCallback(
    (event: GameEvent) => {
      if (isMuted || !synthRef.current) return;
      if (event.eventNumber === lastSpokenRef.current) return;

      // Skip non-play events (pregame intro, coin toss)
      const skipTypes = ['pregame', 'coin_toss'];
      if (skipTypes.includes(event.playResult.type)) return;

      // Cancel any ongoing speech
      synthRef.current.cancel();

      const text = event.commentary.playByPlay;
      if (!text) return;

      // Vary rate by excitement — bigger plays get a more energetic delivery
      const excitement = event.commentary.excitement;
      const rate = excitement >= 70 ? 1.2 : excitement >= 40 ? 1.1 : 1.0;

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = rate;
      // Slightly different pitch profiles for each voice
      utterance.pitch = voiceGender === 'male' ? 0.85 : 1.05;
      if (voiceRef.current) utterance.voice = voiceRef.current;

      synthRef.current.speak(utterance);
      lastSpokenRef.current = event.eventNumber;
    },
    [isMuted, voiceGender],
  );

  const toggle = useCallback(() => {
    // Cancel speech when muting
    if (!isMuted && synthRef.current) {
      synthRef.current.cancel();
    }
    setIsMuted((prev) => !prev);
  }, [isMuted]);

  const cycleVoice = useCallback(() => {
    setVoiceGender((prev) => (prev === 'male' ? 'female' : 'male'));
  }, []);

  return { isMuted, toggle, speak, voiceGender, cycleVoice };
}
