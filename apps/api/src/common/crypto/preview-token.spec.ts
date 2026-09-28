import { createPreviewToken, isPreviewToken, PREVIEW_TOKEN_TTL_SECONDS, verifyPreviewToken } from './preview-token';
import { publicSiteTemplates } from '../../modules/tenant/tenant.service';

describe('preview tokens', () => {
  const saved = process.env.ENCRYPTION_KEY;
  beforeAll(() => {
    process.env.ENCRYPTION_KEY = 'test-encryption-key-0123456789';
  });
  afterAll(() => {
    process.env.ENCRYPTION_KEY = saved;
  });

  it('round-trips the tenant id', () => {
    const { token } = createPreviewToken(42);
    expect(isPreviewToken(token)).toBe(true);
    expect(verifyPreviewToken(token)).toBe(42);
  });

  it('expires', () => {
    const now = Date.now();
    const { token } = createPreviewToken(42, now);
    expect(verifyPreviewToken(token, now + (PREVIEW_TOKEN_TTL_SECONDS - 5) * 1000)).toBe(42);
    expect(verifyPreviewToken(token, now + (PREVIEW_TOKEN_TTL_SECONDS + 5) * 1000)).toBeNull();
  });

  it('rejects a token for another tenant or with a changed expiry', () => {
    const { token } = createPreviewToken(42);
    const [, , exp, sig] = token.split('_');
    expect(verifyPreviewToken(`spmpv_43_${exp}_${sig}`)).toBeNull();
    expect(verifyPreviewToken(`spmpv_42_${Number(exp) + 3600}_${sig}`)).toBeNull();
    expect(verifyPreviewToken(`spmpv_42_${exp}_${'0'.repeat(40)}`)).toBeNull();
  });

  it('rejects a token signed with another server secret', () => {
    const { token } = createPreviewToken(42);
    process.env.ENCRYPTION_KEY = 'another-encryption-key-99999999';
    expect(verifyPreviewToken(token)).toBeNull();
    process.env.ENCRYPTION_KEY = 'test-encryption-key-0123456789';
  });

  it('ignores real API keys and junk', () => {
    expect(isPreviewToken('spm_' + 'a'.repeat(64))).toBe(false);
    expect(verifyPreviewToken('spm_' + 'a'.repeat(64))).toBeNull();
    expect(verifyPreviewToken('spmpv_x')).toBeNull();
    expect(verifyPreviewToken(undefined)).toBeNull();
  });
});

describe('publicSiteTemplates', () => {
  it('keeps known template ids per page type only', () => {
    expect(
      publicSiteTemplates({ search: 'search-template-03', listing: 'listing-template-12', detail: 'nope', map: 'search-template-01' }),
    ).toEqual({ search: 'search-template-03', listing: 'listing-template-12' });
    expect(publicSiteTemplates({ listing: 'listing-template-13' })).toBeNull();
    expect(publicSiteTemplates(undefined)).toBeNull();
  });
});
