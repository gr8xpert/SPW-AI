import { accessOf, agentCard, isPlaceholderEmail, placeholderEmail, planAccess } from './agent-profile';

describe('agent-profile', () => {
  const base = {
    name: 'Pia Arrieta', title: 'Partner', phone: '+34 952 765 138', whatsapp: '+34 600 000 000',
    publicEmail: 'pia@agency.es', avatarUrl: 'https://cdn.example.com/p.webp', showOnWebsite: true,
  };

  describe('agentCard', () => {
    it('gives the website card of a website person', () => {
      expect(agentCard(base)).toEqual({
        name: 'Pia Arrieta', title: 'Partner', phone: '+34 952 765 138', whatsapp: '+34 600 000 000',
        email: 'pia@agency.es', photo: 'https://cdn.example.com/p.webp',
      });
    });
    it('is null when not on the website or without a name', () => {
      expect(agentCard({ ...base, showOnWebsite: false })).toBeNull();
      expect(agentCard({ ...base, isActive: false })).toBeNull();
      expect(agentCard({ ...base, name: '  ' })).toBeNull();
      expect(agentCard(null)).toBeNull();
    });
    it('drops bad contact details and never uses the login email', () => {
      expect(agentCard({ ...base, phone: 'call me', publicEmail: null, avatarUrl: 'javascript:x', email: 'login@x.com' } as any)).toEqual({
        name: 'Pia Arrieta', title: 'Partner', whatsapp: '+34 600 000 000',
      });
    });
  });

  describe('placeholder emails', () => {
    it('are recognised', () => {
      const e = placeholderEmail(7);
      expect(e).toMatch(/^agent-7-[0-9a-f]{12}@no-login\.invalid$/);
      expect(isPlaceholderEmail(e)).toBe(true);
      expect(isPlaceholderEmail('pia@agency.es')).toBe(false);
    });
  });

  describe('accessOf / planAccess', () => {
    it('maps users to access', () => {
      expect(accessOf({ role: 'admin', canLogin: true })).toBe('manager');
      expect(accessOf({ role: 'user', canLogin: true })).toBe('agent');
      expect(accessOf({ role: 'admin', canLogin: false })).toBe('none');
    });
    it('no login: role user, buyers off, no email or password needed', () => {
      expect(planAccess({ access: 'none', worksBuyers: true, hadLogin: false })).toEqual({
        role: 'user', canLogin: false, worksBuyers: false, needsLogin: false,
      });
    });
    it('a login for someone who had none needs email + password', () => {
      expect(planAccess({ access: 'manager', worksBuyers: true, hadLogin: false })).toEqual({
        role: 'admin', canLogin: true, worksBuyers: true, needsLogin: true,
      });
      expect(planAccess({ access: 'agent', worksBuyers: false, hadLogin: true })).toEqual({
        role: 'user', canLogin: true, worksBuyers: false, needsLogin: false,
      });
    });
  });
});
