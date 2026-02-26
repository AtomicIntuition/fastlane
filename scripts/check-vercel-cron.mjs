import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const vercelPath = resolve(process.cwd(), 'vercel.json');
const raw = readFileSync(vercelPath, 'utf8');

let parsed;
try {
  parsed = JSON.parse(raw);
} catch {
  console.error('vercel.json is not valid JSON.');
  process.exit(1);
}

if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
  console.error('vercel.json must be an object.');
  process.exit(1);
}

const crons = Reflect.get(parsed, 'crons');
if (!Array.isArray(crons) || crons.length === 0) {
  console.error('vercel.json must include at least one cron entry.');
  process.exit(1);
}

const targetPath = '/api/fastlane/maintenance/run';
const cronEntry = crons.find((entry) => entry && typeof entry === 'object' && entry.path === targetPath);

if (!cronEntry) {
  console.error(`vercel.json must include cron path "${targetPath}".`);
  process.exit(1);
}

const schedule = cronEntry.schedule;
if (typeof schedule !== 'string') {
  console.error(`Cron "${targetPath}" must include a schedule string.`);
  process.exit(1);
}

const fields = schedule.trim().split(/\s+/);
if (fields.length !== 5) {
  console.error(`Cron "${targetPath}" schedule must use 5-field cron format. Received: "${schedule}"`);
  process.exit(1);
}

const isWildcard = (value) => value === '*';
const isInteger = (value) => /^\d+$/.test(value);
const parseOrNull = (value) => (isInteger(value) ? Number(value) : null);

const [minute, hour] = fields;
const minuteNumber = parseOrNull(minute);
const hourNumber = parseOrNull(hour);

if (!(isWildcard(minute) || (minuteNumber !== null && minuteNumber >= 0 && minuteNumber <= 59))) {
  console.error(`Cron "${targetPath}" minute field is invalid: "${minute}"`);
  process.exit(1);
}
if (!(isWildcard(hour) || (hourNumber !== null && hourNumber >= 0 && hourNumber <= 23))) {
  console.error(`Cron "${targetPath}" hour field is invalid: "${hour}"`);
  process.exit(1);
}

console.log(`Vercel cron check passed: ${targetPath} @ "${schedule}"`);
