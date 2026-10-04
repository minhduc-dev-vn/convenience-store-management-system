import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  formatAuditValue,
  sanitizeAuditValue,
  validateAuditDateRange,
} from '../src/pages/manager/auditPresentation.js';
import { buildAuditDetailPath, buildAuditListPath } from '../src/services/auditQuery.js';

test('audit paths use only C43 filters and encode the detail id', () => {
  assert.equal(
    buildAuditListPath({
      page: 2,
      pageSize: 20,
      from: '2026-10-01',
      to: '2026-10-04',
      username: 'manager.user',
      action: 'ACCOUNT_LOCKED',
      table: 'TAI_KHOAN',
      recordId: 'TK 01',
      search: 'ignored',
    }),
    '/admin/audit-logs?page=2&pageSize=20&from=2026-10-01&to=2026-10-04&username=manager.user&action=ACCOUNT_LOCKED&table=TAI_KHOAN&recordId=TK+01',
  );
  assert.equal(buildAuditDetailPath(4301), '/admin/audit-logs/4301');
  assert.throws(() => buildAuditDetailPath('log-1'), /positive integer/);
});

test('audit filter date validation mirrors the inclusive C43 range contract', () => {
  assert.equal(validateAuditDateRange({ from: '2026-10-01', to: '2026-10-04' }), '');
  assert.match(
    validateAuditDateRange({ from: '2026-10-05', to: '2026-10-04' }),
    /không được sau/,
  );
});

test('audit presentation redacts nested authentication secrets defensively', () => {
  const safe = sanitizeAuditValue({
    status: 'LOCKED',
    nested: { passwordHash: 'should-never-render', token: 'private-token' },
    rows: [{ authorization: 'Bearer hidden' }, { reason: 'Manager action' }],
  });
  const rendered = JSON.stringify(safe);
  assert.equal(rendered.includes('should-never-render'), false);
  assert.equal(rendered.includes('private-token'), false);
  assert.equal(rendered.includes('Bearer hidden'), false);
  assert.equal(rendered.includes('Manager action'), true);
  assert.equal(formatAuditValue(null), 'Không có dữ liệu');
});

test('MH-22 is wired into the manager-only route and navigation', () => {
  const routes = readFileSync(new URL('../src/routes/AppRoutes.jsx', import.meta.url), 'utf8');
  const layout = readFileSync(new URL('../src/layouts/ManagerLayout.jsx', import.meta.url), 'utf8');
  const page = readFileSync(new URL('../src/pages/manager/AuditLogPage.jsx', import.meta.url), 'utf8');

  assert.match(routes, /ProtectedRoute allowedRoles=\{\['MANAGER'\]\}/);
  assert.match(routes, /path="audit-logs" element=\{<AuditLogPage \/>\}/);
  assert.match(layout, /\/manager\/audit-logs/);
  assert.match(page, /listAuditLogs/);
  assert.match(page, /getAuditLog/);
  assert.doesNotMatch(page, /passwordHash|accessToken|Authorization/);
});
