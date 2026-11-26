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
    expect(isAcquisitionYearAllowed(1799.5)).toBe(false);
    expect(isAcquisitionYearAllowed(2100.5)).toBe(false);
  });

  it('rejects negative or non-finite collectible prices', () => {
    expect(isCollectiblePriceAllowed(null)).toBe(true);
    expect(isCollectiblePriceAllowed(0)).toBe(true);
    expect(isCollectiblePriceAllowed(125.5)).toBe(true);
    expect(isCollectiblePriceAllowed(-0.01)).toBe(false);
    expect(isCollectiblePriceAllowed(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isCollectiblePriceAllowed(Number.NaN)).toBe(false);
  });
  it('maps draft, validated, and published states', () => {
    expect(getExhibitState(record())).toBe('draft');
    expect(getExhibitState(record({ validated: true }))).toBe('validated');
    expect(getExhibitState(record({ validated: true, published: true }))).toBe('published');
  });

  it.each([
    ['UT-PUBLISH-01', true, true, true, true],
    ['UT-PUBLISH-02', true, true, false, false],
    ['UT-PUBLISH-03', true, false, true, false],
    ['UT-PUBLISH-04', true, false, false, false],
    ['UT-PUBLISH-05', false, true, true, false],
    ['UT-PUBLISH-06', false, true, false, false],
    ['UT-PUBLISH-07', false, false, true, false],
    ['UT-PUBLISH-08', false, false, false, false],
  ])('%s applies the publish decision table (validated=%s, named=%s, categorized=%s)', (_caseId, validated, named, categorized, expected) => {
    expect(isPublishAllowed({
      exhibitName: named ? 'Test' : '  ',
      categoryId: categorized ? record().categoryId : null,
      validated,
    })).toBe(expected);
  });

  it('UT-TRANSITION-ALLOW-01 allows a draft to validate and a validated record to publish', () => {
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

  it('UT-TRANSITION-REJECT-UNVALIDATED-01 rejects publishing an unvalidated exhibit', () => {
    const result = validateExhibitTransition({
      exhibitName: 'Test',
      categoryId: record().categoryId,
      current: record(),
      nextValidated: false,
      nextPublished: true,
    });
    expect(result.allowed).toBe(false);
    expect(result).toEqual({ allowed: false, reason: 'An exhibit must be validated before it can be published' });
  });

  it('UT-TRANSITION-REJECT-REQUIRED-01 rejects blank names and missing categories', () => {
    const current = record();
    const blankName = validateExhibitTransition({
      exhibitName: '  ', categoryId: current.categoryId, current, nextValidated: true, nextPublished: false,
    });
    const noCategory = validateExhibitTransition({
      exhibitName: current.exhibitName, categoryId: null, current, nextValidated: true, nextPublished: false,
    });
    expect(blankName).toEqual({ allowed: false, reason: 'Exhibit name is required' });
    expect(noCategory).toEqual({ allowed: false, reason: 'A category is required' });
  });

  it('UT-TRANSITION-ALLOW-NOOP-01 covers draft and published no-op transitions', () => {
    const draft = record();
    expect(validateExhibitTransition({
      exhibitName: draft.exhibitName, categoryId: draft.categoryId, current: draft,
      nextValidated: false, nextPublished: false,
    })).toEqual({ allowed: true });
    const published = record({ validated: true, published: true });
    expect(validateExhibitTransition({
      exhibitName: published.exhibitName, categoryId: published.categoryId, current: published,
      nextValidated: true, nextPublished: true,
    })).toEqual({ allowed: true });
  });

  it('UT-TERMINAL-01 rejects every transition out of published', () => {
    const published = record({ validated: true, published: true });
    expect(validateExhibitTransition({
      exhibitName: published.exhibitName,
      categoryId: published.categoryId,
      current: published,
      nextValidated: true,
      nextPublished: false,
    }).allowed).toBe(false);
    expect(validateExhibitTransition({
      exhibitName: published.exhibitName,
      categoryId: published.categoryId,
      current: published,
      nextValidated: false,
      nextPublished: false,
    })).toEqual({ allowed: false, reason: 'A published exhibit cannot return to draft or validated state' });
  });

  it('UT-TRANSITION-VALIDATED-DISALLOWED-01 rejects invalid transitions out of validated while allowing validated -> draft un-validation', () => {
    const validated = record({ validated: true, published: false });
    // MuseumOS deliberately permits validated -> draft so senior curators can un-validate an unpublished exhibit for revision.
    expect(validateExhibitTransition({
      exhibitName: validated.exhibitName,
      categoryId: validated.categoryId,
      current: validated,
      nextValidated: false,
      nextPublished: false,
    })).toEqual({ allowed: true });

    // Transitioning validated -> published fails if required invariants (exhibitName / categoryId) are broken:
    expect(validateExhibitTransition({
      exhibitName: '   ',
      categoryId: validated.categoryId,
      current: validated,
      nextValidated: true,
      nextPublished: true,
    })).toEqual({ allowed: false, reason: 'Exhibit name is required' });

    expect(validateExhibitTransition({
      exhibitName: validated.exhibitName,
      categoryId: null,
      current: validated,
      nextValidated: true,
      nextPublished: true,
    })).toEqual({ allowed: false, reason: 'A category is required' });

    // Transitioning validated -> published while simultaneously clearing validated fails precondition:
    expect(validateExhibitTransition({
      exhibitName: validated.exhibitName,
      categoryId: validated.categoryId,
      current: validated,
      nextValidated: false,
      nextPublished: true,
    })).toEqual({ allowed: false, reason: 'An exhibit must be validated before it can be published' });
  });
});
