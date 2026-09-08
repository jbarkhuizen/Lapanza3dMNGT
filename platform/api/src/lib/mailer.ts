import nodemailer from 'nodemailer';
import { env } from '../env.js';

export interface MailAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
}

export interface MailOptions {
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
  attachments?: MailAttachment[];
}

export interface Mailer {
  isConfigured(): boolean;
  sendMail(options: MailOptions): Promise<void>;
}

interface MailerConfig {
  user?: string;
  appPassword?: string;
  fromName: string;
}

export function createMailer(config: MailerConfig): Mailer {
  let transport: ReturnType<typeof nodemailer.createTransport> | null = null;

  function isConfigured(): boolean {
    return Boolean(config.user && config.appPassword);
  }

  function getTransport() {
    if (!transport) {
      transport = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: config.user, pass: config.appPassword },
      });
    }
    return transport;
  }

  return {
    isConfigured,
    async sendMail(options: MailOptions): Promise<void> {
      if (!isConfigured()) {
        throw new Error('mailer.sendMail called while not configured — check isConfigured() first');
      }
      await getTransport().sendMail({
        from: `"${config.fromName}" <${config.user}>`,
        to: options.to,
        subject: options.subject,
        text: options.text,
        replyTo: options.replyTo,
        attachments: options.attachments,
      });
    },
  };
}

// The real singleton, built from actual env values. sendVerificationEmail()
// and sendDocumentEmail() call this — see src/auth/email.ts and
// src/documents/sendDocumentEmail.ts. Exported as a plain object (not raw
// named functions) specifically so tests in other files can mock.method()
// its properties without hitting real SMTP.
export const mailer = createMailer({
  user: env.smtpUser,
  appPassword: env.smtpAppPassword,
  fromName: env.smtpFromName,
});
