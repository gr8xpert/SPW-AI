import { CSV_BOM, csvCell, toCsv } from './csv';

describe('csvCell', () => {
  it('quotes commas, quotes and newlines', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('two\nlines')).toBe('"two\nlines"');
  });

  it('guards formulas', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('+34 600')).toBe("'+34 600");
    expect(csvCell('-5')).toBe("'-5");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(csvCell('\tx')).toBe("'\tx");
  });

  it('numbers, empties and dates', () => {
    expect(csvCell(12)).toBe('12');
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
    expect(csvCell(new Date('2026-10-22T10:00:00Z'))).toBe('2026-10-22T10:00:00.000Z');
  });
});

describe('toCsv', () => {
  it('BOM, header, CRLF rows', () => {
    expect(toCsv(['a', 'b'], [[1, 'x'], [2, 'ñ']])).toBe(`${CSV_BOM}a,b\r\n1,x\r\n2,ñ\r\n`);
  });
});
