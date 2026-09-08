import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import nodemailer from 'nodemailer';
import { createMailer } from '../src/lib/mailer.js';

test('isConfigured is false when user or appPassword is missing', () => {
  assert.equal(createMailer({ fromName: 'Barkie' }).isConfigured(), false);
  assert.equal(createMailer({ user: 'a@b.com', fromName: 'Barkie' }).isConfigured(), false);
  assert.equal(createMailer({ appPassword: 'x', fromName: 'Barkie' }).isConfigured(), false);
});

test('isConfigured is true when both user and appPassword are set', () => {
  const mailer = createMailer({ user: 'a@b.com', appPassword: 'x', fromName: 'Barkie' });
  assert.equal(mailer.isConfigured(), true);
});

test('sendMail builds a Gmail transport and calls sendMail with the right envelope', async () => {
  const sendMailCalls: Array<Record<string, unknown>> = [];
  mock.method(nodemailer, 'createTransport', (options: unknown) => {
    assert.deepEqual(options, {
      service: 'gmail',
      auth: { user: 'sender@example.com', pass: 'fake-app-password' },
    });
    return {
      sendMail: async (opts: Record<string, unknown>) => {
        sendMailCalls.push(opts);
      },
    };
  });

  try {
    const mailer = createMailer({ user: 'sender@example.com', appPassword: 'fake-app-password', fromName: 'Barkie' });
    await mailer.sendMail({ to: 'bob@example.com', subject: 'Hello', text: 'Body text' });

    assert.equal(sendMailCalls.length, 1);
    assert.equal(sendMailCalls[0].from, '"Barkie" <sender@example.com>');
    assert.equal(sendMailCalls[0].to, 'bob@example.com');
    assert.equal(sendMailCalls[0].subject, 'Hello');
    assert.equal(sendMailCalls[0].text, 'Body text');
  } finally {
    mock.restoreAll();
  }
});

test('sendMail forwards attachments unchanged', async () => {
  const sendMailCalls: Array<Record<string, unknown>> = [];
  mock.method(nodemailer, 'createTransport', () => ({
    sendMail: async (opts: Record<string, unknown>) => {
      sendMailCalls.push(opts);
    },
  }));

  try {
    const mailer = createMailer({ user: 'sender@example.com', appPassword: 'fake-app-password', fromName: 'Barkie' });
    const pdfBuffer = Buffer.from('%PDF-fake');
    await mailer.sendMail({
      to: 'bob@example.com',
      subject: 'Your invoice',
      text: 'Attached.',
      attachments: [{ filename: 'INV-0001.pdf', content: pdfBuffer, contentType: 'application/pdf' }],
    });

    assert.deepEqual(sendMailCalls[0].attachments, [
      { filename: 'INV-0001.pdf', content: pdfBuffer, contentType: 'application/pdf' },
    ]);
  } finally {
    mock.restoreAll();
  }
});

test('createTransport is only called once across multiple sendMail calls (transport is cached)', async () => {
  let createTransportCalls = 0;
  mock.method(nodemailer, 'createTransport', () => {
    createTransportCalls += 1;
    return { sendMail: async () => {} };
  });

  try {
    const mailer = createMailer({ user: 'sender@example.com', appPassword: 'fake-app-password', fromName: 'Barkie' });
    await mailer.sendMail({ to: 'a@example.com', subject: 'One', text: 'One' });
    await mailer.sendMail({ to: 'b@example.com', subject: 'Two', text: 'Two' });

    assert.equal(createTransportCalls, 1);
  } finally {
    mock.restoreAll();
  }
});

test('sendMail throws Error when mailer is not configured and never calls createTransport', async () => {
  let createTransportCalls = 0;
  mock.method(nodemailer, 'createTransport', () => {
    createTransportCalls += 1;
    return { sendMail: async () => {} };
  });

  try {
    const mailer = createMailer({ fromName: 'Barkie' });
    await assert.rejects(
      () => mailer.sendMail({ to: 'bob@example.com', subject: 'Hello', text: 'Body text' }),
      (err: Error) => {
        assert.equal(err.message, 'mailer.sendMail called while not configured — check isConfigured() first');
        return true;
      }
    );

    assert.equal(createTransportCalls, 0, 'createTransport should never be called for unconfigured mailer');
  } finally {
    mock.restoreAll();
  }
});
