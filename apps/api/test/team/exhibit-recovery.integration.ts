import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../../src/database';
import { ExhibitsService } from '../../src/exhibits/exhibits.service';
import type { CategoriesService } from '../../src/categories';

async function main() {
  const adminEmail = process.env.TEST_ADMIN_EMAIL;
  if (!adminEmail) throw new Error('Set TEST_ADMIN_EMAIL to the isolated seeded administrator account.');

  const db = new DatabaseService();
  let fixtureId: string | null = null;
  try {
    await db.$connect();
    const admin = await db.user.findUnique({ where: { email: adminEmail }, select: { id: true } });
    if (!admin) throw new Error('The TEST_ADMIN_EMAIL account was not found in the database.');
    const category = await db.category.findFirst({ select: { id: true } });
    if (!category) throw new Error('No exhibit category is available for the recovery fixture.');

    const exhibit = await db.exhibit.create({
      data: {
        categoryId: category.id,
        displayId: `SQE-RCV-${randomUUID().slice(0, 8)}`,
        exhibitName: `SQE database recovery ${randomUUID()}`,
        year: 1980,
        createdById: admin.id,
        updatedById: admin.id,
      },
      select: { id: true },
    });
    fixtureId = exhibit.id;
    const service = new ExhibitsService(db, {} as CategoriesService);
    let failureCode: string | undefined;

    try {
      await service.update(exhibit.id, { year: 2024 }, 'ffffffff-ffff-4fff-8fff-ffffffffffff');
    } catch (error) {
      failureCode = (error as { code?: string }).code;
    }
    if (failureCode !== 'P2003') throw new Error(`Expected the real database foreign-key write to fail with P2003, received ${failureCode ?? 'no error'}.`);

    const afterFailure = await db.exhibit.findUnique({ where: { id: exhibit.id }, select: { id: true, year: true } });
    const countAfterFailure = await db.exhibit.count({ where: { id: exhibit.id } });
    if (afterFailure?.year !== 1980 || countAfterFailure !== 1) {
      throw new Error(`Failed write changed persisted state or row count (year=${afterFailure?.year}, count=${countAfterFailure}).`);
    }

    await service.update(exhibit.id, { year: 2024 }, admin.id);
    await service.update(exhibit.id, { year: 2024 }, admin.id);
    const afterRetry = await db.exhibit.findUnique({ where: { id: exhibit.id }, select: { id: true, year: true } });
    const countAfterRetry = await db.exhibit.count({ where: { id: exhibit.id } });
    if (afterRetry?.year !== 2024 || countAfterRetry !== 1) {
      throw new Error(`Retry did not preserve one updated row (year=${afterRetry?.year}, count=${countAfterRetry}).`);
    }

    console.log(JSON.stringify({
      result: 'PASS',
      failureInjection: 'real PostgreSQL foreign-key violation during ExhibitsService.update',
      failureCode,
      afterFailure: { year: afterFailure.year, recordsWithId: countAfterFailure },
      afterRetry: { year: afterRetry.year, recordsWithId: countAfterRetry },
      fixtureCleanup: 'physical fixture delete in finally block',
    }, null, 2));
  } finally {
    if (fixtureId) await db.exhibit.delete({ where: { id: fixtureId } });
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
