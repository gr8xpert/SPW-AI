import type { Request, Response } from 'express';
import { canonicalLang, canonicalLanguageMiddleware } from './language-code';

describe('canonicalLang', () => {
  it.each([
    ['no', 'no'],
    ['nb', 'no'],
    ['nn', 'no'],
    ['nb_NO', 'no'],
    ['nn-NO', 'no'],
    ['NB', 'no'],
  ])('%s → %s', (input, expected) => {
    expect(canonicalLang(input)).toBe(expected);
  });

  it('leaves other languages alone', () => {
    expect(canonicalLang('es')).toBe('es');
    expect(canonicalLang('en-GB')).toBe('en-GB');
    expect(canonicalLang('sv')).toBe('sv');
  });
});

describe('canonicalLanguageMiddleware', () => {
  const run = (query: Record<string, unknown>, acceptLanguage?: string) => {
    const req = { query, headers: acceptLanguage ? { 'accept-language': acceptLanguage } : {} } as unknown as Request;
    const next = jest.fn();
    canonicalLanguageMiddleware(req, {} as Response, next);
    expect(next).toHaveBeenCalled();
    return req;
  };

  it('maps ?lang= and ?language=', () => {
    const req = run({ lang: 'nn', language: 'nb_NO' });
    expect(req.query).toEqual({ lang: 'no', language: 'no' });
  });

  it('maps the first Accept-Language tag and keeps the rest', () => {
    expect(run({}, 'nn-NO;q=0.9,en;q=0.5').headers['accept-language']).toBe('no;q=0.9,en;q=0.5');
    expect(run({}, 'nb').headers['accept-language']).toBe('no');
  });

  it('leaves other requests untouched', () => {
    const req = run({ lang: 'es' }, 'es-ES,en');
    expect(req.query).toEqual({ lang: 'es' });
    expect(req.headers['accept-language']).toBe('es-ES,en');
  });
});
