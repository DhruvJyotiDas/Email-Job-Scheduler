import http from 'http';
import express, { NextFunction, Request, Response } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
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
import { aiRouter } from './routes/ai';
import { statsRouter } from './routes/stats';
import { openapi } from './swagger';

const app = express();
app.use(cors({ origin: config.webUrl, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());
app.use(pinoHttp({ logger, genReqId: (req) => (req.headers['x-request-id'] as string) ?? randomUUID() }));

app.get('/health', (_req, res) => void res.json({ ok: true }));
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openapi));

app.use('/api/auth', authRouter);
app.use('/api/slack', slackRouter); // /callback is public (bound by signed state); others self-guard
app.use('/api/campaigns', requireAuth, campaignsRouter);
app.use('/api/emails', requireAuth, emailsRouter);
app.use('/api/senders', requireAuth, sendersRouter);
app.use('/api/suppressions', requireAuth, suppressionsRouter);
app.use('/api/ai', requireAuth, aiRouter);
app.use('/api/stats', requireAuth, statsRouter);

// Bull Board, protected by the session cookie (same login as the app).
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

// Worker -> Redis pub/sub -> socket.io rooms (keeps API and worker decoupled).
const sub = createRedis();
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
  server.close();
  io.close();
  await emailQueue.close();
  await prisma.$disconnect();
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());
