import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { config, encrypt, postSlack, prisma } from '@ejs/core';
import { requireAuth, uid } from '../auth';

export const slackRouter = Router();
const redirectUri = () => `${config.apiUrl}/api/slack/callback`;

/** Step 1: send the user to Slack's real authorize screen. `state` is a signed, short-lived user binding. */
slackRouter.get('/connect', requireAuth, (req, res) => {
  if (!config.slack.clientId) return void res.status(501).json({ error: 'SLACK_CLIENT_ID not configured' });
  const state = jwt.sign({ sub: uid(req) }, config.jwtSecret, { expiresIn: '10m' });
  const url = new URL('https://slack.com/oauth/v2/authorize');
  url.search = new URLSearchParams({
    client_id: config.slack.clientId,
    scope: 'chat:write,chat:write.public',
    redirect_uri: redirectUri(),
    state,
  }).toString();
  res.redirect(url.toString());
});

/** Step 2: exchange the code, store the bot token (encrypted) per user, confirm with a live message. */
slackRouter.get('/callback', async (req, res) => {
  let userId: string;
  try {
    userId = (jwt.verify(String(req.query.state), config.jwtSecret) as { sub: string }).sub;
  } catch {
    return void res.status(400).send('Invalid or expired state');
  }
  const r = await fetch('https://slack.com/api/oauth.v2.access', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: String(req.query.code),
      client_id: config.slack.clientId,
      client_secret: config.slack.clientSecret,
      redirect_uri: redirectUri(),
    }),
  });
  const j = (await r.json()) as { ok: boolean; error?: string; access_token?: string; team?: { id: string } };
  if (!j.ok || !j.access_token) return void res.status(400).send(`Slack error: ${j.error}`);

  const channel = process.env.SLACK_CHANNEL ?? 'general';
  await prisma.slackConnection.upsert({
    where: { userId },
    update: { accessTokenEnc: encrypt(j.access_token), teamId: j.team?.id ?? '', channel },
    create: { userId, accessTokenEnc: encrypt(j.access_token), teamId: j.team?.id ?? '', channel },
  });
  await postSlack(userId, ':white_check_mark: Email Job Scheduler connected. Rate-limit alerts will appear here.');
  res.redirect(`${config.webUrl}/?slack=connected`);
});

slackRouter.post('/test', requireAuth, async (req, res) => {
  const ok = await postSlack(uid(req), ':bell: Test alert from Email Job Scheduler');
  res.status(ok ? 200 : 409).json({ sent: ok });
});

slackRouter.delete('/', requireAuth, async (req, res) => {
  await prisma.slackConnection.deleteMany({ where: { userId: uid(req) } });
  res.status(204).end();
});
