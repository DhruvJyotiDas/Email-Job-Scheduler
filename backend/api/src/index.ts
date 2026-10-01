import http from 'http';
import express, { NextFunction, Request, Response } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import pinoHttp from 'pino-http';
import { randomUUID } from 'crypto';
import { Server } from 'socket.io';
import swaggerUi from 'swagger-ui-express';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { ZodError } from 'zod';
import { EVENTS_CHANNEL, config, createRedis, emailQueue, ensureIndex, logger, prisma } from '@ejs/core';
import { SOCKET_EVENT_EMAIL } from '@ejs/shared';
import { authRouter, requireAuth, verifyToken } from './auth';
import { campaignsRouter } from './routes/campaigns';
import { emailsRouter } from './routes/emails';
import { sendersRouter, suppressionsRouter } from './routes/senders';
import { slackRouter } from './routes/slack';
import { demoRouter } from './routes/demo';
import { aiRouter } from './routes/ai';
import { statsRouter } from './routes/stats';
import { openapi } from './swagger';

// Fail fast in production if placeholder secrets are still in use.
if (config.env === 'production') {
  if (config.jwtSecret === 'dev-secret') {
    logger.fatal('JWT_SECRET is set to the default placeholder — refusing to start');
    process.exit(1);
  }
  if (config.encryptionKey === '0123456789abcdef0123456789abcdef') {
    logger.fatal('ENCRYPTION_KEY is set to the default placeholder — refusing to start');
    process.exit(1);
  }
}


const redis = createRedis();
const sub = createRedis();

const app = express();
app.set('trust proxy', 1); // behind Render's proxy: real client IP for rate limiting

app.use(helmet({ contentSecurityPolicy: false })); // CSP managed by nginx
app.use(cors({ origin: config.webUrl, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());
app.use(pinoHttp({ logger, genReqId: (req) => (req.headers['x-request-id'] as string) ?? randomUUID() }));

// Strict rate limit on auth endpoints to slow credential stuffing.
const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/me', // session check runs on every page load
});
// General API limit — generous enough for normal use, blocks runaway clients.
const apiLimiter = rateLimit({ windowMs: 60_000, max: 200, standardHeaders: true, legacyHeaders: false });

app.get('/health', (_req, res) => void res.json({ ok: true }));

app.get('/health/ready', async (_req, res) => {
  try {
    await Promise.all([prisma.$queryRaw`SELECT 1`, redis.ping()]);
    res.json({ ok: true });
  } catch (err) {
    res.status(503).json({ ok: false, error: String(err) });
  }
});

app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openapi));
app.use('/api/auth', authLimiter, authRouter);
app.use('/api/slack', slackRouter);
app.use('/api/campaigns', apiLimiter, requireAuth, campaignsRouter);
app.use('/api/emails', apiLimiter, requireAuth, emailsRouter);
app.use('/api/senders', apiLimiter, requireAuth, sendersRouter);
app.use('/api/suppressions', apiLimiter, requireAuth, suppressionsRouter);
app.use('/api/ai', apiLimiter, requireAuth, aiRouter);
app.use('/api/demo', apiLimiter, requireAuth, demoRouter);
app.use('/api/stats', apiLimiter, requireAuth, statsRouter);

const boardAdapter = new ExpressAdapter();
boardAdapter.setBasePath('/admin/queues');
createBullBoard({ queues: [new BullMQAdapter(emailQueue)], serverAdapter: boardAdapter });
app.use('/admin/queues', requireAuth, boardAdapter.getRouter());

app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ZodError) return void res.status(400).json({ error: 'validation', issues: err.issues });
  req.log.error({ err }, 'unhandled');
  res.status(500).json({ error: 'internal' });
});

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: config.webUrl, credentials: true } });

io.use((socket, next) => {
  const raw = socket.handshake.headers.cookie ?? '';
  const token = /ejs_token=([^;]+)/.exec(raw)?.[1];
  const userId = token ? verifyToken(decodeURIComponent(token)) : null;
  if (!userId) return next(new Error('unauthenticated'));
  socket.join(`user:${userId}`);
  next();
});

void sub.subscribe(EVENTS_CHANNEL);
sub.on('message', (_ch, msg) => {
  const { userId, ev } = JSON.parse(msg);
  if (userId) io.to(`user:${userId}`).emit(SOCKET_EVENT_EMAIL, ev);
});

server.listen(config.port, () => {
  logger.info({ port: config.port }, 'api listening');
  void ensureIndex().catch((err) => logger.warn({ err }, 'ES not ready'));
});

const shutdown = async () => {
  logger.info('shutting down');
  server.close(() => {
    void (async () => {
      await emailQueue.close();
      await prisma.$disconnect();
      redis.disconnect();
      sub.disconnect();
      process.exit(0);
    })();
  });
  // Force-exit after 10s if in-flight requests are stuck.
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());
