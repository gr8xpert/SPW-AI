import { isValidCronExpression } from './cron-validator';

describe('isValidCronExpression', () => {
  it('accepts common cron patterns', () => {
    expect(isValidCronExpression('0 2 * * *')).toBe(true);
    expect(isValidCronExpression('*/15 * * * *')).toBe(true);
    expect(isValidCronExpression('0 */4 * * *')).toBe(true);
    expect(isValidCronExpression('30 9 * * 1-5')).toBe(true);
  });

  it('rejects malformed expressions', () => {
    expect(isValidCronExpression('not a cron')).toBe(false);
    // Out-of-range values for each field.
    expect(isValidCronExpression('99 * * * *')).toBe(false);
    expect(isValidCronExpression('0 25 * * *')).toBe(false);
    expect(isValidCronExpression('0 0 32 * *')).toBe(false);
    expect(isValidCronExpression('0 0 0 13 *')).toBe(false);
  });
});
