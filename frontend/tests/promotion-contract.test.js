import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildPromotionPayload,
  promotionToForm,
  validatePromotionForm,
} from '../src/pages/manager/promotionForms.js';
import {
  buildAdminPromotionDetailPath,
  buildAdminPromotionListPath,
  buildAdminPromotionStatusPath,
  buildPublicPromotionDetailPath,
  buildPublicPromotionListPath,
} from '../src/services/promotionQuery.js';

const validForm = Object.freeze({
  promotionId: ' KM01 ',
  name: ' Ưu đãi cuối tuần ',
  type: 'PERCENT',
  value: '15',
  minimumOrderValue: '100000',
  maximumDiscount: '30000',
  startAt: '2026-10-01T08:00',
  endAt: '2026-10-31T22:00',
  status: 'ACTIVE',
  productIds: ['SP01', 'SP02'],
});

test('promotion paths include only fields accepted by C18 routes', () => {
  assert.equal(
    buildPublicPromotionListPath({ productId: 'SP/01', status: 'ACTIVE' }),
    '/promotions?productId=SP%2F01',
  );
  assert.equal(buildPublicPromotionDetailPath('KM/01'), '/promotions/KM%2F01');
  assert.equal(
    buildAdminPromotionListPath({ page: 2, pageSize: 10, search: 'Cuối tuần', type: 'PERCENT', status: 'ACTIVE', productId: 'ignored' }),
    '/admin/promotions?page=2&pageSize=10&search=Cu%E1%BB%91i+tu%E1%BA%A7n&status=ACTIVE&type=PERCENT',
  );
  assert.equal(buildAdminPromotionDetailPath('KM/01'), '/admin/promotions/KM%2F01');
  assert.equal(buildAdminPromotionStatusPath('KM/01'), '/admin/promotions/KM%2F01/status');
});

test('promotion create payload matches the C18 contract and converts local date-time to ISO', () => {
  assert.deepEqual(validatePromotionForm(validForm), {});
  const payload = buildPromotionPayload(validForm);
  assert.deepEqual({ ...payload, startAt: undefined, endAt: undefined }, {
    promotionId: 'KM01',
    name: 'Ưu đãi cuối tuần',
    type: 'PERCENT',
    value: 15,
    minimumOrderValue: 100000,
    maximumDiscount: 30000,
    startAt: undefined,
    endAt: undefined,
    status: 'ACTIVE',
    productIds: ['SP01', 'SP02'],
  });
  assert.equal(new Date(payload.startAt).getTime(), new Date(validForm.startAt).getTime());
  assert.equal(new Date(payload.endAt).getTime(), new Date(validForm.endAt).getTime());
  assert.match(payload.startAt, /Z$/);
});

test('promotion edit excludes immutable id and status', () => {
  const payload = buildPromotionPayload(validForm, { editing: true });
  assert.equal(Object.hasOwn(payload, 'promotionId'), false);
  assert.equal(Object.hasOwn(payload, 'status'), false);
  assert.deepEqual(payload.productIds, ['SP01', 'SP02']);
});

test('fixed amount promotions never send a maximum discount', () => {
  const form = { ...validForm, type: 'AMOUNT', value: '25000', maximumDiscount: '99999' };
  assert.deepEqual(validatePromotionForm(form), {});
  assert.equal(buildPromotionPayload(form).maximumDiscount, null);
});

test('promotion form rejects invalid value, dates and missing product scope', () => {
  const errors = validatePromotionForm({
    ...validForm,
    value: '101',
    minimumOrderValue: '-1',
    maximumDiscount: '0',
    startAt: '2026-10-10T10:00',
    endAt: '2026-10-10T09:00',
    productIds: [],
  });
  assert.ok(errors.value);
  assert.ok(errors.minimumOrderValue);
  assert.ok(errors.maximumDiscount);
  assert.ok(errors.endAt);
  assert.ok(errors.productIds);
});

test('manager edit form is hydrated from the exact promotion detail response', () => {
  const form = promotionToForm({
    promotionId: 'KM01',
    name: 'Ưu đãi',
    type: 'PERCENT',
    value: 10,
    minimumOrderValue: 0,
    maximumDiscount: null,
    startAt: '2026-10-01T01:00:00.000Z',
    endAt: '2026-10-02T01:00:00.000Z',
    status: 'INACTIVE',
    products: [{ productId: 'SP01', name: 'Sản phẩm 1', status: 'ACTIVE' }],
  });
  assert.equal(form.promotionId, 'KM01');
  assert.equal(form.status, 'INACTIVE');
  assert.equal(form.maximumDiscount, '');
  assert.deepEqual(form.productIds, ['SP01']);
});
