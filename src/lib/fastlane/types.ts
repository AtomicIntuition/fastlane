export type FastTier = 'free' | 'pro';

export type FastingGoal = 'weight' | 'energy' | 'metabolic' | 'routine';
export type ExperienceLevel = 'new' | 'intermediate' | 'advanced';

export interface FastingProtocol {
  id: string;
  label: string;
  fastHours: number;
  eatHours: number;
  premium?: boolean;
}

export interface FastSession {
  id: string;
  startAt: string;
  endAt: string;
  durationMinutes: number;
  protocolId: string;
}

export interface DailyCheckIn {
  date: string;
  energy: number;
  hunger: number;
  mood: number;
}

export interface FastLaneProfile {
  goal: FastingGoal;
  experience: ExperienceLevel;
  protocolId: string;
  wakeTime: string;
  sleepTime: string;
  reminders: boolean;
}

export interface FastLaneState {
  onboarded: boolean;
  tier: FastTier;
  profile: FastLaneProfile;
  activeFastStartAt: string | null;
  sessions: FastSession[];
  checkIns: DailyCheckIn[];
  flags: {
    firstFastStartedTracked: boolean;
    firstFastCompletedTracked: boolean;
    postOnboardingPaywallSeen: boolean;
  };
}

export interface FastLaneNotificationItem {
  id: string;
  title: string;
  body: string;
  sendAt: string;
  channel: 'in_app' | 'email';
  priority: 'normal' | 'high';
}

export interface FastLaneNotificationPlan {
  enabled: boolean;
  generatedAt: string;
  next: FastLaneNotificationItem[];
}

export const FASTING_PROTOCOLS: FastingProtocol[] = [
  { id: '12_12', label: '12:12 Starter', fastHours: 12, eatHours: 12 },
  { id: '14_10', label: '14:10 Balance', fastHours: 14, eatHours: 10 },
  { id: '16_8', label: '16:8 Classic', fastHours: 16, eatHours: 8 },
  { id: '18_6', label: '18:6 Lean', fastHours: 18, eatHours: 6, premium: true },
  { id: '20_4', label: '20:4 Focus', fastHours: 20, eatHours: 4, premium: true },
  { id: 'omad', label: 'OMAD', fastHours: 23, eatHours: 1, premium: true },
];

export function getFastingProtocolById(id: string | null | undefined): FastingProtocol | undefined {
  if (!id) return undefined;
  return FASTING_PROTOCOLS.find((protocol) => protocol.id === id);
}

export const DEFAULT_STATE: FastLaneState = {
  onboarded: false,
  tier: 'free',
  profile: {
    goal: 'energy',
    experience: 'new',
    protocolId: '16_8',
    wakeTime: '07:00',
    sleepTime: '23:00',
    reminders: true,
  },
  activeFastStartAt: null,
  sessions: [],
  checkIns: [],
  flags: {
    firstFastStartedTracked: false,
    firstFastCompletedTracked: false,
    postOnboardingPaywallSeen: false,
  },
};
