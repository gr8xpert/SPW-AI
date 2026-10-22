import { graphTime, questionLabel, toIntake, validPageId } from './meta-lead';

const lead = (patch: Record<string, unknown> = {}) => ({
  id: '1234567890',
  created_time: '2026-10-22T08:15:00+0000',
  platform: 'fb',
  campaign_name: 'Autumn villas',
  ad_name: 'Pool villa ad',
  field_data: [
    { name: 'email', values: ['Ann@Example.com '] },
    { name: 'full_name', values: ['Ann Lee'] },
    { name: 'phone_number', values: ['+34 600 111 222'] },
    { name: 'what_is_your_budget?', values: ['500k-750k'] },
    { name: 'bedrooms', values: ['3', '4'] },
  ],
  ...patch,
});

describe('toIntake', () => {
  it('maps the standard fields and lists the custom answers', () => {
    const r = toIntake(lead(), 'Villas form')!;
    expect(r).toMatchObject({ leadgenId: '1234567890', email: 'ann@example.com', name: 'Ann Lee', phone: '+34 600 111 222', source: 'facebook' });
    expect(r.createdAt?.toISOString()).toBe('2026-10-22T08:15:00.000Z');
    expect(r.answers).toEqual([
      { question: 'What is your budget?', answer: '500k-750k' },
      { question: 'Bedrooms', answer: '3, 4' },
    ]);
    expect(r.message).toBe('Facebook lead form: Villas form\nCampaign: Autumn villas\nAd: Pool villa ad\nWhat is your budget?: 500k-750k\nBedrooms: 3, 4');
  });

  it('Instagram by platform; first + last name', () => {
    const r = toIntake(lead({ platform: 'ig', field_data: [{ name: 'email', values: ['b@x.io'] }, { name: 'first_name', values: ['Bo'] }, { name: 'last_name', values: ['Ray'] }] }))!;
    expect(r.source).toBe('instagram');
    expect(r.name).toBe('Bo Ray');
    expect(r.message.startsWith('Instagram lead form')).toBe(true);
  });

  it('no or bad email → null; bad id → null', () => {
    expect(toIntake(lead({ field_data: [{ name: 'full_name', values: ['X'] }] }))).toBeNull();
    expect(toIntake(lead({ field_data: [{ name: 'email', values: ['not-an-email'] }] }))).toBeNull();
    expect(toIntake(lead({ id: '../x' }))).toBeNull();
  });

  it('strips control characters and caps lengths', () => {
    const r = toIntake(lead({ field_data: [{ name: 'email', values: ['c@x.io'] }, { name: 'note', values: ['line1\nline2\u0000' + 'y'.repeat(900)] }] }))!;
    expect(r.answers[0].answer.startsWith('line1 line2')).toBe(true);
    expect(r.answers[0].answer.length).toBe(500);
  });
});

describe('helpers', () => {
  it('graphTime handles +0000 and junk', () => {
    expect(graphTime('2026-01-02T03:04:05+0100')?.toISOString()).toBe('2026-01-02T02:04:05.000Z');
    expect(graphTime('nope')).toBeNull();
    expect(graphTime(undefined)).toBeNull();
  });
  it('questionLabel', () => {
    expect(questionLabel('when_do_you_want_to_buy?')).toBe('When do you want to buy?');
  });
  it('validPageId: digits only', () => {
    expect(validPageId('102938475610')).toBe(true);
    expect(validPageId('12/../me')).toBe(false);
    expect(validPageId('abc')).toBe(false);
  });
});
