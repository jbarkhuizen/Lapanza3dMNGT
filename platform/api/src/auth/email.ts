import { env } from '../env.js';
import { mailer } from '../lib/mailer.js';

export async function sendVerificationEmail(to: string, token: string): Promise<void> {
  const link = `${env.frontendOrigin}${env.frontendBasePath}/verify-email?token=${token}`;

  if (!mailer.isConfigured()) {
    console.log(`[dev-email] Verification link for ${to}: ${link}`);
    return;
  }

  await mailer.sendMail({
    to,
    subject: 'Verify your Barkie account',
    text: `Welcome to Barkie!\n\nVerify your email address to activate your account:\n${link}\n\nThis link expires in 24 hours.`,
  });
}
