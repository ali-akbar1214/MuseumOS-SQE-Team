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
  test('UC-01 Main + A1 + A2: create with required-field correction, keyboard submission, and omitted optional year/price', async ({
    page,
  }) => {
    await loginAdmin(page);
    await page.goto('/exhibits');
    await page.getByRole('button', { name: /add exhibit/i }).click();

    const form = page.locator('form').last();
    const category = form.locator('#new-exhibit-category');
    const create = form.getByRole('button', { name: /^create$/i });
    const name = form.locator('#new-exhibit-name');

    // Initial focus starts on category; Create is disabled until required fields are valid (UC-01-A2)
    await expect(category).toBeFocused();
    await expect(create).toBeDisabled();

    const books = await category.locator('option').filter({ hasText: 'Books' }).first().getAttribute('value');
    expect(books).toBeTruthy();
    await category.selectOption(books!);
    await expect(create).toBeDisabled();

    // Blank whitespace name remains rejected by UI validation
    await name.fill('   ');
    await expect(create).toBeDisabled();

    // Correct the name and leave optional year & price omitted (UC-01-A1)
    const exhibitName = `SQE UC01 Keyboard ${Date.now()}`;
    await name.fill(exhibitName);
    await expect(create).toBeEnabled();

    const createAxe = await captureAxe(page, 'axe-after-create-screen.json');
    expect(createAxe.violations.filter((v) => v.impact === 'critical')).toHaveLength(0);

    // Keyboard Tab traversal from name to Create and submit via Enter
    await expect(name).toBeFocused();
    let createFocused = false;
    for (let i = 0; i < 24; i += 1) {
      await page.keyboard.press('Tab');
      if (await create.evaluate((btn) => btn === document.activeElement)) {
        createFocused = true;
        break;
      }
    }
    expect(createFocused, 'Tab order should reach Create after required fields').toBe(true);
    await page.keyboard.press('Enter');

    await expect(page).toHaveURL(/\/exhibits\/[0-9a-f-]{36}$/i);
    const id = page.url().split('/').at(-1)!;
    cleanupIds.push(id);
    await expect(page.getByRole('heading', { name: exhibitName })).toBeVisible();

    const readback = await apiRequest(page, 'GET', `/api/exhibits/${id}`);
    expect(readback.status).toBe(200);
    expect((readback.body as Record<string, unknown>).exhibitName).toBe(exhibitName);
    expect((readback.body as Record<string, unknown>).year).toBeNull();
    expect((readback.body as Record<string, unknown>).collectiblePrice).toBeNull();
    expect((readback.body as Record<string, unknown>).published).toBe(false);

    const detailAxe = await captureAxe(page, 'axe-after-create-detail-screen.json');
    expect(detailAxe.violations).toHaveLength(0);
  });

  test('UC-01 E1 + E2: missing name keeps Create disabled and unknown category is rejected by API', async ({
    page,
  }) => {
    await loginAdmin(page);
    await page.goto('/exhibits');
    await page.getByRole('button', { name: /add exhibit/i }).click();

    const form = page.locator('form').last();
    const category = form.locator('#new-exhibit-category');
    const create = form.getByRole('button', { name: /^create$/i });
    const name = form.locator('#new-exhibit-name');

    // E1: name entered without category -> disabled; category entered without name -> disabled
    await name.fill('Missing Category Exhibit');
    await expect(create).toBeDisabled();
    await name.fill('');
    const firstOpt = await category.locator('option').nth(1).getAttribute('value');
    await category.selectOption(firstOpt!);
    await expect(create).toBeDisabled();

    // E1/E2 at API boundary: blank name -> 400; invalid category UUID -> 400
    const blankResp = await apiRequest(page, 'POST', '/api/exhibits', {
      categoryId: firstOpt,
      exhibitName: '',
      attributes: {},
    });
    expect(blankResp.status).toBe(400);

    const badCatResp = await apiRequest(page, 'POST', '/api/exhibits', {
      categoryId: 'not-a-uuid',
      exhibitName: `SQE Invalid Cat ${Date.now()}`,
      attributes: {},
    });
    expect(badCatResp.status).toBe(400);
  });
});

test.describe('UC-02: Validate and publish an exhibit (Ali Akbar)', () => {
  test('UC-02 Main + E1: rejects direct publish while unvalidated, explains fix, then validates and publishes', async ({
    page,
  }) => {
    await loginAdmin(page);
    const exhibit = await createDraftThroughApi(page, `SQE UC02 Publish ${Date.now()}`, cleanupIds);
    await page.goto(`/exhibits/${exhibit.id}`);
    await expect(page.getByRole('heading', { name: exhibit.exhibitName })).toBeVisible();

    await page.getByRole('button', { name: /^edit$/i }).click();
    const validated = page.getByRole('switch', { name: 'Validated' });
    const published = page.getByRole('switch', { name: 'Published' });
    await expect(validated).toHaveAttribute('aria-checked', 'false');
    await expect(published).toHaveAttribute('aria-checked', 'false');

    // UC-02-E1: attempt direct publish while unvalidated
    await published.click();
    await page.getByRole('button', { name: /^save$/i }).click();
    await expect(page.getByText(/must be validated before it can be published/i)).toBeVisible();

    // Correct by unchecking published, validating first, saving, then publishing
    await published.click();
    await validated.click();
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

  test('UC-02 A1 + A2 + E2: defer publish after validate, idempotent repeat publish, and reject published-to-draft revert', async ({
    page,
  }) => {
    await loginAdmin(page);
    const exhibit = await createDraftThroughApi(page, `SQE UC02 Lifecycle ${Date.now()}`, cleanupIds);
    await page.goto(`/exhibits/${exhibit.id}`);

    // UC-02-A1: validate and defer publish
    await page.getByRole('button', { name: /^edit$/i }).click();
    await page.getByRole('switch', { name: 'Validated' }).click();
    await page.getByRole('button', { name: /^save$/i }).click();
    await expect(page.getByRole('switch', { name: 'Validated' })).toHaveCount(0);

    let persisted = await apiRequest(page, 'GET', `/api/exhibits/${exhibit.id}`);
    expect((persisted.body as Record<string, unknown>).validated).toBe(true);
    expect((persisted.body as Record<string, unknown>).published).toBe(false);

    // Publish now, then repeat publish (UC-02-A2) and verify single idempotent record
    const pub1 = await apiRequest(page, 'PATCH', `/api/exhibits/${exhibit.id}`, { published: true });
    expect(pub1.status).toBe(200);
    const pub2 = await apiRequest(page, 'PATCH', `/api/exhibits/${exhibit.id}`, { published: true });
    expect(pub2.status).toBe(200);

    // UC-02-E2: attempt published-to-draft revert via UI edit toggles
    await page.reload();
    await page.getByRole('button', { name: /^edit$/i }).click();
    await page.getByRole('switch', { name: 'Published' }).click();
    await page.getByRole('switch', { name: 'Validated' }).click();
    await page.getByRole('button', { name: /^save$/i }).click();
    await expect(page.getByText(/cannot return to draft or validated state/i)).toBeVisible();

    persisted = await apiRequest(page, 'GET', `/api/exhibits/${exhibit.id}`);
    expect((persisted.body as Record<string, unknown>).validated).toBe(true);
    expect((persisted.body as Record<string, unknown>).published).toBe(true);
  });
});
