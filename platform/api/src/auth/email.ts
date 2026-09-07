import { env } from '../env.js';

// Dev-mode implementation: logs the verification link instead of sending a
// real email. A later plan replaces the body of this function with
// nodemailer + cPanel SMTP (SRS §2.3) — callers never need to change.
export async function sendVerificationEmail(to: string, token: string): Promise<void> {
  const link = `${env.frontendOrigin}${env.frontendBasePath}/verify-email?token=${token}`;
  console.log(`[dev-email] Verification link for ${to}: ${link}`);
}
