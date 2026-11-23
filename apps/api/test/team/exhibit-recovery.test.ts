import { describe, expect, it, vi } from 'vitest';
import { ExhibitsService } from '../../src/exhibits/exhibits.service';
import type { DatabaseService } from '../../src/database';
import type { CategoriesService } from '../../src/categories';

const exhibitId = '20000000-0000-4000-8000-000000000001';
const categoryId = '10000000-0000-4000-8000-000000000001';

function rawExhibit() {
  return {
    id: exhibitId,
    categoryId,
    displayId: 'PC00001',
    legacyId: null,
    exhibitName: 'Recovery Test Exhibit',
    manufacturer: null,
    year: 2000,
    donorId: null,
    locationId: null,
    locSite: null,
    functional: null,
    functionalComment: null,
    validated: false,
    collectiblePrice: 25,
    comment: null,
    attributes: {},
    published: false,
    acquiredAt: new Date('2020-01-01T00:00:00.000Z'),
    createdAt: new Date('2020-01-01T00:00:00.000Z'),
    updatedAt: new Date('2020-01-01T00:00:00.000Z'),
    deletedAt: null,
    createdById: '30000000-0000-4000-8000-000000000001',
    updatedById: '30000000-0000-4000-8000-000000000001',
    category: { id: categoryId, code: 'computers', nameEn: 'Computers', nameEl: 'Υπολογιστές', idPrefix: 'PC' },
    donor: null,
    location: null,
    tags: [],
    images: [],
    _count: { images: 0 },
  };
}

describe('exhibit update failure and recovery', () => {
  it('keeps the persisted state unchanged when the write fails, then retries once on the same record', async () => {
    const persisted = rawExhibit();
    let failNextWrite = true;
    const db = {
      exhibit: {
        findFirst: vi.fn(async () => ({ ...persisted })),
        update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          if (failNextWrite) {
            failNextWrite = false;
            throw new Error('simulated database unavailable before write');
          }
          Object.assign(persisted, data);
          return { ...persisted };
        }),
      },
    };
    const service = new ExhibitsService(
      db as unknown as DatabaseService,
      {} as CategoriesService,
    );

    await expect(service.update(exhibitId, { year: 2025 }, '30000000-0000-4000-8000-000000000002'))
      .rejects.toThrow('simulated database unavailable before write');
    expect(persisted.year).toBe(2000);
    expect(db.exhibit.update).toHaveBeenCalledTimes(1);

    const recovered = await service.update(exhibitId, { year: 2025 }, '30000000-0000-4000-8000-000000000002');
    expect(recovered.year).toBe(2025);
    const repeated = await service.update(exhibitId, { year: 2025 }, '30000000-0000-4000-8000-000000000002');
    expect(repeated.id).toBe(exhibitId);
    expect(db.exhibit.update).toHaveBeenCalledTimes(3);
    expect(persisted.year).toBe(2025);
  });
});
