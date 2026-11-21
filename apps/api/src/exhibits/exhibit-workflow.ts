export type ExhibitState = 'draft' | 'validated' | 'published';

export interface ExhibitWorkflowRecord {
  exhibitName: string;
  categoryId: string | null;
  year: number | null;
  collectiblePrice: number | null;
  validated: boolean;
  published: boolean;
}

export interface ExhibitStateTransition {
  exhibitName: string;
  categoryId: string | null;
  current: ExhibitWorkflowRecord;
  nextValidated: boolean;
  nextPublished: boolean;
}

export function isAcquisitionYearAllowed(year: number | null): boolean {
  return year === null || (Number.isInteger(year) && year >= 1800 && year <= 2100);
}

export function isCollectiblePriceAllowed(price: number | null): boolean {
  return price === null || (Number.isFinite(price) && price >= 0);
}

export function getExhibitState(record: Pick<ExhibitWorkflowRecord, 'validated' | 'published'>): ExhibitState {
  if (record.published) return 'published';
  if (record.validated) return 'validated';
  return 'draft';
}

export function isPublishAllowed(record: Pick<ExhibitWorkflowRecord, 'exhibitName' | 'categoryId' | 'validated'>): boolean {
  return record.validated && record.exhibitName.trim().length > 0 && record.categoryId !== null;
}

export function validateExhibitTransition(input: ExhibitStateTransition): { allowed: true } | { allowed: false; reason: string } {
  if (input.exhibitName.trim().length === 0) {
    return { allowed: false, reason: 'Exhibit name is required' };
  }
  if (input.categoryId === null) {
    return { allowed: false, reason: 'A category is required' };
  }

  const current = getExhibitState(input.current);
  const next: ExhibitState = input.nextPublished
    ? 'published'
    : input.nextValidated
      ? 'validated'
      : 'draft';

  if (next === 'published' && !isPublishAllowed({
    exhibitName: input.exhibitName,
    categoryId: input.categoryId,
    validated: input.nextValidated,
  })) {
    return { allowed: false, reason: 'An exhibit must be validated before it can be published' };
  }

  if (current === 'published' && next !== 'published') {
    return { allowed: false, reason: 'A published exhibit cannot return to draft or validated state' };
  }

  return { allowed: true };
}
