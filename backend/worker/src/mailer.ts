import nodemailer from 'nodemailer';
import { decrypt } from '@ejs/core';

export interface MailInput {
  sender: { email: string; etherealUser: string; etherealPassEnc: string };
  to: string;
  subject: string;
  html: string;
}

export async function sendMail({ sender, to, subject, html }: MailInput): Promise<{ messageId: string; previewUrl: string | null }> {
  const transport = nodemailer.createTransport({
    host: 'smtp.ethereal.email',
    port: 587,
    secure: false,
    auth: { user: sender.etherealUser, pass: decrypt(sender.etherealPassEnc) },
  });
  const info = await transport.sendMail({ from: sender.email, to, subject, html });
  const preview = nodemailer.getTestMessageUrl(info);
  return { messageId: info.messageId, previewUrl: preview || null };
}
