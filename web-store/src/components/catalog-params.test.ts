import { describe, expect, it } from 'vitest';
import { parsePage, parseSort } from './Catalog';

describe('catalog URL parameters', () => {
  it('parseSort accepts only the listed sorts', () => {
    expect(parseSort('price_asc')).toBe('price_asc');
    expect(parseSort(['price_desc', 'x'])).toBe('price_desc');
    for (const value of ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf', 'bogus', '', undefined]) {
      expect(parseSort(value), String(value)).toBe('newest');
    }
  });

  it('parsePage keeps 1..1000', () => {
    expect(parsePage('3')).toBe(3);
    for (const value of ['0', '-1', '1001', '2.5', 'x', undefined]) expect(parsePage(value), String(value)).toBe(1);
  });
});
