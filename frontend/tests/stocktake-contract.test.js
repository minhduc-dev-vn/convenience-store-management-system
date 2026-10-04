import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  buildCountPayload,
  canDecideStocktake,
  canProposeStocktake,
  getWorkflowPresentation,
  isStocktakeEditable,
  validateCountForm,
} from '../src/components/stocktakePresentation.js';
import {
  buildManagerStocktakeDecisionPath,
  buildManagerStocktakeListPath,
  buildWarehouseStocktakeListPath,
  buildWarehouseStocktakeLotPath,
  buildWarehouseStocktakeProposalPath,
} from '../src/services/stocktakeQuery.js';

test('stocktake paths use only the exact C40 routes and supported filters', () => {
  assert.equal(
    buildWarehouseStocktakeListPath({ page: 2, pageSize: 10, search: 'KK 01', workflowState: 'DRAFT', ignored: 'value' }),
    '/warehouse/stocktakes?page=2&pageSize=10&search=KK+01&workflowState=DRAFT',
  );
  assert.equal(
    buildWarehouseStocktakeLotPath('KK/01', 'LO 01'),
    '/warehouse/stocktakes/KK%2F01/lots/LO%2001',
  );
  assert.equal(
    buildWarehouseStocktakeProposalPath('KK/01'),
    '/warehouse/stocktakes/KK%2F01/propose',
  );
  assert.equal(
    buildManagerStocktakeListPath({ page: 1, status: 'DRAFT', workflowState: 'PENDING_APPROVAL' }),
    '/admin/stocktakes?page=1&status=DRAFT&workflowState=PENDING_APPROVAL',
  );
  assert.equal(
    buildManagerStocktakeDecisionPath('KK/01', 'approve'),
    '/admin/stocktakes/KK%2F01/approve',
  );
  assert.throws(() => buildManagerStocktakeDecisionPath('KK01', 'complete'));
});

test('count payload contains only server contract fields and validates integers', () => {
  assert.deepEqual(validateCountForm({ actualQuantity: '12', reason: '  Vỡ hộp  ' }), {});
  assert.deepEqual(buildCountPayload({ actualQuantity: '12', reason: '  Vỡ hộp  ' }), {
    actualQuantity: 12,
    reason: 'Vỡ hộp',
  });
  assert.ok(validateCountForm({ actualQuantity: '-1', reason: '' }).actualQuantity);
  assert.ok(validateCountForm({ actualQuantity: '1.5', reason: '' }).actualQuantity);
});

test('workflow guards follow C40 workflow state instead of inventing COMPLETED', () => {
  const draft = { schemaStatus: 'DRAFT', discrepancyCount: 2, workflow: { state: 'DRAFT' } };
  const pending = { ...draft, workflow: { state: 'PENDING_APPROVAL' } };
  const approved = { schemaStatus: 'APPROVED', discrepancyCount: 2, workflow: { state: 'APPROVED' } };
  assert.equal(isStocktakeEditable(draft), true);
  assert.equal(canProposeStocktake(draft), true);
  assert.equal(isStocktakeEditable(pending), false);
  assert.equal(canDecideStocktake(pending), true);
  assert.equal(isStocktakeEditable(approved), false);
  assert.equal(canDecideStocktake(approved), false);
  assert.equal(getWorkflowPresentation('APPROVED').label, 'Đã phê duyệt');
  assert.equal(getWorkflowPresentation('COMPLETED').tone, 'neutral');
});

test('C41 routes and role menus are wired while discrepancy remains server-owned', () => {
  const routes = readFileSync(new URL('../src/routes/AppRoutes.jsx', import.meta.url), 'utf8');
  const navigation = readFileSync(new URL('../src/layouts/navigation.js', import.meta.url), 'utf8');
  const warehousePage = readFileSync(new URL('../src/pages/warehouse/StocktakePage.jsx', import.meta.url), 'utf8');
  const managerPage = readFileSync(new URL('../src/pages/manager/StocktakeApprovalPage.jsx', import.meta.url), 'utf8');

  assert.match(routes, /path="stocktakes" element={<WarehouseStocktakePage \/>}/);
  assert.match(routes, /path="stocktakes" element={<StocktakeApprovalPage \/>}/);
  assert.match(navigation, /\/warehouse\/stocktakes/);
  assert.match(navigation, /\/manager\/stocktakes/);
  assert.match(warehousePage, /line\.discrepancy/);
  assert.doesNotMatch(warehousePage, /actualQuantity\s*-\s*systemQuantity/);
  assert.doesNotMatch(`${warehousePage}${managerPage}`, /apiClient\.(post|patch|put|delete).*LO_HANG/i);
  assert.doesNotMatch(`${warehousePage}${managerPage}`, /workflowState:\s*['"]COMPLETED['"]/);
});
