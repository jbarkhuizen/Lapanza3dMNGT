import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { sendVerificationEmail } from '../src/auth/email.js';
import { env } from '../src/env.js';

test('sendVerificationEmail logs a link built from frontendOrigin + frontendBasePath', async () => {
  const originalOrigin = env.frontendOrigin;
  const originalBasePath = env.frontendBasePath;
  env.frontendOrigin = 'https://barkie.co.za';
  env.frontendBasePath = '/app';

  const logSpy = mock.method(console, 'log', () => {});
  try {
    await sendVerificationEmail('jane@example.co.za', 'abc123');
    assert.equal(logSpy.mock.callCount(), 1);
    const [message] = logSpy.mock.calls[0].arguments;
    assert.equal(
      message,
      '[dev-email] Verification link for jane@example.co.za: https://barkie.co.za/app/verify-email?token=abc123',
    );
  } finally {
    logSpy.mock.restore();
    env.frontendOrigin = originalOrigin;
    env.frontendBasePath = originalBasePath;
  }
});

test('sendVerificationEmail builds an unprefixed link when frontendBasePath is empty (dev default)', async () => {
  const originalOrigin = env.frontendOrigin;
  const originalBasePath = env.frontendBasePath;
  env.frontendOrigin = 'http://localhost:5174';
  env.frontendBasePath = '';

  const logSpy = mock.method(console, 'log', () => {});
  try {
    await sendVerificationEmail('jane@example.co.za', 'abc123');
    const [message] = logSpy.mock.calls[0].arguments;
    assert.equal(
      message,
      '[dev-email] Verification link for jane@example.co.za: http://localhost:5174/verify-email?token=abc123',
    );
  } finally {
    logSpy.mock.restore();
    env.frontendOrigin = originalOrigin;
    env.frontendBasePath = originalBasePath;
  }
});
