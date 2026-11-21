import { describe, expect, it } from 'vitest';
import {
  getExhibitState,
  isPublishAllowed,
  validateExhibitTransition,
  isAcquisitionYearAllowed,
  isCollectiblePriceAllowed,
  type ExhibitWorkflowRecord,
} from '../../src/exhibits/exhibit-workflow';

function record(overrides: Partial<ExhibitWorkflowRecord> = {}): ExhibitWorkflowRecord {
  return {
    exhibitName: 'Test Exhibit',
    categoryId: '10000000-0000-4000-8000-000000000001',
    year: 2000,
    collectiblePrice: 25,
    validated: false,
    published: false,
    ...overrides,
  };
}

describe('exhibit workflow business rules', () => {
  it('accepts acquisition years at and between the boundaries', () => {
    expect(isAcquisitionYearAllowed(null)).toBe(true);
    expect(isAcquisitionYearAllowed(1800)).toBe(true);
    expect(isAcquisitionYearAllowed(2100)).toBe(true);
    expect(isAcquisitionYearAllowed(1799)).toBe(false);
    expect(isAcquisitionYearAllowed(2101)).toBe(false);
    expect(isAcquisitionYearAllowed(2000.5)).toBe(false);
  });

  it('rejects negative or non-finite collectible prices', () => {
    expect(isCollectiblePriceAllowed(null)).toBe(true);
    expect(isCollectiblePriceAllowed(0)).toBe(true);
    expect(isCollectiblePriceAllowed(125.5)).toBe(true);
    expect(isCollectiblePriceAllowed(-0.01)).toBe(false);
    expect(isCollectiblePriceAllowed(Number.POSITIVE_INFINITY)).toBe(false);
  });
  it('maps draft, validated, and published states', () => {
    expect(getExhibitState(record())).toBe('draft');
    expect(getExhibitState(record({ validated: true }))).toBe('validated');
    expect(getExhibitState(record({ validated: true, published: true }))).toBe('published');
  });

  it('requires validation, name, and category before publish', () => {
    expect(isPublishAllowed({ exhibitName: 'Test', categoryId: record().categoryId, validated: true })).toBe(true);
    expect(isPublishAllowed({ exhibitName: 'Test', categoryId: record().categoryId, validated: false })).toBe(false);
    expect(isPublishAllowed({ exhibitName: ' ', categoryId: record().categoryId, validated: true })).toBe(false);
    expect(isPublishAllowed({ exhibitName: 'Test', categoryId: null, validated: true })).toBe(false);
  });

  it('allows a draft to become validated and then published', () => {
    const draft = record();
    expect(validateExhibitTransition({
      exhibitName: draft.exhibitName,
      categoryId: draft.categoryId,
      current: draft,
      nextValidated: true,
      nextPublished: false,
    }).allowed).toBe(true);
    expect(validateExhibitTransition({
      exhibitName: draft.exhibitName,
      categoryId: draft.categoryId,
      current: record({ validated: true }),
      nextValidated: true,
      nextPublished: true,
    }).allowed).toBe(true);
  });

  it('rejects publishing an unvalidated exhibit', () => {
    const result = validateExhibitTransition({
      exhibitName: 'Test',
      categoryId: record().categoryId,
      current: record(),
      nextValidated: false,
      nextPublished: true,
    });
    expect(result.allowed).toBe(false);
  });

  it('rejects every transition out of published', () => {
    const published = record({ validated: true, published: true });
    expect(validateExhibitTransition({
      exhibitName: published.exhibitName,
      categoryId: published.categoryId,
      current: published,
      nextValidated: true,
      nextPublished: false,
    }).allowed).toBe(false);
  });
});
