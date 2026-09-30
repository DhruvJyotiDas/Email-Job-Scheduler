import path from 'path';
import dotenv from 'dotenv';

// Load the repo-root .env regardless of which workspace is the cwd.
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const num = (k: string, d: number) => (process.env[k] ? Number(process.env[k]) : d);

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  port: num('PORT', 4000),
  webUrl: process.env.WEB_URL ?? 'http://localhost:5173',
  apiUrl: process.env.API_URL ?? 'http://localhost:4000',
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  esUrl: process.env.ELASTICSEARCH_URL ?? 'http://localhost:9200',
  jwtSecret: process.env.JWT_SECRET ?? 'dev-secret',
  encryptionKey: process.env.ENCRYPTION_KEY ?? '0123456789abcdef0123456789abcdef',
  google: { clientId: process.env.GOOGLE_CLIENT_ID ?? '', clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '' },
  slack: { clientId: process.env.SLACK_CLIENT_ID ?? '', clientSecret: process.env.SLACK_CLIENT_SECRET ?? '' },
  gemini: {
    apiKey: process.env.GEMINI_API_KEY ?? '',
    model: process.env.GEMINI_MODEL ?? 'gemini-3.8-flash',
    fallbackModel: process.env.GEMINI_FALLBACK_MODEL ?? 'gemini-3.1-flash-lite',
    dailyLimitPerUser: num('AI_DAILY_LIMIT_PER_USER', 20),
  },
  workerConcurrency: num('WORKER_CONCURRENCY', 5),
  maxEmailsPerHourPerSender: num('MAX_EMAILS_PER_HOUR_PER_SENDER', 200),
  minDelayBetweenSendsMs: num('MIN_DELAY_BETWEEN_SENDS_MS', 2000),
  bullBoard: { user: process.env.BULL_BOARD_USER ?? 'admin', pass: process.env.BULL_BOARD_PASS ?? 'admin' },
  dailyEmailLimitPerUser: num('DAILY_EMAIL_LIMIT_PER_USER', 50_000),
  retentionDays: num('EMAIL_RETENTION_DAYS', 90),
  otlpEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? '',
};
