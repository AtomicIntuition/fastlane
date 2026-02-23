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
 * Retry loading voices for iOS Safari which loads them lazily.
 * Polls getVoices() up to 10 times at 200ms intervals.
 */
function retryVoiceLoading(
  synth: SpeechSynthesis,
  gender: BroadcasterVoice,
  onLoaded: (voices: SpeechSynthesisVoice[], voice: SpeechSynthesisVoice | null) => void,
) {
  let attempts = 0;
  const poll = setInterval(() => {
    attempts++;
    const voices = synth.getVoices();
    if (voices.length > 0 || attempts >= 10) {
      clearInterval(poll);
      if (voices.length > 0) {
        onLoaded(voices, pickVoiceForGender(voices, gender));
      }
    }
  }, 200);
  return poll;
}

/**
 * Web Speech API broadcaster narration.
 * Speaks every play except pregame/coin_toss events.
 * Cancels previous utterance before speaking a new one.
 * Supports switching between male and female broadcaster voices.
 *
 * iOS Safari fixes:
 * - Warm-up silent utterance on unmute to unlock audio pipeline
 * - Resume synth before every speak() (iOS pauses on blur)
 * - Retry voice loading for lazy iOS voice enumeration
 * - Keep-alive interval prevents stale synth state
 */
export function useBroadcasterAudio() {
  const [isMuted, setIsMuted] = useState(true); // default off
  const [voiceGender, setVoiceGender] = useState<BroadcasterVoice>('male');
  const lastSpokenRef = useRef<number | null>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const voicesLoadedRef = useRef<SpeechSynthesisVoice[]>([]);
  const keepAliveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const retryPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
      if (keepAliveRef.current) clearInterval(keepAliveRef.current);
      if (retryPollRef.current) clearInterval(retryPollRef.current);
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

  // Keep-alive: when unmuted, periodically call resume() to prevent iOS stale synth
  useEffect(() => {
    if (isMuted) {
      if (keepAliveRef.current) {
        clearInterval(keepAliveRef.current);
        keepAliveRef.current = null;
      }
      return;
    }
    keepAliveRef.current = setInterval(() => {
      if (synthRef.current) synthRef.current.resume();
    }, 5000);
    return () => {
      if (keepAliveRef.current) {
        clearInterval(keepAliveRef.current);
        keepAliveRef.current = null;
      }
    };
  }, [isMuted]);

  const speak = useCallback(
    (event: GameEvent) => {
      if (isMuted || !synthRef.current) return;
      if (event.eventNumber === lastSpokenRef.current) return;

      // Skip non-play events (pregame intro, coin toss)
      const skipTypes = ['pregame', 'coin_toss'];
      if (skipTypes.includes(event.playResult.type)) return;

      // iOS fix: resume before cancel/speak in case synth is paused
      synthRef.current.resume();
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

      // iOS failsafe: if speaking but paused after 500ms, resume
      const synth = synthRef.current;
      setTimeout(() => {
        if (synth && synth.speaking && synth.paused) {
          synth.resume();
        }
      }, 500);
    },
    [isMuted, voiceGender],
  );

  const toggle = useCallback(() => {
    if (!isMuted && synthRef.current) {
      // Cancel speech when muting
      synthRef.current.cancel();
    } else if (isMuted && synthRef.current) {
      // Unmuting — warm up iOS audio pipeline with a silent utterance
      const warmup = new SpeechSynthesisUtterance('');
      warmup.volume = 0;
      synthRef.current.resume();
      synthRef.current.speak(warmup);

      // Retry voice loading if voices haven't loaded yet (iOS lazy loading)
      if (voicesLoadedRef.current.length === 0) {
        if (retryPollRef.current) clearInterval(retryPollRef.current);
        retryPollRef.current = retryVoiceLoading(synthRef.current, voiceGender, (voices, voice) => {
          voicesLoadedRef.current = voices;
          voiceRef.current = voice;
          retryPollRef.current = null;
        });
      }
    }
    setIsMuted((prev) => !prev);
  }, [isMuted, voiceGender]);

  const cycleVoice = useCallback(() => {
    setVoiceGender((prev) => (prev === 'male' ? 'female' : 'male'));
  }, []);

  return { isMuted, toggle, speak, voiceGender, cycleVoice };
}
