'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { PromotionService } = require('../src/services/promotion.service');

const NOW = new Date('2026-09-28T10:00:00.000Z');
const transaction = { id: 'c18-transaction' };
const transactionRunner = async (work) => work(transaction);

function promotionRow(overrides = {}) {
  return {
    MaKM: 'C18PROMO01',
    TenKM: 'C18 Promotion',
    LoaiKM: 'PERCENT',
    GiaTri: 20,
    GiaTriDonToiThieu: 0,
    MucGiamToiDa: 3000,
    NgayBatDau: new Date('2026-09-27T00:00:00.000Z'),
    NgayKetThuc: new Date('2026-09-30T00:00:00.000Z'),
    TrangThai: 'ACTIVE',
    ...overrides,
  };
}

function productRow(productId, overrides = {}) {
  return {
    MaSP: productId,
    TenSP: `Product ${productId}`,
    GiaBan: 20000,
    TrangThai: 'ACTIVE',
    TrangThaiLoai: 'ACTIVE',
    ...overrides,
  };
}

test('public promotion read uses server time and groups only safe product fields', async () => {
  let received;
  const service = new PromotionService({
    clock: () => NOW,
    promotionRepository: {
      async listPublicPromotions(filters) {
        received = filters;
        return [
          { ...promotionRow(), ...productRow('SP01') },
          { ...promotionRow(), ...productRow('SP02') },
        ];
      },
    },
  });

  const result = await service.listPublicPromotions({ productId: 'SP01' });

  assert.equal(received.asOf, NOW);
  assert.equal(received.productId, 'SP01');
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].products, [
    { name: 'Product SP01', productId: 'SP01' },
    { name: 'Product SP02', productId: 'SP02' },
  ]);
  assert.equal(Object.hasOwn(result[0], 'status'), false);
  assert.equal(Object.hasOwn(result[0].products[0], 'status'), false);
});

test('promotion create writes header and product links in one transaction', async () => {
  const calls = [];
  const repository = {
    async findPromotionById(_promotionId, options) {
      calls.push(['find', options?.transaction]);
      if (options?.forUpdate) return null;
      return {
        promotion: promotionRow(),
        products: [productRow('SP01')],
      };
    },
    async findProductsByIds(productIds, receivedTransaction) {
      calls.push(['products', productIds, receivedTransaction]);
      return productIds.map((productId) => productRow(productId));
    },
    async createPromotion(promotion, receivedTransaction) {
      calls.push(['create', promotion, receivedTransaction]);
    },
    async replacePromotionProducts(promotionId, productIds, receivedTransaction) {
      calls.push(['links', promotionId, productIds, receivedTransaction]);
    },
  };
  const service = new PromotionService({ promotionRepository: repository, transactionRunner });

  const result = await service.createPromotion({
    promotionId: 'C18PROMO01',
    name: 'C18 Promotion',
    type: 'PERCENT',
    value: 20,
    minimumOrderValue: 0,
    maximumDiscount: 3000,
    startAt: '2026-09-27T00:00:00.000Z',
    endAt: '2026-09-30T00:00:00.000Z',
    productIds: ['SP01'],
  });

  assert.equal(result.promotionId, 'C18PROMO01');
  assert.deepEqual(calls.map((call) => call[0]), ['find', 'products', 'create', 'links', 'find']);
  assert.equal(calls[1][2], transaction);
  assert.equal(calls[2][2], transaction);
  assert.equal(calls[3][3], transaction);
});

test('promotion input rejects unsupported global scope and invalid discount rules', async () => {
  const service = new PromotionService({ promotionRepository: {} });
  const baseline = {
    promotionId: 'C18PROMO01', name: 'C18 Promotion', type: 'PERCENT', value: 10,
    startAt: '2026-09-27T00:00:00Z', endAt: '2026-09-30T00:00:00Z',
  };

  await assert.rejects(
    service.createPromotion({ ...baseline, productIds: [] }),
    (error) => error.code === 'VALIDATION_ERROR',
  );
  await assert.rejects(
    service.createPromotion({ ...baseline, value: 101, productIds: ['SP01'] }),
    (error) => error.code === 'VALIDATION_ERROR',
  );
  await assert.rejects(
    service.createPromotion({
      ...baseline, type: 'AMOUNT', value: 1000, maximumDiscount: 500,
      productIds: ['SP01'],
    }),
    (error) => error.code === 'VALIDATION_ERROR',
  );
  await assert.rejects(
    service.createPromotion({
      ...baseline, startAt: '2026-09-30T00:00:00Z', endAt: '2026-09-27T00:00:00Z',
      productIds: ['SP01'],
    }),
    (error) => error.code === 'VALIDATION_ERROR',
  );
  await assert.rejects(
    service.createPromotion({
      ...baseline, startAt: '2026-09-27', productIds: ['SP01'],
    }),
    (error) => error.code === 'VALIDATION_ERROR',
  );
});

test('percent evaluation uses authoritative prices, product scope and maximum discount', async () => {
  const service = new PromotionService({
    clock: () => NOW,
    promotionRepository: {
      async findPromotionById() {
        return { promotion: promotionRow(), products: [productRow('SP01')] };
      },
      async findProductsByIds() {
        return [productRow('SP01'), productRow('SP02', { GiaBan: 10000 })];
      },
    },
  });

  const result = await service.evaluatePromotion({
    promotionId: 'C18PROMO01',
    items: [{ productId: 'SP01', quantity: 1 }, { productId: 'SP02', quantity: 1 }],
  });

  assert.equal(result.eligible, true);
  assert.equal(result.orderSubtotal, 30000);
  assert.equal(result.eligibleSubtotal, 20000);
  assert.equal(result.discountAmount, 3000);
  assert.deepEqual(result.qualifyingItems.map((item) => item.productId), ['SP01']);
  assert.equal(result.qualifyingItems[0].unitPrice, 20000);
});

test('expired, minimum-order and wrong-product promotions never apply', async () => {
  let activePromotion = promotionRow({ GiaTriDonToiThieu: 50000 });
  let mappedProducts = [productRow('SP01')];
  const service = new PromotionService({
    clock: () => NOW,
    promotionRepository: {
      async findPromotionById() {
        return { promotion: activePromotion, products: mappedProducts };
      },
      async findProductsByIds() { return [productRow('SP02', { GiaBan: 10000 })]; },
    },
  });
  const input = { promotionId: 'C18PROMO01', items: [{ productId: 'SP02', quantity: 1 }] };

  let result = await service.evaluatePromotion(input);
  assert.equal(result.reason, 'MINIMUM_ORDER_NOT_MET');
  assert.equal(result.discountAmount, 0);

  activePromotion = promotionRow();
  result = await service.evaluatePromotion(input);
  assert.equal(result.reason, 'NO_ELIGIBLE_PRODUCT');
  assert.equal(result.discountAmount, 0);

  activePromotion = promotionRow({ NgayKetThuc: new Date('2026-09-28T10:00:00.000Z') });
  mappedProducts = [productRow('SP02')];
  result = await service.evaluatePromotion(input);
  assert.equal(result.reason, 'PROMOTION_EXPIRED');
  assert.equal(result.discountAmount, 0);
});

test('fixed amount discount cannot exceed qualifying subtotal', async () => {
  const service = new PromotionService({
    clock: () => NOW,
    promotionRepository: {
      async findPromotionById() {
        return {
          promotion: promotionRow({ LoaiKM: 'AMOUNT', GiaTri: 50000, MucGiamToiDa: null }),
          products: [productRow('SP01')],
        };
      },
      async findProductsByIds() { return [productRow('SP01')]; },
    },
  });

  const result = await service.evaluatePromotion({
    promotionId: 'C18PROMO01', items: [{ productId: 'SP01', quantity: 1 }],
  });
  assert.equal(result.discountAmount, 20000);
  assert.equal(result.eligible, true);
});

test('evaluation rejects client price, discount and duplicate product claims', async () => {
  const service = new PromotionService({ promotionRepository: {} });
  await assert.rejects(
    service.evaluatePromotion({
      promotionId: 'C18PROMO01',
      items: [{ productId: 'SP01', quantity: 1, unitPrice: 1 }],
    }),
    (error) => error.code === 'VALIDATION_ERROR',
  );
  await assert.rejects(
    service.evaluatePromotion({
      promotionId: 'C18PROMO01',
      items: [{ productId: 'SP01', quantity: 1 }, { productId: 'SP01', quantity: 2 }],
    }),
    (error) => error.code === 'VALIDATION_ERROR',
  );
});
