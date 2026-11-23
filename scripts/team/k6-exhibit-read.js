import http from 'k6/http';
import { check, sleep, fail } from 'k6';

const base = __ENV.K6_BASE_URL || 'http://host.docker.internal:3000/api';
const email = __ENV.K6_ADMIN_EMAIL;
const password = __ENV.K6_ADMIN_PASSWORD;

export const options = {
  vus: __ENV.K6_VUS ? Number(__ENV.K6_VUS) : 1,
  duration: __ENV.K6_DURATION || '60s',
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
  },
};

export function setup() {
  if (!email || !password) fail('Set K6_ADMIN_EMAIL and K6_ADMIN_PASSWORD');
  const login = http.post(`${base}/auth/login`, JSON.stringify({ identifier: email, password }), {
    headers: { 'content-type': 'application/json' },
  });
  check(login, { 'admin login succeeds': (r) => r.status === 200 });
  if (login.status !== 200) fail(`Admin login failed: ${login.status}`);
  const cookie = login.cookies['museumos.sid']?.[0]?.value;
  if (!cookie) fail('Login response did not set museumos.sid');

  const categories = http.get(`${base}/categories`, { headers: { Cookie: `museumos.sid=${cookie}` } });
  if (categories.status !== 200) fail(`Category read failed: ${categories.status}`);
  const category = categories.json()[0];
  if (!category) fail('No category is seeded');
  const created = http.post(`${base}/exhibits`, JSON.stringify({
    categoryId: category.id,
    exhibitName: `SQE k6 target ${Date.now()}`,
    year: 2000,
    attributes: {},
  }), {
    headers: { 'content-type': 'application/json', Cookie: `museumos.sid=${cookie}` },
  });
  if (created.status !== 201) fail(`Target exhibit creation failed: ${created.status}`);
  return { cookie, id: created.json('id') };
}

export default function (data) {
  const response = http.get(`${base}/exhibits/${data.id}`, {
    headers: { Cookie: `museumos.sid=${data.cookie}` },
  });
  check(response, { 'authenticated exhibit read returns 200': (r) => r.status === 200 });
  sleep(1);
}

export function teardown(data) {
  http.del(`${base}/exhibits/${data.id}`, null, { headers: { Cookie: `museumos.sid=${data.cookie}` } });
}
