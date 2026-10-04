import { screenMatrix } from './screen-matrix.mjs';

const baseUrl = (process.env.FRONTEND_BASE_URL || 'http://127.0.0.1:4173').replace(/\/$/, '');
const routes = [...new Set(['/', '/promotions', '/manager', '/warehouse', ...screenMatrix.map(({ path }) => path)])];

let failures = 0;

for (const path of routes) {
  try {
    const response = await fetch(`${baseUrl}${path}`, { redirect: 'manual' });
    const body = await response.text();
    const isSpaDocument = response.status === 200 && body.includes('<div id="root"></div>');

    if (!isSpaDocument) {
      failures += 1;
      console.error(`FAIL ${path}: HTTP ${response.status} hoặc thiếu React root.`);
      continue;
    }

    console.log(`PASS ${path}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${path}: ${error.message}`);
  }
}

if (failures > 0) {
  console.error(`Route smoke thất bại: ${failures}/${routes.length} route.`);
  process.exitCode = 1;
} else {
  console.log(`Route smoke thành công: ${routes.length}/${routes.length} route.`);
}
