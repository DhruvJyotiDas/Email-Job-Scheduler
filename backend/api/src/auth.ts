import { NextFunction, Request, Response, Router } from 'express';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { config, prisma } from '@ejs/core';

const COOKIE = 'ejs_token';
const cookieOpts = { httpOnly: true, sameSite: 'lax' as const, secure: config.env === 'production', maxAge: 7 * 86400_000 };

export const uid = (req: Request): string => (req as Request & { userId: string }).userId;
export interface AuthedRequest extends Request {
  userId: string;
}

export const signToken = (userId: string) => jwt.sign({ sub: userId }, config.jwtSecret, { expiresIn: '7d' });
export const verifyToken = (t: string): string | null => {
  try {
    return (jwt.verify(t, config.jwtSecret) as { sub: string }).sub;
  } catch {
    return null;
  }
};

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const userId = req.cookies?.[COOKIE] ? verifyToken(req.cookies[COOKIE]) : null;
  if (!userId) return void res.status(401).json({ error: 'unauthenticated' });
  (req as AuthedRequest).userId = userId;
  next();
}

const oauth = () =>
  new OAuth2Client(config.google.clientId, config.google.clientSecret, `${config.apiUrl}/api/auth/google/callback`);

export const authRouter = Router();

authRouter.get('/google', (_req, res) => {
  if (!config.google.clientId) return void res.status(501).json({ error: 'GOOGLE_CLIENT_ID not configured' });
  res.redirect(oauth().generateAuthUrl({ scope: ['openid', 'email', 'profile'], prompt: 'select_account' }));
});

authRouter.get('/google/callback', async (req, res) => {
  const { tokens } = await oauth().getToken(String(req.query.code));
  const ticket = await oauth().verifyIdToken({ idToken: tokens.id_token!, audience: config.google.clientId });
  const p = ticket.getPayload()!;
  const user = await prisma.user.upsert({
    where: { googleSub: p.sub },
    update: { name: p.name ?? p.email!, email: p.email!, avatarUrl: p.picture },
    create: { googleSub: p.sub, name: p.name ?? p.email!, email: p.email!, avatarUrl: p.picture },
  });
  res.cookie(COOKIE, signToken(user.id), cookieOpts).redirect(config.webUrl);
});

/** Local-only convenience so the app is usable before Google credentials exist. Disabled in production. */
authRouter.post('/dev-login', async (_req, res) => {
  if (config.env === 'production') return void res.status(404).end();
  const user = await prisma.user.upsert({
    where: { googleSub: 'dev-user' },
    update: {},
    create: { googleSub: 'dev-user', name: 'Oliver Brown', email: 'oliver.brown@domain.io' },
  });
  res.cookie(COOKIE, signToken(user.id), cookieOpts).json({ ok: true });
});

authRouter.get('/me', requireAuth, async (req, res) => {
  const u = await prisma.user.findUnique({ where: { id: uid(req) } });
  if (!u) return void res.status(401).json({ error: 'unauthenticated' });
  const slack = await prisma.slackConnection.findUnique({ where: { userId: u.id } });
  res.json({ id: u.id, name: u.name, email: u.email, avatarUrl: u.avatarUrl, slackConnected: !!slack });
});

authRouter.post('/logout', (_req, res) => {
  res.clearCookie(COOKIE).json({ ok: true });
});
