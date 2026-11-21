const base = process.env.API_URL ?? 'http://localhost:3000/api';
let sessionCookie = '';

async function request(path, options = {}) {
  const response = await fetch(base + path, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(sessionCookie ? { cookie: sessionCookie } : {}),
      ...(options.headers ?? {}),
    },
  });
  const setCookie = response.headers.get('set-cookie');
  if (setCookie) sessionCookie = setCookie.split(';', 1)[0];
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { status: response.status, body };
}

async function main() {
  const login = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      identifier: process.env.TEST_ADMIN_EMAIL ?? 'admin@museumos.local',
      password: process.env.TEST_ADMIN_PASSWORD ?? 'TestAdmin!2026',
    }),
  });
  if (login.status !== 200) throw new Error(`Login failed: ${JSON.stringify(login)}`);
  const health = await request('/health');
  const categories = await request('/categories');
  if (categories.status !== 200 || !Array.isArray(categories.body) || categories.body.length === 0) {
    throw new Error(`Cannot obtain a category: ${JSON.stringify(categories)}`);
  }
  const categoryId = categories.body[0].id;
  const stamp = Date.now();
  const created = await request('/exhibits', {
    method: 'POST',
    body: JSON.stringify({
      categoryId,
      exhibitName: `SQE API Exhibit ${stamp}`,
      year: 2000,
      collectiblePrice: 25,
      attributes: {},
    }),
  });
  if (created.status !== 201) throw new Error(`Create failed: ${JSON.stringify(created)}`);

  const id = created.body.id;
  const rejectedPublish = await request(`/exhibits/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ published: true }),
  });
  if (rejectedPublish.status !== 400) throw new Error(`Publish rule was not enforced: ${JSON.stringify(rejectedPublish)}`);

  const validated = await request(`/exhibits/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ validated: true }),
  });
  if (validated.status !== 200) throw new Error(`Validation failed: ${JSON.stringify(validated)}`);

  const published = await request(`/exhibits/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ published: true }),
  });
  if (published.status !== 200) throw new Error(`Publish failed: ${JSON.stringify(published)}`);

  const readback = await request(`/exhibits/${id}`);
  if (readback.status !== 200 || !readback.body.validated || !readback.body.published) {
    throw new Error(`Read-back failed: ${JSON.stringify(readback)}`);
  }

  console.log(JSON.stringify({
    login: login.status,
    health,
    created: { status: created.status, id, displayId: created.body.displayId },
    rejectedPublish: rejectedPublish.status,
    finalState: { validated: readback.body.validated, published: readback.body.published },
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
