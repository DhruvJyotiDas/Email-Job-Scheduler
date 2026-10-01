import { Router } from 'express';
import nodemailer from 'nodemailer';
import { config, encrypt, prisma } from '@ejs/core';
import { uid } from '../auth';
import { CreateCampaignInput, createCampaign } from './campaigns';

export const demoRouter = Router();

const FIRST_NAMES = ['Alice', 'Bob', 'Carol', 'Dave', 'Erin', 'Frank', 'Grace', 'Heidi', 'Ivan', 'Judy', 'Ken', 'Liam', 'Mia', 'Noah', 'Olivia'];
const people = (n: number, domain: string) =>
  FIRST_NAMES.slice(0, n).map((firstName) => ({ email: `${firstName.toLowerCase()}@${domain}`, variables: { firstName } }));
const inSeconds = (s: number) => new Date(Date.now() + s * 1000).toISOString();

/** Make sure the account has a few Ethereal senders so rotation and per-sender limits are visible. */
async function ensureSenders(userId: string, wanted = 3) {
  const have = await prisma.sender.count({ where: { userId } });
  for (let i = have; i < wanted; i++) {
    const a = await nodemailer.createTestAccount();
    await prisma.sender.create({
      data: { userId, email: a.user, etherealUser: a.user, etherealPassEnc: encrypt(a.pass), hourlyLimit: config.maxEmailsPerHourPerSender },
    });
  }
}

const welcome: CreateCampaignInput = {
  name: 'Demo: Welcome series (sends now)',
  subject: 'Welcome aboard, {{firstName}}!',
  body: '<p>Hi {{firstName}},</p><p>{Thanks|Thank you} for signing up. This is a demo email sent through the scheduler.</p>',
  recipients: people(6, 'example.com'),
  startAt: '',
  delayMs: 2000,
  hourlyLimit: 200,
};

const launch: CreateCampaignInput = {
  name: 'Demo: Product launch (scheduled for later)',
  subject: 'Big launch: {{firstName}}, you are invited',
  body: '<p>Hello {{firstName}},</p><p>Our new product launches today. Reply to this email to book a demo.</p>',
  recipients: people(8, 'launch.example.com'),
  startAt: '',
  delayMs: 3000,
  hourlyLimit: 200,
};

const rateLimit: CreateCampaignInput = {
  name: 'Demo: Rate limit (hourly limit 3)',
  subject: 'Rate limit demo for {{firstName}}',
  body: '<p>Hi {{firstName}}, this campaign has an hourly limit of 3 per sender, so the rest are rescheduled, never dropped.</p>',
  recipients: people(15, 'ratelimit.example.com'),
  startAt: '',
  delayMs: 1000,
  hourlyLimit: 3,
};

/**
 * POST /api/demo                 -> one campaign that sends in ~10 s and one scheduled ~5 min ahead (restart demo)
 * POST /api/demo?mode=ratelimit  -> 15 emails with an hourly limit of 3 (rescheduling + Slack alert)
 */
demoRouter.post('/', async (req, res) => {
  const userId = uid(req);
  await ensureSenders(userId);

  const plan =
    req.query.mode === 'ratelimit'
      ? [{ input: rateLimit, startInSec: 10 }]
      : [
          { input: welcome, startInSec: 10 },
          { input: launch, startInSec: 5 * 60 },
        ];

  const created: { name: string; total: number }[] = [];
  for (const { input, startInSec } of plan) {
    const r = await createCampaign(userId, { ...input, startAt: inSeconds(startInSec) });
    if (r.status >= 400) return void res.status(r.status).json(r.payload);
    created.push({ name: input.name ?? '', total: Number(r.payload.total) });
  }
  res.status(201).json({ created });
});
