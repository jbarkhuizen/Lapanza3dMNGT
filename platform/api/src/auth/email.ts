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

// Mirrors sendVerificationEmail's shape exactly — same dev-log fallback when
// mailer.isConfigured() is false (see team.ts's invite route, which — like
// POST /api/auth/register — tolerates a failed send rather than failing the
// invite itself).
export async function sendTeamInviteEmail(to: string, businessName: string, token: string): Promise<void> {
  const link = `${env.frontendOrigin}${env.frontendBasePath}/set-password?token=${token}`;

  if (!mailer.isConfigured()) {
    console.log(`[dev-email] Set-password link for ${to}: ${link}`);
    return;
  }

  await mailer.sendMail({
    to,
    subject: `You've been invited to join ${businessName} on Barkie`,
    text: `You've been invited to join ${businessName} on Barkie.\n\nSet your password to activate your account:\n${link}\n\nThis link expires in 24 hours.`,
  });
}
