import { findDuplicates, nameKey, phoneKey } from './duplicates';

describe('keys', () => {
  it('phone: last 9 digits, at least 7', () => {
    expect(phoneKey('+34 600 111 222')).toBe('600111222');
    expect(phoneKey('0034600111222')).toBe('600111222');
    expect(phoneKey('12345')).toBeNull();
    expect(phoneKey(null)).toBeNull();
  });

  it('name: accents, case, spaces; needs both parts', () => {
    expect(nameKey('José ', 'García-López')).toBe('jose|garcia lopez');
    expect(nameKey('jose', 'GARCIA LOPEZ')).toBe('jose|garcia lopez');
    expect(nameKey('Ann', null)).toBeNull();
  });
});

describe('findDuplicates', () => {
  const row = (id: number, firstName: string | null, lastName: string | null, ...phones: (string | null)[]) => ({ id, firstName, lastName, phones });

  it('groups by phone and by name, chaining through both', () => {
    const groups = findDuplicates([
      row(1, 'Ann', 'Lee', '+34 600 111 222'),
      row(2, 'Anne', 'Lee', '600111222'),
      row(3, 'Anne', 'Lee', null),
      row(4, 'Bob', 'Ray', '+44 7700 900000'),
      row(5, 'Cy', 'Day', null),
    ]);
    expect(groups).toEqual([{ ids: [1, 2, 3], reasons: ['name', 'phone'] }]);
  });

  it('a second phone column counts too', () => {
    expect(findDuplicates([row(7, 'A', 'B', null, '611 222 333'), row(9, 'C', 'D', '+34611222333')])).toEqual([{ ids: [7, 9], reasons: ['phone'] }]);
  });

  it('nothing alike → no groups', () => {
    expect(findDuplicates([row(1, 'A', 'B', '1234567'), row(2, 'C', 'D', '7654321')])).toEqual([]);
  });
});
