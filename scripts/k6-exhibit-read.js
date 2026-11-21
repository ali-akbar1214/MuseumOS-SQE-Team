import http from 'k6/http';
import { check, sleep } from 'k6';

const base = __ENV.K6_BASE_URL || 'http://localhost:3000/api';
const id = __ENV.K6_EXHIBIT_ID;

export const options = {
  vus: __ENV.K6_VUS ? Number(__ENV.K6_VUS) : 1,
  duration: '60s',
};

export default function () {
  if (!id) throw new Error('Set K6_EXHIBIT_ID');
  const response = http.get(`${base}/exhibits/${id}`);
  check(response, { 'read returns 200': (r) => r.status === 200 });
  sleep(1);
}
