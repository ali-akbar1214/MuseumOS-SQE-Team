import type { Request } from 'express';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AuditAction, AuditService } from '../../src/audit/audit.service';
import type { SessionUser } from '../../src/auth/auth.service';
import type { CategoriesService } from '../../src/categories';
import type { DatabaseService } from '../../src/database';
import type { ExhibitImagesService } from '../../src/exhibits/exhibit-images.service';
import type { ExhibitsSearchService } from '../../src/exhibits/exhibits-search.service';
import { ExhibitsController } from '../../src/exhibits/exhibits.controller';
import { ExhibitsService } from '../../src/exhibits/exhibits.service';

const categoryId = '10000000-0000-4000-8000-000000000001';
const exhibitId = '20000000-0000-4000-8000-000000000001';
const actorId = '30000000-0000-4000-8000-000000000001';

function makeRawExhibit(overrides: Record<string, unknown> = {}) {
  return {
    id: exhibitId,
    categoryId,
    displayId: 'BK00001',
    legacyId: null,
    exhibitName: 'ZX Spectrum 48K',
    manufacturer: 'Sinclair',
    year: 1982,
    donorId: null,
    locationId: null,
    locSite: null,
    functional: true,
    functionalComment: null,
    validated: false,
    collectiblePrice: 120,
    comment: null,
    attributes: {},
    published: false,
    acquiredAt: new Date('2025-01-01T00:00:00.000Z'),
    createdAt: new Date('2025-01-01T00:00:00.000Z'),
    updatedAt: new Date('2025-01-01T00:00:00.000Z'),
    deletedAt: null,
    createdById: actorId,
    updatedById: actorId,
    category: { id: categoryId, code: 'books', nameEn: 'Books', nameEl: 'Βιβλία', idPrefix: 'BK' },
    donor: null,
    location: null,
    tags: [{ tag: { id: '40000000-0000-4000-8000-000000000001', name: 'Featured', color: '#17324d' } }],
    images: [{ id: 'img-1', storageKey: 'k1.jpg', originalFilename: 'front.jpg', mimeType: 'image/jpeg', isPrimary: true, position: 0, revision: 1 }],
    _count: { images: 1 },
    ...overrides,
  };
}

function makeActor(role: SessionUser['role'], permissions: string[]): SessionUser {
  return {
    id: actorId,
    email: `${role}@museumos.test`,
    displayName: role,
    role,
    themePreference: 'light',
    langPreference: 'en',
    permissions,
  };
}

function makeReq(ip?: string, userAgent?: string): Request {
  return {
    ip,
    get: (header: string) => (header.toLowerCase() === 'user-agent' ? userAgent : undefined),
  } as unknown as Request;
}

describe('ExhibitsService workflow methods', () => {
  it('generates sequential display IDs starting at 00001', async () => {
    const categories = { findById: vi.fn(async () => ({ id: categoryId, idPrefix: 'BK' })) };
    const db = {
      $queryRawUnsafe: vi
        .fn()
        .mockResolvedValueOnce([{ max_num: null }])
        .mockResolvedValueOnce([{ max_num: 41 }]),
    };
    const service = new ExhibitsService(db as unknown as DatabaseService, categories as unknown as CategoriesService);

    expect(await service.generateDisplayId(categoryId)).toBe('BK00001');
    expect(await service.generateDisplayId(categoryId)).toBe('BK00042');
  });

  it('creates exhibits with default and explicit acquiredAt and formats relations', async () => {
    const categories = { findById: vi.fn(async () => ({ id: categoryId, idPrefix: 'BK' })) };
    const createdRow = makeRawExhibit();
    const db = {
      $queryRawUnsafe: vi.fn(async () => [{ max_num: 0 }]),
      exhibit: {
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...createdRow, ...data })),
      },
    };
    const service = new ExhibitsService(db as unknown as DatabaseService, categories as unknown as CategoriesService);

    const first = await service.create({ categoryId, exhibitName: 'ZX Spectrum 48K', attributes: {} }, actorId);
    expect(first.displayId).toBe('BK00001');
    expect(first.imageCount).toBe(1);
    expect(first.tags).toHaveLength(1);
    expect(first.images[0]?.filename).toBe('front.jpg');

    const second = await service.create(
      {
        categoryId,
        exhibitName: 'Amiga 500',
        manufacturer: 'Commodore',
        year: 1987,
        donorId: '50000000-0000-4000-8000-000000000001',
        locationId: '60000000-0000-4000-8000-000000000001',
        locSite: 'Bay 2',
        functional: true,
        functionalComment: 'Working cleanly',
        collectiblePrice: 350,
        comment: 'Complete with box',
        acquiredAt: '2024-06-01T00:00:00.000Z',
        attributes: undefined as unknown as Record<string, unknown>,
      },
      actorId,
    );
    expect(second.acquiredAt).toEqual(new Date('2024-06-01T00:00:00.000Z'));
    expect(second.manufacturer).toBe('Commodore');
  });

  it('throws NotFoundException on missing exhibit and validates restore/softDelete', async () => {
    const db = {
      exhibit: {
        findFirst: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(makeRawExhibit()),
        findUnique: vi
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(makeRawExhibit({ deletedAt: null }))
          .mockResolvedValueOnce(makeRawExhibit({ deletedAt: new Date() })),
        update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => makeRawExhibit(data)),
      },
    };
    const service = new ExhibitsService(db as unknown as DatabaseService, {} as CategoriesService);

    await expect(service.findById(exhibitId)).rejects.toThrow(NotFoundException);
    await expect(service.restore(exhibitId, actorId)).rejects.toThrow(NotFoundException);
    await expect(service.restore(exhibitId, actorId)).rejects.toThrow(BadRequestException);

    const restored = await service.restore(exhibitId, actorId);
    expect(restored.deletedAt).toBeNull();

    await service.softDelete(exhibitId, actorId);
    expect(db.exhibit.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: exhibitId },
        data: expect.objectContaining({ updatedById: actorId }),
      }),
    );
  });

  it('updates nullable and lifecycle fields cleanly', async () => {
    const current = makeRawExhibit();
    const db = {
      exhibit: {
        findFirst: vi.fn(async () => current),
        update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...current, ...data })),
      },
    };
    const service = new ExhibitsService(db as unknown as DatabaseService, {} as CategoriesService);

    const updated = await service.update(
      exhibitId,
      { exhibitName: 'Updated', year: 1985, collectiblePrice: null, validated: true, acquiredAt: null },
      actorId,
    );
    expect(updated.exhibitName).toBe('Updated');
    expect(updated.year).toBe(1985);
    expect(updated.collectiblePrice).toBeNull();
    expect(updated.validated).toBe(true);
    expect(updated.acquiredAt).toBeNull();
  });

  it('updates remaining optional fields and formats omitted relation fields', async () => {
    const current = makeRawExhibit();
    const minimalRow = {
      ...makeRawExhibit({
        id: '20000000-0000-4000-8000-000000000002',
        tags: undefined,
        _count: undefined,
        images: [{ id: 'img-2', storageKey: 'fallback.jpg', originalFilename: null, mimeType: 'image/jpeg', isPrimary: false, position: 1, revision: 0 }],
      }),
    };
    const db = {
      exhibit: {
        findFirst: vi.fn(async () => current),
        update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...minimalRow, ...data })),
      },
    };
    const service = new ExhibitsService(db as unknown as DatabaseService, {} as CategoriesService);

    const fullUpdate = await service.update(
      exhibitId,
      {
        categoryId,
        manufacturer: 'Sinclair Research',
        donorId: '50000000-0000-4000-8000-000000000001',
        locationId: '60000000-0000-4000-8000-000000000001',
        locSite: 'Shelf A',
        functional: false,
        functionalComment: 'Needs recap',
        comment: 'Restored unit',
        attributes: { ram: '48KB' },
        published: true,
        acquiredAt: '2025-02-01T00:00:00.000Z',
      },
      actorId,
    );
    expect(fullUpdate.published).toBe(true);
    expect(fullUpdate.tags).toEqual([]);
    expect(fullUpdate.imageCount).toBe(0);
    expect(fullUpdate.images[0]?.filename).toBe('fallback.jpg');

    const emptyImagesRow = makeRawExhibit({ images: undefined, tags: [], _count: { images: 0 } });
    db.exhibit.update.mockResolvedValueOnce(emptyImagesRow);
    const minimalFormatted = await service.update(exhibitId, { functional: true }, actorId);
    expect(minimalFormatted.images).toEqual([]);
  });
});

describe('ExhibitsController W1/W2 workflow and authorization boundaries', () => {
  function setupController(initialRow = makeRawExhibit()) {
    let row = { ...initialRow };
    const service = {
      create: vi.fn(async (data: Record<string, unknown>) => ({ ...row, ...data })),
      findById: vi.fn(async () => row),
      update: vi.fn(async (_id: string, data: Record<string, unknown>) => {
        row = { ...row, ...data };
        return row;
      }),
      softDelete: vi.fn(async () => undefined),
      restore: vi.fn(async () => ({ ...row, deletedAt: null })),
      findSimilar: vi.fn(async () => [{ id: exhibitId, relation: 'possible' }]),
    };
    const audit = {
      log: vi.fn(async () => undefined),
      computeDiff: AuditService.prototype.computeDiff,
    };
    const controller = new ExhibitsController(
      service as unknown as ExhibitsService,
      {} as ExhibitsSearchService,
      {} as ExhibitImagesService,
      audit as unknown as AuditService,
    );
    return { controller, service, audit };
  }

  it('rejects invalid create payloads with BadRequestException and logs valid creates', async () => {
    const { controller, audit } = setupController();
    const curator = makeActor('curator', ['exhibit:read', 'exhibit:write']);

    await expect(controller.create({ categoryId, exhibitName: '' }, curator, makeReq())).rejects.toThrow(
      BadRequestException,
    );

    const created = await controller.create(
      { categoryId, exhibitName: 'Apple IIe', year: 1983, collectiblePrice: 0 },
      curator,
      makeReq('127.0.0.1', 'vitest'),
    );
    expect(created.exhibitName).toBe('Apple IIe');
    expect(audit.log).toHaveBeenCalledWith({
      entityType: 'exhibit',
      entityId: exhibitId,
      action: AuditAction.CREATE,
      actorId,
      diff: { displayId: [null, 'BK00001'], exhibitName: [null, 'Apple IIe'] },
      ip: '127.0.0.1',
      userAgent: 'vitest',
    });

    const createdNoHeaders = await controller.create(
      { categoryId, exhibitName: 'Apple IIc' },
      curator,
      makeReq(),
    );
    expect(createdNoHeaders.exhibitName).toBe('Apple IIc');
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: AuditAction.CREATE, actorId, ip: null, userAgent: null }),
    );
  });

  it('blocks curator lifecycle edits with ForbiddenException while allowing metadata edits', async () => {
    const { controller, service, audit } = setupController();
    const curator = makeActor('curator', ['exhibit:read', 'exhibit:write']);

    await expect(
      controller.update(exhibitId, { validated: true }, curator, makeReq()),
    ).rejects.toThrow('Missing permission: exhibit:validate');
    expect(service.update).not.toHaveBeenCalled();

    // Passing categoryId together with validated when stored categoryId is null uses parsed.data.categoryId
    const missingCatSetup = setupController(makeRawExhibit({ categoryId: null, validated: false, published: false }));
    const filledCat = await missingCatSetup.controller.update(
      exhibitId,
      { categoryId, validated: true },
      makeActor('admin', []),
      makeReq(),
    );
    expect(filledCat.validated).toBe(true);

    const metaUpdated = await controller.update(
      exhibitId,
      { exhibitName: 'ZX Spectrum +2' },
      curator,
      makeReq('10.0.0.2', 'curator-ua'),
    );
    expect(metaUpdated.exhibitName).toBe('ZX Spectrum +2');
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'exhibit',
        entityId: exhibitId,
        action: AuditAction.UPDATE,
        actorId,
        ip: '10.0.0.2',
        userAgent: 'curator-ua',
      }),
    );

    // Sending unchanged lifecycle flags alongside metadata also succeeds and preserves null headers when omitted
    const unchangedFlagsUpdate = await controller.update(
      exhibitId,
      { exhibitName: 'ZX Spectrum +3', validated: false, published: false },
      curator,
      makeReq(),
    );
    expect(unchangedFlagsUpdate.exhibitName).toBe('ZX Spectrum +3');
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: AuditAction.UPDATE, ip: null, userAgent: null }),
    );
  });

  it('allows admin and senior-curator with exhibit:validate, rejects invalid transitions, and audits delete/restore', async () => {
    const { controller, audit } = setupController(makeRawExhibit({ validated: false, published: false }));
    const admin = makeActor('admin', []);
    const senior = makeActor('curator', ['exhibit:read', 'exhibit:write', 'exhibit:validate']);

    await expect(controller.update(exhibitId, { year: 1700 }, admin, makeReq())).rejects.toThrow(BadRequestException);

    // Reject direct publish while unvalidated
    await expect(controller.update(exhibitId, { published: true }, admin, makeReq())).rejects.toThrow(
      'An exhibit must be validated before it can be published',
    );

    // Senior curator validates with explicit name & category overrides, then admin publishes
    const validated = await controller.update(
      exhibitId,
      { exhibitName: 'ZX Spectrum 128K', categoryId, validated: true },
      senior,
      makeReq('127.0.0.1', 'vitest'),
    );
    expect(validated.validated).toBe(true);

    const published = await controller.update(exhibitId, { published: true }, admin, makeReq());
    expect(published.published).toBe(true);

    // Reject reverting published exhibit back to draft
    await expect(
      controller.update(exhibitId, { validated: false, published: false }, admin, makeReq()),
    ).rejects.toThrow('A published exhibit cannot return to draft or validated state');

    // No-op update skips audit log when diff is null
    const callsBeforeNoop = audit.log.mock.calls.length;
    await controller.update(exhibitId, { published: true }, admin, makeReq());
    expect(audit.log).toHaveBeenCalledTimes(callsBeforeNoop);

    expect((await controller.findById(exhibitId)).id).toBe(exhibitId);
    expect((await controller.similar(exhibitId)).items).toHaveLength(1);
    await controller.softDelete(exhibitId, admin, makeReq('127.0.0.1', 'vitest'));
    await controller.softDelete(exhibitId, admin, makeReq());
    await controller.restore(exhibitId, admin, makeReq('127.0.0.1', 'vitest'));
    await controller.restore(exhibitId, admin, makeReq());
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: 'exhibit', action: AuditAction.DELETE, ip: '127.0.0.1', userAgent: 'vitest' }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: 'exhibit', action: AuditAction.DELETE, ip: null, userAgent: null }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: 'exhibit', action: AuditAction.RESTORE, ip: '127.0.0.1', userAgent: 'vitest' }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: 'exhibit', action: AuditAction.RESTORE, ip: null, userAgent: null }),
    );
  });
});
