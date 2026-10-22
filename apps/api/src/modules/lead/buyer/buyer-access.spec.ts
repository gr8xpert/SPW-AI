import { seesAllBuyers, visibilityClause } from './buyer-access';

describe('buyer visibility', () => {
  it('lets admins, webmasters and super admins see every buyer', () => {
    expect(visibilityClause({ id: 1, role: 'admin' }, false)).toBeNull();
    expect(visibilityClause({ id: 1, role: 'webmaster' }, false)).toBeNull();
    expect(visibilityClause({ id: 1, role: 'super_admin' }, false)).toBeNull();
    // Super Admin "viewing as" a client keeps originalRole.
    expect(visibilityClause({ id: 1, role: 'admin', originalRole: 'super_admin' }, false)).toBeNull();
  });

  it('lets an agent see everyone when the tenant switch is on', () => {
    expect(seesAllBuyers({ id: 7, role: 'user' }, true)).toBe(true);
    expect(visibilityClause({ id: 7, role: 'user' }, true)).toBeNull();
  });

  it('limits an agent to own and related buyers', () => {
    const clause = visibilityClause({ id: 7, role: 'user' }, false);
    expect(clause).toEqual({
      sql: '(lead.assignedTo = :viewerId OR EXISTS (SELECT 1 FROM lead_agents la WHERE la.leadId = lead.id AND la.userId = :viewerId))',
      params: { viewerId: 7 },
    });
  });

  it('uses the given alias', () => {
    expect(visibilityClause({ id: 7, role: 'user' }, false, 'b')?.sql).toContain('b.assignedTo');
  });
});
