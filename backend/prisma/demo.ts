/**
 * Loads demo data into an existing account through the real API (same path the UI uses).
 *
 *   npm run demo -- you@gmail.com            # sent + future campaigns
 *   npm run demo -- you@gmail.com ratelimit  # also fire a low-limit campaign to trigger the Slack alert
 *
 * Env: DATABASE_URL (to look up the user), JWT_SECRET (same as the API), API_URL (default http://localhost:4000).
 * The user must have logged in once so their row exists.
 */
import jwt from 'jsonwebtoken';
import { config, prisma } from '@ejs/core';

const email = process.argv[2] ?? process.env.DEMO_USER_EMAIL;
const withRateLimit = process.argv.includes('ratelimit');
const apiUrl = (process.env.API_URL ?? config.apiUrl).replace(/\/$/, '');
const minutesAhead = Number(process.env.DEMO_FUTURE_MINUTES ?? 6);

const FIRST_NAMES = ['Alice', 'Bob', 'Carol', 'Dave', 'Erin', 'Frank', 'Grace', 'Heidi', 'Ivan', 'Judy', 'Ken', 'Liam', 'Mia', 'Noah', 'Olivia'];
const people = (n: number, domain = 'example.com') =>
  FIRST_NAMES.slice(0, n).map((firstName) => ({ email: `${firstName.toLowerCase()}@${domain}`, variables: { firstName } }));

async function main() {
  if (!email) throw new Error('Usage: npm run demo -- <your-google-email> [ratelimit]');
  const user = await prisma.user.findFirst({ where: { email } });
  if (!user) throw new Error(`No user with email ${email}. Log in to the app once with Google first.`);

  const cookie = `ejs_token=${jwt.sign({ sub: user.id }, config.jwtSecret, { expiresIn: '1h' })}`;
  const call = async (method: string, path: string, body?: unknown) => {
    const res = await fetch(`${apiUrl}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${await res.text()}`);
    return res.json() as Promise<any>;
  };

  // 3 Ethereal senders so rotation and per-sender limits are visible.
  const have = (await call('GET', '/api/senders')).length as number;
  for (let i = have; i < 3; i++) console.log('created sender', (await call('POST', '/api/senders/ethereal', {})).email);

  const inSeconds = (s: number) => new Date(Date.now() + s * 1000).toISOString();

  const now = await call('POST', '/api/campaigns', {
    name: 'Demo: Welcome series (sends now)',
    subject: 'Welcome aboard, {{firstName}}!',
    body: '<p>Hi {{firstName}},</p><p>{Thanks|Thank you} for signing up. This is a demo email sent through the scheduler.</p>',
    recipients: people(6),
    startAt: inSeconds(10),
    delayMs: 2000,
    hourlyLimit: 200,
  });
  console.log(`1) sends in ~10s: ${now.total} emails`);

  const later = await call('POST', '/api/campaigns', {
    name: 'Demo: Product launch (scheduled for later)',
    subject: 'Big launch: {{firstName}}, you are invited',
    body: '<p>Hello {{firstName}},</p><p>Our new product launches today. Reply to this email to book a demo.</p>',
    recipients: people(8, 'launch.example.com'),
    startAt: inSeconds(minutesAhead * 60),
    delayMs: 3000,
    hourlyLimit: 200,
  });
  console.log(`2) sends in ~${minutesAhead} min: ${later.total} emails  <- stop/restart the server before this time`);

  if (withRateLimit) {
    const rl = await call('POST', '/api/campaigns', {
      name: 'Demo: Rate limit (hourly limit = 3)',
      subject: 'Rate limit demo for {{firstName}}',
      body: '<p>Hi {{firstName}}, this campaign has an hourly limit of 3 per sender, so the rest are rescheduled, never dropped.</p>',
      recipients: people(15, 'ratelimit.example.com'),
      startAt: inSeconds(15),
      delayMs: 1000,
      hourlyLimit: 3,
    });
    console.log(`3) rate limit: ${rl.total} emails, 3 senders x 3/hour = 9 send, the rest wait for the next hour + Slack alert`);
  }
  console.log('done. Open the dashboard.');
}

main()
  .catch((e) => {
    console.error(e.message ?? e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
