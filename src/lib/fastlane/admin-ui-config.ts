export const ADMIN_OVERVIEW_WINDOW_OPTIONS = [7, 14, 30, 60] as const;
export const ADMIN_OVERVIEW_DEFAULT_WINDOW_DAYS = 7;

export const ADMIN_KPI_DAY_RANGE = {
  min: 1,
  max: 90,
  fallback: 30,
} as const;

export const ADMIN_WEBHOOK_LIMIT_RANGE = {
  min: 1,
  max: 100,
  fallback: 25,
} as const;

export const ADMIN_READINESS_RETENTION_RANGE = {
  min: 1,
  max: 365,
  fallback: 30,
} as const;

export const ADMIN_MAINTENANCE_BATCH_LIMIT = 1000;
