import { BadRequestException } from '@nestjs/common';
import { createHash } from 'crypto';
import { PasswordResetService } from './password-reset.service';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

function makeService(row: any) {
  const repo = {
    findOne: jest.fn().mockResolvedValue(row),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    insert: jest.fn(),
  };
  return { svc: new PasswordResetService(repo as any), repo };
}

describe('PasswordResetService', () => {
  it('issues a raw token, stores only its hash, and kills older links', async () => {
    const { svc, repo } = makeService(null);

    const raw = await svc.issue({ id: 5 } as any);

    expect(raw).toMatch(/^[0-9a-f]{64}$/);
    expect(repo.update).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 5 }),
      expect.objectContaining({ consumedAt: expect.any(Date) }),
    );
    const inserted = repo.insert.mock.calls[0][0];
    expect(inserted.tokenHash).toBe(sha256(raw));
    expect(inserted.tokenHash).not.toBe(raw);
    // One hour, give or take the test's own runtime.
    const ttl = inserted.expiresAt.getTime() - Date.now();
    expect(ttl).toBeGreaterThan(59 * 60 * 1000);
    expect(ttl).toBeLessThanOrEqual(60 * 60 * 1000);
  });

  it('consumes a live token and returns its user', async () => {
    const { svc } = makeService({
      id: 1,
      userId: 5,
      consumedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    await expect(svc.consume('a'.repeat(64))).resolves.toEqual({ userId: 5 });
  });

  it.each([
    ['unknown', null],
    ['already used', { id: 1, userId: 5, consumedAt: new Date(), expiresAt: new Date(Date.now() + 60_000) }],
    ['expired', { id: 1, userId: 5, consumedAt: null, expiresAt: new Date(Date.now() - 1) }],
  ])('rejects an %s token', async (_label, row) => {
    const { svc } = makeService(row);
    await expect(svc.consume('a'.repeat(64))).rejects.toBeInstanceOf(BadRequestException);
  });

  // Two tabs submitting the same link at once: only the conditional update
  // that actually flips consumedAt may win.
  it('rejects the loser of a concurrent double-submit', async () => {
    const { svc, repo } = makeService({
      id: 1,
      userId: 5,
      consumedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    repo.update.mockResolvedValueOnce({ affected: 0 });
    await expect(svc.consume('a'.repeat(64))).rejects.toBeInstanceOf(BadRequestException);
  });
});
