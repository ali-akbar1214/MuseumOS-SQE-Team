import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

export type TeamRole = 'admin' | 'curator' | 'viewer';

export const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL;
export const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD;
export const VIEWER_EMAIL = process.env.TEST_VIEWER_EMAIL;
export const VIEWER_PASSWORD = process.env.TEST_VIEWER_PASSWORD;
export const CURATOR_EMAIL = process.env.TEST_CURATOR_EMAIL;
export const CURATOR_PASSWORD = process.env.TEST_CURATOR_PASSWORD;

export const EVIDENCE_A11Y_DIR = path.resolve('docs/team/evidence/accessibility');
export const EVIDENCE_SEC_DIR = path.resolve('docs/team/evidence/security');
export const ACCESS_CHECKS_FILE = path.join(EVIDENCE_SEC_DIR, 'access-checks.json');
fs.mkdirSync(EVIDENCE_A11Y_DIR, { recursive: true });
fs.mkdirSync(EVIDENCE_SEC_DIR, { recursive: true });

export interface AccessCheckRecord {
  role: string;
  action: string;
  endpoint: string;
  expected: number;
  observed: number;
  statePreserved?: boolean;
  note?: string;
}

function cachePathForRole(role: TeamRole): string {
  const hostTag = new URL(process.env.WEB_URL ?? 'http://localhost:5173').hostname.replace(/[^a-zA-Z0-9.-]/g, '_');
  return path.join(os.tmpdir(), `museumos-sqe-${hostTag}-${role}-session.json`);
}

function credentialsForRole(role: TeamRole): { identifier: string; secret: string } {
  if (role === 'admin' && ADMIN_EMAIL && ADMIN_PASSWORD) {
    return { identifier: ADMIN_EMAIL, secret: ADMIN_PASSWORD };
  }
  if (role === 'curator' && CURATOR_EMAIL && CURATOR_PASSWORD) {
    return { identifier: CURATOR_EMAIL, secret: CURATOR_PASSWORD };
  }
  if (role === 'viewer' && VIEWER_EMAIL && VIEWER_PASSWORD) {
    return { identifier: VIEWER_EMAIL, secret: VIEWER_PASSWORD };
  }
  throw new Error(`Missing TEST_${role.toUpperCase()}_EMAIL / TEST_${role.toUpperCase()}_PASSWORD env vars.`);
}

export async function loginAs(page: Page, identifier: string | undefined, secret: string | undefined) {
  if (!identifier || !secret) {
    throw new Error('Set the matching TEST_*_EMAIL and TEST_*_PASSWORD values for browser tests');
  }
  await page.context().clearCookies();
  await page.addInitScript(() => localStorage.setItem('lang', 'en'));
  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.locator('#identifier').fill(identifier);
  await page.locator('#password').fill(secret);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.waitForTimeout(300);
}

export async function loginRole(page: Page, role: TeamRole) {
  await page.addInitScript(() => localStorage.setItem('lang', 'en'));
  await page.context().clearCookies();
  const cacheFile = cachePathForRole(role);

  if (fs.existsSync(cacheFile)) {
    try {
      const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      if (Array.isArray(cached.cookies) && cached.cookies.length > 0) {
        await page.context().addCookies(cached.cookies);
        const me = await page.context().request.get('/api/auth/me');
        if (me.status() === 200) {
          return;
        }
      }
    } catch {
      // Fall through to fresh API login
    }
  }

  const { identifier, secret } = credentialsForRole(role);
  const res = await page.context().request.post('/api/auth/login', {
    data: { identifier, password: secret },
  });
  expect(res.status(), `API login for ${role} failed`).toBe(200);
  const cookies = await page.context().cookies();
  const sid = cookies.find((c) => c.name === 'museumos.sid');
  if (sid) {
    fs.writeFileSync(cacheFile, JSON.stringify({ sidValue: sid.value, cookies: [sid] }));
  }
}

export async function loginAdmin(page: Page) {
  await loginRole(page, 'admin');
}

export async function clearSessionContext(page: Page) {
  await page.context().clearCookies();
}

export async function logoutViaApi(page: Page) {
  const cookies = await page.context().cookies();
  const currentSid = cookies.find((c) => c.name === 'museumos.sid')?.value;
  if (currentSid) {
    for (const role of ['admin', 'curator', 'viewer'] as const) {
      const cacheFile = cachePathForRole(role);
      if (fs.existsSync(cacheFile)) {
        try {
          const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
          if (cached.sidValue === currentSid) fs.unlinkSync(cacheFile);
        } catch {
          // ignore
        }
      }
    }
  }
  await apiRequest(page, 'POST', '/api/auth/logout');
  await page.context().clearCookies();
}

export async function apiRequest(page: Page, method: string, route: string, body?: unknown) {
  await new Promise((resolve) => setTimeout(resolve, 75));
  const response = await page.context().request.fetch(route, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    data: body === undefined ? undefined : body,
  });
  const text = await response.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  return { status: response.status(), body: parsed };
}

export async function createDraftThroughApi(
  page: Page,
  name: string,
  cleanupIds: string[],
  overrides: Record<string, unknown> = {},
) {
  const cats = await apiRequest(page, 'GET', '/api/categories');
  expect(cats.status).toBe(200);
  const categories = cats.body as Array<{ id: string; code: string }>;
  const created = await apiRequest(page, 'POST', '/api/exhibits', {
    categoryId: categories[0]!.id,
    exhibitName: name,
    year: 2000,
    collectiblePrice: 25,
    attributes: {},
    ...overrides,
  });
  expect(created.status).toBe(201);
  const exhibit = created.body as {
    id: string;
    displayId: string;
    exhibitName: string;
    categoryId: string;
    year: number | null;
    collectiblePrice: number | null;
    validated: boolean;
    published: boolean;
    updatedAt: string;
  };
  cleanupIds.push(exhibit.id);
  return exhibit;
}

export async function cleanupExhibits(page: Page, cleanupIds: string[]) {
  if (cleanupIds.length === 0) return;
  await loginAdmin(page);
  for (const id of cleanupIds.splice(0)) {
    await apiRequest(page, 'DELETE', `/api/exhibits/${id}`).catch(() => undefined);
  }
}

export function resetAccessChecks() {
  fs.writeFileSync(
    ACCESS_CHECKS_FILE,
    `${JSON.stringify({ capturedAt: new Date().toISOString(), checks: [] }, null, 2)}\n`,
  );
}

export function recordAccessChecks(newChecks: AccessCheckRecord[]) {
  let existing: AccessCheckRecord[] = [];
  if (fs.existsSync(ACCESS_CHECKS_FILE)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(ACCESS_CHECKS_FILE, 'utf8'));
      if (Array.isArray(parsed.checks)) existing = parsed.checks;
    } catch {
      existing = [];
    }
  }
  const merged = [...existing];
  for (const item of newChecks) {
    const idx = merged.findIndex(
      (c) => c.role === item.role && c.action === item.action && c.endpoint === item.endpoint && c.expected === item.expected,
    );
    if (idx >= 0) merged[idx] = item;
    else merged.push(item);
  }
  fs.writeFileSync(
    ACCESS_CHECKS_FILE,
    `${JSON.stringify({ capturedAt: new Date().toISOString(), totalChecks: merged.length, checks: merged }, null, 2)}\n`,
  );
}

export async function captureAxe(page: Page, filename: string) {
  const result = await new AxeBuilder({ page }).analyze();
  const report = {
    capturedAt: new Date().toISOString(),
    url: page.url(),
    violations: result.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      help: violation.help,
      nodes: violation.nodes.map((node) => ({
        target: node.target,
        impact: node.impact,
        html: node.html,
        summary: node.failureSummary,
      })),
    })),
    passes: result.passes.length,
    incomplete: result.incomplete.length,
  };
  fs.writeFileSync(path.join(EVIDENCE_A11Y_DIR, filename), `${JSON.stringify(report, null, 2)}\n`);
  return report;
}
