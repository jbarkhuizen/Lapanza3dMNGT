import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// A hash of an arbitrary, never-issued password, computed at the same cost
// as real tenant password hashes. Login compares against this whenever no
// tenant was found for the submitted email, so an unknown-email attempt
// still pays the full bcrypt cost instead of returning fast — closing the
// timing side-channel that would otherwise let an attacker distinguish
// "no such tenant" from "wrong password" by response latency (backlog #9).
export const DUMMY_PASSWORD_HASH = bcrypt.hashSync('dummy-password-for-timing-safety', SALT_ROUNDS);
