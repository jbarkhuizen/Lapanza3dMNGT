import { Router } from 'express';
import { z } from 'zod';
import crypto from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../db/client.js';
import { hashPassword } from '../auth/password.js';

export const authRouter = Router();

const registerSchema = z.object({
  businessName: z.string().min(1),
  contactName: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(10),
});

authRouter.post('/api/auth/register', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: 'Fill in all required fields with a valid email and a password of at least 10 characters.' });
  }
  const { businessName, contactName, email, password } = parsed.data;

  const existing = await prisma.tenant.findUnique({ where: { email } });
  if (existing) {
    return res.status(409).json({ ok: false, error: 'An account with this email already exists.' });
  }

  const passwordHash = await hashPassword(password);
  const verificationToken = crypto.randomBytes(32).toString('hex');
  const verificationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

  try {
    await prisma.tenant.create({
      data: {
        businessName,
        contactName,
        email,
        passwordHash,
        verificationToken,
        verificationTokenExpires,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return res.status(409).json({ ok: false, error: 'An account with this email already exists.' });
    }
    throw error;
  }

  res.status(201).json({ ok: true });
});
