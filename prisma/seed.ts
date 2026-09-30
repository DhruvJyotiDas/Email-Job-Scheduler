/* Seeds the demo user with N Ethereal sender accounts (needs internet: Ethereal provisions them on demand). */
import nodemailer from 'nodemailer';
import { encrypt, prisma } from '@ejs/core';

async function main() {
  const count = Number(process.env.SEED_SENDERS ?? 3);
  const user = await prisma.user.upsert({
    where: { googleSub: 'dev-user' },
    update: {},
    create: { googleSub: 'dev-user', name: 'Oliver Brown', email: 'oliver.brown@domain.io' },
  });
  const existing = await prisma.sender.count({ where: { userId: user.id } });
  for (let i = existing; i < count; i++) {
    const a = await nodemailer.createTestAccount();
    await prisma.sender.create({
      data: { userId: user.id, email: a.user, etherealUser: a.user, etherealPassEnc: encrypt(a.pass), hourlyLimit: 200 },
    });
    console.log('created sender', a.user);
  }
  console.log(`done: ${Math.max(count, existing)} senders for ${user.email}`);
}

main().finally(() => prisma.$disconnect());
