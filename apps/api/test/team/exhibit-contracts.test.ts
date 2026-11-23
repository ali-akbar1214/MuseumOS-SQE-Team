import { describe, expect, it } from 'vitest';
import { createExhibitSchema } from '@museumos/contracts';

const valid = {
  categoryId: '10000000-0000-4000-8000-000000000001',
  exhibitName: 'Contract boundary exhibit',
};

describe('production createExhibitSchema year and price constraints', () => {
  it.each([
    ['UT-YEAR-01 null', { year: null }, true],
    ['UT-YEAR-02 lower bound', { year: 1800 }, true],
    ['UT-YEAR-03 upper bound', { year: 2100 }, true],
    ['UT-YEAR-04 below range', { year: 1799 }, false],
    ['UT-YEAR-05 above range', { year: 2101 }, false],
    ['UT-YEAR-06 fractional', { year: 2000.5 }, false],
    ['UT-YEAR-07 wrong type', { year: '2000' }, false],
    ['UT-YEAR-08 fractional below range', { year: 1799.5 }, false],
    ['UT-YEAR-09 fractional above range', { year: 2100.5 }, false],
    ['UT-PRICE-01 null', { collectiblePrice: null }, true],
    ['UT-PRICE-02 zero', { collectiblePrice: 0 }, true],
    ['UT-PRICE-03 positive', { collectiblePrice: 25.5 }, true],
    ['UT-PRICE-04 negative', { collectiblePrice: -0.01 }, false],
    ['UT-PRICE-05 wrong type', { collectiblePrice: '25' }, false],
    ['UT-PRICE-06 NaN', { collectiblePrice: Number.NaN }, false],
  ])('%s', (_caseName, update, expected) => {
    expect(createExhibitSchema.safeParse({ ...valid, ...update }).success).toBe(expected);
  });
});
