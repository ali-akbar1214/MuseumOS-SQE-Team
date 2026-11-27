import { test, expect } from '@playwright/test';
import {
  apiRequest,
  captureAxe,
  cleanupExhibits,
  createDraftThroughApi,
  loginAdmin,
} from './helpers';

const cleanupIds: string[] = [];
test.setTimeout(60_000);

test.afterEach(async ({ page }) => {
  await cleanupExhibits(page, cleanupIds);
});

test.describe('UC-01: Catalogue an exhibit (Burhan Ahmed)', () => {
  test('UC-01 Main: creates exhibit via UI with category, name, and year, persists draft once, and passes axe-core', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await loginAdmin(page);
    await page.goto('/exhibits', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /add exhibit/i }).click();

    const form = page.locator('form').last();
    const category = form.locator('#new-exhibit-category');
    const name = form.locator('#new-exhibit-name');
    const year = form.locator('#new-exhibit-year');
    const create = form.getByRole('button', { name: /^create$/i });

    const books = await category.locator('option').filter({ hasText: 'Books' }).first().getAttribute('value');
    expect(books).toBeTruthy();
    await category.selectOption(books!);

    const exhibitName = `SQE UC01 Main ${Date.now()}`;
    await name.fill(exhibitName);
    await year.fill('1992');

    const createAxe = await captureAxe(page, 'axe-after-create-screen.json');
    expect(createAxe.violations).toHaveLength(0);

    await create.click();
    await expect(page).toHaveURL(/\/exhibits\/[0-9a-f-]{36}$/i);
    const id = page.url().split('/').at(-1)!;
    cleanupIds.push(id);
    await expect(page.getByRole('heading', { name: exhibitName })).toBeVisible();

    const readback = await apiRequest(page, 'GET', `/api/exhibits/${id}`);
    expect(readback.status).toBe(200);
    const record = readback.body as Record<string, unknown>;
    expect(record.exhibitName).toBe(exhibitName);
    expect(record.displayId).toBeTruthy();
    expect(record.acquiredAt).toBeTruthy();
    expect(record.year).toBe(1992);
    expect(record.validated).toBe(false);
    expect(record.published).toBe(false);

    const detailAxe = await captureAxe(page, 'axe-after-create-detail-screen.json');
    expect(detailAxe.violations).toHaveLength(0);
  });

  test('UC-01-A1: omits optional year and collectible price and persists null values', async ({ page }) => {
    await loginAdmin(page);
    await page.goto('/exhibits', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /add exhibit/i }).click();

    const form = page.locator('form').last();
    const category = form.locator('#new-exhibit-category');
    const name = form.locator('#new-exhibit-name');
    const create = form.getByRole('button', { name: /^create$/i });

    const firstOpt = await category.locator('option').nth(1).getAttribute('value');
    await category.selectOption(firstOpt!);
    const exhibitName = `SQE UC01 A1 Optional ${Date.now()}`;
    await name.fill(exhibitName);
    await create.click();

    await expect(page).toHaveURL(/\/exhibits\/[0-9a-f-]{36}$/i);
    const id = page.url().split('/').at(-1)!;
    cleanupIds.push(id);

    const readback = await apiRequest(page, 'GET', `/api/exhibits/${id}`);
    expect(readback.status).toBe(200);
    expect((readback.body as Record<string, unknown>).year).toBeNull();
    expect((readback.body as Record<string, unknown>).collectiblePrice).toBeNull();
  });

  test('UC-01-A2: corrects blank whitespace name and submits with keyboard Tab and Enter', async ({ page }) => {
    await loginAdmin(page);
    await page.goto('/exhibits', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /add exhibit/i }).click();

    const form = page.locator('form').last();
    const category = form.locator('#new-exhibit-category');
    const name = form.locator('#new-exhibit-name');
    const create = form.getByRole('button', { name: /^create$/i });

    await expect(category).toBeFocused();
    await expect(create).toBeDisabled();

    const firstOpt = await category.locator('option').nth(1).getAttribute('value');
    await category.selectOption(firstOpt!);
    await name.fill('   ');
    await expect(create).toBeDisabled();

    const exhibitName = `SQE UC01 Keyboard ${Date.now()}`;
    await name.fill(exhibitName);
    await expect(create).toBeEnabled();

    let createFocused = false;
    for (let i = 0; i < 24; i += 1) {
      await page.keyboard.press('Tab');
      if (await create.evaluate((btn) => btn === document.activeElement)) {
        createFocused = true;
        break;
      }
    }
    expect(createFocused, 'Tab traversal should focus Create button').toBe(true);
    await page.keyboard.press('Enter');

    await expect(page).toHaveURL(/\/exhibits\/[0-9a-f-]{36}$/i);
    const id = page.url().split('/').at(-1)!;
    cleanupIds.push(id);
    await expect(page.getByRole('heading', { name: exhibitName })).toBeVisible();
  });

  test('UC-01-E1: missing/blank name keeps Create disabled in UI and returns 400 at API boundary', async ({
    page,
  }) => {
    await loginAdmin(page);
    await page.goto('/exhibits', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /add exhibit/i }).click();

    const form = page.locator('form').last();
    const category = form.locator('#new-exhibit-category');
    const create = form.getByRole('button', { name: /^create$/i });

    const firstOpt = await category.locator('option').nth(1).getAttribute('value');
    await category.selectOption(firstOpt!);
    await expect(create).toBeDisabled();

    const blankResp = await apiRequest(page, 'POST', '/api/exhibits', {
      categoryId: firstOpt,
      exhibitName: '',
      attributes: {},
    });
    expect(blankResp.status).toBe(400);
  });

  test('UC-01-E2: missing category keeps Create disabled and malformed category UUID returns 400', async ({
    page,
  }) => {
    await loginAdmin(page);
    await page.goto('/exhibits', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /add exhibit/i }).click();

    const form = page.locator('form').last();
    const name = form.locator('#new-exhibit-name');
    const create = form.getByRole('button', { name: /^create$/i });

    const missingCatName = `Missing Category ${Date.now()}`;
    await name.fill(missingCatName);
    await expect(create).toBeDisabled();

    const badCatResp = await apiRequest(page, 'POST', '/api/exhibits', {
      categoryId: 'not-a-uuid',
      exhibitName: missingCatName,
      attributes: {},
    });
    expect(badCatResp.status).toBe(400);
  });
});

test.describe('UC-02: Validate and publish an exhibit (Ali Akbar)', () => {
  test('UC-02 Main: administrator validates draft then publishes exhibit cleanly and passes axe-core', async ({
    page,
  }) => {
    await loginAdmin(page);
    const exhibit = await createDraftThroughApi(page, `SQE UC02 Main ${Date.now()}`, cleanupIds);
    await page.goto(`/exhibits/${exhibit.id}`, { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: exhibit.exhibitName })).toBeVisible();

    await page.getByRole('button', { name: /^edit$/i }).click();
    await page.getByRole('switch', { name: 'Validated' }).click();
    await page.getByRole('button', { name: /^save$/i }).click();
    await expect(page.getByRole('switch', { name: 'Validated' })).toHaveCount(0);

    await page.getByRole('button', { name: /^edit$/i }).click();
    await page.getByRole('switch', { name: 'Published' }).click();
    await page.getByRole('button', { name: /^save$/i }).click();
    await expect(page.getByText('Published', { exact: true })).toBeVisible();

    const persisted = await apiRequest(page, 'GET', `/api/exhibits/${exhibit.id}`);
    expect(persisted.status).toBe(200);
    expect((persisted.body as Record<string, unknown>).validated).toBe(true);
    expect((persisted.body as Record<string, unknown>).published).toBe(true);

    const publishAxe = await captureAxe(page, 'axe-after-publish-screen.json');
    expect(publishAxe.violations).toHaveLength(0);
  });

  test('UC-02-A1: administrator validates exhibit and defers publishing', async ({ page }) => {
    await loginAdmin(page);
    const exhibit = await createDraftThroughApi(page, `SQE UC02 A1 Defer ${Date.now()}`, cleanupIds);
    await page.goto(`/exhibits/${exhibit.id}`, { waitUntil: 'networkidle' });

    await page.getByRole('button', { name: /^edit$/i }).click();
    await page.getByRole('switch', { name: 'Validated' }).click();
    await page.getByRole('button', { name: /^save$/i }).click();
    await expect(page.getByRole('switch', { name: 'Validated' })).toHaveCount(0);

    const persisted = await apiRequest(page, 'GET', `/api/exhibits/${exhibit.id}`);
    expect(persisted.status).toBe(200);
    expect((persisted.body as Record<string, unknown>).validated).toBe(true);
    expect((persisted.body as Record<string, unknown>).published).toBe(false);
  });

  test('UC-02-A2: repeated publish request is idempotent and leaves one matching record', async ({ page }) => {
    await loginAdmin(page);
    const exhibit = await createDraftThroughApi(page, `SQE UC02 A2 Idempotent ${Date.now()}`, cleanupIds);

    const validateResp = await apiRequest(page, 'PATCH', `/api/exhibits/${exhibit.id}`, { validated: true });
    expect(validateResp.status).toBe(200);
    const pub1 = await apiRequest(page, 'PATCH', `/api/exhibits/${exhibit.id}`, { published: true });
    expect(pub1.status).toBe(200);
    const pub2 = await apiRequest(page, 'PATCH', `/api/exhibits/${exhibit.id}`, { published: true });
    expect(pub2.status).toBe(200);

    const search = await apiRequest(
      page,
      'GET',
      `/api/exhibits?q=${encodeURIComponent(exhibit.exhibitName)}`,
    );
    expect(search.status).toBe(200);
    const items = ((search.body as { items?: Array<{ id: string }> }).items ?? []).filter((r) => r.id === exhibit.id);
    expect(items).toHaveLength(1);
  });

  test('UC-02-E1: direct publish while unvalidated is rejected with guidance and leaves state unchanged', async ({
    page,
  }) => {
    await loginAdmin(page);
    const exhibit = await createDraftThroughApi(page, `SQE UC02 E1 Unvalidated ${Date.now()}`, cleanupIds);
    await page.goto(`/exhibits/${exhibit.id}`, { waitUntil: 'networkidle' });

    await page.getByRole('button', { name: /^edit$/i }).click();
    await page.getByRole('switch', { name: 'Published' }).click();
    await page.getByRole('button', { name: /^save$/i }).click();
    await expect(page.getByText(/must be validated before it can be published/i)).toBeVisible();

    const persisted = await apiRequest(page, 'GET', `/api/exhibits/${exhibit.id}`);
    expect(persisted.status).toBe(200);
    expect((persisted.body as Record<string, unknown>).validated).toBe(false);
    expect((persisted.body as Record<string, unknown>).published).toBe(false);
  });

  test('UC-02-E2: published exhibit cannot revert to draft or validated state', async ({ page }) => {
    await loginAdmin(page);
    const exhibit = await createDraftThroughApi(page, `SQE UC02 E2 Terminal ${Date.now()}`, cleanupIds);
    expect((await apiRequest(page, 'PATCH', `/api/exhibits/${exhibit.id}`, { validated: true })).status).toBe(200);
    expect((await apiRequest(page, 'PATCH', `/api/exhibits/${exhibit.id}`, { published: true })).status).toBe(200);

    await page.goto(`/exhibits/${exhibit.id}`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /^edit$/i }).click();
    await page.getByRole('switch', { name: 'Published' }).click();
    await page.getByRole('switch', { name: 'Validated' }).click();
    await page.getByRole('button', { name: /^save$/i }).click();
    await expect(page.getByText(/cannot return to draft or validated state/i)).toBeVisible();

    const persisted = await apiRequest(page, 'GET', `/api/exhibits/${exhibit.id}`);
    expect(persisted.status).toBe(200);
    expect((persisted.body as Record<string, unknown>).validated).toBe(true);
    expect((persisted.body as Record<string, unknown>).published).toBe(true);
  });
});
