'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  PosService,
  allocatePromotionDiscount,
  mapCheckoutError,
  mapPosError,
  normalizeCheckoutInput,
  normalizeMoney,
  normalizeProductQuery,
  normalizeQuoteInput,
} = require('../src/services/pos.service');

const cashierIdentity = {
  displayName: 'C29 Cashier',
  employeeId: 'C29CASH',
  role: 'CASHIER',
};

function shiftRow(overrides = {}) {
  return {
    MaCa: 29,
    MaNV: 'C29CASH',
    TenNhanVien: 'C29 Cashier',
    GioBatDau: new Date('2026-09-29T08:00:00.000Z'),
    TienDauCa: 500000,
    TrangThai: 'OPEN',
    GhiChu: 'Ca sang',
    ...overrides,
  };
}

function productRow(overrides = {}) {
  return {
    MaSP: 'C29P001',
    TenSP: 'C29 Alpha',
    MaVach: 'C2900001',
    DonViTinh: 'Chai',
    GiaBan: 20000,
    MaLoai: 'C29CAT',
    TenLoai: 'C29 Category',
    TonKhaDung: 8,
    ...overrides,
  };
}

function quoteProductRow(productId, overrides = {}) {
  return {
    MaSP: productId,
    TenSP: `${productId} name`,
    MaVach: `${productId}-BAR`,
    DonViTinh: 'Cai',
    GiaBan: productId === 'C30P001' ? 10000 : 20000,
    TrangThaiSanPham: 'ACTIVE',
    MaLoai: 'C30CAT',
    TenLoai: 'C30 Category',
    TrangThaiLoai: 'ACTIVE',
    TonKhaDung: 10,
    ...overrides,
  };
}

function paidReceiptResult(overrides = {}) {
  return {
    customer: null,
    header: {
      MaHD: 'C31INV001',
      NgayLap: new Date('2026-09-29T09:00:00.000Z'),
      MaCa: 29,
      MaNV: 'C29CASH',
      TenNhanVien: 'C29 Cashier',
      MaKH: null,
      TenKhachHang: null,
      TongTienHang: 10000,
      TongGiamGia: 0,
      TongThanhToan: 10000,
      DiemSuDung: 0,
      DiemTichLuy: 0,
      TrangThai: 'PAID',
      GhiChu: null,
      ...overrides.header,
    },
    items: [{
      MaCTHD: 31,
      MaSP: 'C30P001',
      TenSP: 'C30P001 name',
      MaVach: 'C30P001-BAR',
      DonViTinh: 'Cai',
      SoLuong: 1,
      DonGiaBan: 10000,
      TienGiam: 0,
      ThanhTien: 10000,
      MaKM: null,
      TenKM: null,
      ...(overrides.items?.[0] ?? {}),
    }],
    payments: [{
      MaThanhToan: 31,
      PhuongThuc: 'CASH',
      SoTien: 10000,
      ThoiGian: new Date('2026-09-29T09:00:00.000Z'),
      MaGiaoDichNgoai: null,
      TrangThaiThanhToan: 'SUCCESS',
      ...(overrides.payments?.[0] ?? {}),
    }],
  };
}

test('current shift is derived from the authenticated cashier and may be null', async () => {
  const employeeIds = [];
  let row = null;
  const service = new PosService({
    posRepository: {
      async findCurrentOpenShift(employeeId) {
        employeeIds.push(employeeId);
        return row;
      },
    },
  });

  assert.deepEqual(await service.getCurrentShift(cashierIdentity), { shift: null });
  row = shiftRow();
  const result = await service.getCurrentShift(cashierIdentity);

  assert.deepEqual(employeeIds, ['C29CASH', 'C29CASH']);
  assert.deepEqual(result.shift, {
    employee: { employeeId: 'C29CASH', name: 'C29 Cashier' },
    note: 'Ca sang',
    openingCash: 500000,
    shiftId: '29',
    startedAt: '2026-09-29T08:00:00.000Z',
    status: 'OPEN',
  });
});

test('opening a shift binds the JWT employee and normalizes client input', async () => {
  let received;
  const service = new PosService({
    posRepository: {
      async openShift(input) {
        received = input;
        return shiftRow({ TenNhanVien: undefined });
      },
    },
  });

  const result = await service.openShift(cashierIdentity, {
    employeeId: 'SPOOFED',
    note: '  Ca sang  ',
    openingCash: 125000.5,
  });

  assert.deepEqual(received, {
    employeeId: 'C29CASH',
    note: 'Ca sang',
    openingCash: 125000.5,
  });
  assert.equal(result.shift.employee.employeeId, 'C29CASH');
  assert.equal(result.shift.employee.name, 'C29 Cashier');
});

test('product search requires an OPEN shift and returns sellable stock snapshots', async () => {
  let hasOpenShift = false;
  let received;
  const service = new PosService({
    posRepository: {
      async findCurrentOpenShift(employeeId) {
        assert.equal(employeeId, 'C29CASH');
        return hasOpenShift ? shiftRow() : null;
      },
      async searchSellableProducts(filters) {
        received = filters;
        return { items: [productRow()], totalItems: 21 };
      },
    },
  });

  await assert.rejects(
    service.searchProducts(cashierIdentity, { search: 'C29' }),
    (error) => error.code === 'SHIFT_REQUIRED' && error.statusCode === 409,
  );

  hasOpenShift = true;
  const result = await service.searchProducts(cashierIdentity, {
    page: '2', pageSize: '10', search: ' C29%_~[ ',
  });

  assert.deepEqual(received, {
    page: 2,
    pageSize: 10,
    search: 'C29%_~[',
    searchPattern: 'C29~%~_~~~[%',
  });
  assert.deepEqual(result.pagination, {
    page: 2, pageSize: 10, totalItems: 21, totalPages: 3,
  });
  assert.deepEqual(result.items[0], {
    availableStock: 8,
    barcode: 'C2900001',
    category: { categoryId: 'C29CAT', name: 'C29 Category' },
    name: 'C29 Alpha',
    price: 20000,
    productId: 'C29P001',
    unit: 'Chai',
  });
});

test('barcode lookup requires an OPEN shift and rejects a non-sellable product', async () => {
  let product = productRow();
  const service = new PosService({
    posRepository: {
      async findCurrentOpenShift() {
        return shiftRow();
      },
      async findSellableProductByBarcode(barcode) {
        assert.equal(barcode, 'C2900001');
        return product;
      },
    },
  });

  let result = await service.getProductByBarcode(cashierIdentity, ' C2900001 ');
  assert.equal(result.product.productId, 'C29P001');

  product = null;
  await assert.rejects(
    service.getProductByBarcode(cashierIdentity, 'C2900001'),
    (error) => error.code === 'PRODUCT_NOT_SELLABLE' && error.statusCode === 404,
  );
});

test('POS service rejects identities outside the CASHIER boundary', async () => {
  const service = new PosService({ posRepository: {} });
  for (const identity of [
    { role: 'CUSTOMER', customerId: 'C29CUST' },
    { role: 'WAREHOUSE', employeeId: 'C29WARE' },
    { role: 'MANAGER', employeeId: 'C29MGR' },
    { role: 'CASHIER' },
  ]) {
    await assert.rejects(
      service.getCurrentShift(identity),
      (error) => error.code === 'FORBIDDEN' && error.statusCode === 403,
    );
  }
});

test('POS validation rejects unsafe shift money and invalid pagination', () => {
  for (const value of [-1, Number.NaN, Number.POSITIVE_INFINITY, '1000', 1.001]) {
    assert.throws(
      () => normalizeMoney(value, 'openingCash'),
      (error) => error.code === 'VALIDATION_ERROR',
    );
  }
  assert.throws(
    () => normalizeProductQuery({ page: '0' }),
    (error) => error.code === 'VALIDATION_ERROR',
  );
  assert.throws(
    () => normalizeProductQuery({ pageSize: '101' }),
    (error) => error.code === 'VALIDATION_ERROR',
  );
  assert.throws(
    () => normalizeProductQuery({ search: 'x'.repeat(151) }),
    (error) => error.code === 'VALIDATION_ERROR',
  );
});

test('shift procedure errors map to stable API errors', () => {
  let error = mapPosError({ number: 51504 });
  assert.equal(error.code, 'SHIFT_ALREADY_OPEN');
  assert.equal(error.statusCode, 409);

  error = mapPosError({ number: 51503 });
  assert.equal(error.code, 'CASHIER_UNAVAILABLE');
  assert.equal(error.statusCode, 403);

  error = mapPosError({ number: 51502 });
  assert.equal(error.code, 'VALIDATION_ERROR');
  assert.equal(error.statusCode, 400);
});

test('POS quote uses server prices, validates membership and allocates promotion cents like C28', async () => {
  let evaluationInput;
  const service = new PosService({
    posRepository: {
      async findCurrentOpenShift(employeeId) {
        assert.equal(employeeId, 'C29CASH');
        return shiftRow();
      },
      async findQuoteProducts(productIds) {
        assert.deepEqual(productIds, ['C30P001', 'C30P002']);
        return [quoteProductRow('C30P001'), quoteProductRow('C30P002')];
      },
      async findActiveCustomerByPhone(phone) {
        assert.equal(phone, '0833000001');
        return {
          MaKH: 'C30CUST',
          HoTen: 'C30 Member',
          SDT: phone,
          DiemTichLuy: 25,
          HangThanhVien: 'SILVER',
        };
      },
    },
    promotionService: {
      async evaluatePromotion(input) {
        evaluationInput = input;
        return {
          discountAmount: 10000,
          eligible: true,
          eligibleSubtotal: 30000,
          evaluatedAt: '2026-09-29T08:00:00.000Z',
          maximumDiscount: null,
          minimumOrderValue: 0,
          name: 'C30 discount',
          orderSubtotal: 30000,
          promotionId: 'C30PROMO',
          qualifyingItems: [
            { productId: 'C30P001' },
            { productId: 'C30P002' },
          ],
          reason: null,
          type: 'AMOUNT',
          value: 10000,
        };
      },
    },
  });

  const quote = await service.calculateQuote(cashierIdentity, {
    customerPhone: '0833000001',
    items: [
      { productId: 'C30P001', quantity: 1 },
      { productId: 'C30P002', quantity: 1 },
    ],
    promotionId: 'C30PROMO',
  });

  assert.deepEqual(evaluationInput, {
    items: [
      { productId: 'C30P001', quantity: 1 },
      { productId: 'C30P002', quantity: 1 },
    ],
    promotionId: 'C30PROMO',
  });
  assert.deepEqual(quote.customer, {
    customerId: 'C30CUST', name: 'C30 Member', phone: '0833000001',
  });
  assert.deepEqual(quote.loyalty, {
    currentPoints: 25, membershipTier: 'SILVER', pointsEarnedPreview: 2,
  });
  assert.equal(quote.items[0].unitPrice, 10000);
  assert.equal(quote.items[0].discountAmount, 3333.33);
  assert.equal(quote.items[0].lineTotal, 6666.67);
  assert.equal(quote.items[1].discountAmount, 6666.67);
  assert.equal(quote.items[1].lineTotal, 13333.33);
  assert.deepEqual(quote.totals, {
    promotionDiscount: 10000,
    subtotal: 30000,
    totalAmount: 20000,
    totalDiscount: 10000,
  });
  assert.equal(quote.promotion.eligible, true);
  assert.equal(quote.shift.shiftId, '29');
});

test('POS quote leaves totals unchanged when the requested promotion is ineligible', async () => {
  const service = new PosService({
    posRepository: {
      async findCurrentOpenShift() { return shiftRow(); },
      async findQuoteProducts() { return [quoteProductRow('C30P001')]; },
    },
    promotionService: {
      async evaluatePromotion() {
        return {
          discountAmount: 0,
          eligible: false,
          eligibleSubtotal: 10000,
          evaluatedAt: '2026-09-29T08:00:00.000Z',
          maximumDiscount: 5000,
          minimumOrderValue: 50000,
          name: 'C30 minimum',
          orderSubtotal: 10000,
          promotionId: 'C30MINIMUM',
          qualifyingItems: [{ productId: 'C30P001' }],
          reason: 'MINIMUM_ORDER_NOT_MET',
          type: 'PERCENT',
          value: 10,
        };
      },
    },
  });

  const quote = await service.calculateQuote(cashierIdentity, {
    items: [{ productId: 'C30P001', quantity: 1 }],
    promotionId: 'C30MINIMUM',
  });

  assert.equal(quote.customer, null);
  assert.equal(quote.loyalty, null);
  assert.equal(quote.items[0].discountAmount, 0);
  assert.equal(quote.items[0].lineTotal, 10000);
  assert.equal(quote.promotion.eligible, false);
  assert.equal(quote.promotion.reason, 'MINIMUM_ORDER_NOT_MET');
  assert.equal(quote.totals.totalAmount, 10000);
});

test('POS quote enforces OPEN shift, active products, sellable stock and active member', async () => {
  let shift = null;
  let rows = [quoteProductRow('C30P001')];
  let customer = null;
  const service = new PosService({
    posRepository: {
      async findCurrentOpenShift() { return shift; },
      async findQuoteProducts() { return rows; },
      async findActiveCustomerByPhone() { return customer; },
    },
    promotionService: {},
  });
  const input = { items: [{ productId: 'C30P001', quantity: 1 }] };

  await assert.rejects(
    service.calculateQuote(cashierIdentity, input),
    (error) => error.code === 'SHIFT_REQUIRED',
  );
  shift = shiftRow();

  rows = [];
  await assert.rejects(
    service.calculateQuote(cashierIdentity, input),
    (error) => error.code === 'PRODUCT_NOT_FOUND',
  );

  rows = [quoteProductRow('C30P001', { TrangThaiSanPham: 'INACTIVE' })];
  await assert.rejects(
    service.calculateQuote(cashierIdentity, input),
    (error) => error.code === 'PRODUCT_NOT_AVAILABLE',
  );

  rows = [quoteProductRow('C30P001', { TonKhaDung: 0 })];
  await assert.rejects(
    service.calculateQuote(cashierIdentity, input),
    (error) => error.code === 'INSUFFICIENT_STOCK',
  );

  rows = [quoteProductRow('C30P001')];
  await assert.rejects(
    service.calculateQuote(cashierIdentity, { ...input, customerPhone: '0833000001' }),
    (error) => error.code === 'CUSTOMER_MEMBER_NOT_FOUND',
  );
});

test('quote validation rejects client price, discount, totals, customer id and point redemption', () => {
  const base = { items: [{ productId: 'C30P001', quantity: 1 }] };
  for (const field of ['price', 'discount', 'subtotal', 'total', 'customerId', 'pointsToRedeem']) {
    assert.throws(
      () => normalizeQuoteInput({ ...base, [field]: 1 }),
      (error) => error.code === 'VALIDATION_ERROR',
    );
  }
  for (const field of ['price', 'discountAmount', 'lineTotal']) {
    assert.throws(
      () => normalizeQuoteInput({
        items: [{ productId: 'C30P001', quantity: 1, [field]: 1 }],
      }),
      (error) => error.code === 'VALIDATION_ERROR',
    );
  }
  assert.throws(
    () => normalizeQuoteInput({
      items: [
        { productId: 'C30P001', quantity: 1 },
        { productId: 'C30P001', quantity: 2 },
      ],
    }),
    (error) => error.code === 'VALIDATION_ERROR',
  );
});

test('quote rejects a promotion calculation based on a different price snapshot', () => {
  const pricedItems = [{ productId: 'C30P001', lineSubtotalCents: 1000000 }];
  assert.throws(
    () => allocatePromotionDiscount(pricedItems, {
      discountAmount: 1000,
      eligible: true,
      eligibleSubtotal: 11000,
      orderSubtotal: 11000,
      qualifyingItems: [{ productId: 'C30P001' }],
    }, 1000000),
    (error) => error.code === 'QUOTE_CHANGED_RETRY' && error.statusCode === 409,
  );
});

test('checkout validates a fresh quote, delegates finalization and returns persisted receipt data', async () => {
  let persisted = null;
  let finalized;
  const service = new PosService({
    posRepository: {
      async findPaidReceipt() { return persisted; },
      async findCurrentOpenShift() { return shiftRow(); },
      async findQuoteProducts() { return [quoteProductRow('C30P001')]; },
      async finalizeCheckout(input) {
        finalized = input;
        persisted = paidReceiptResult();
      },
    },
    promotionService: {},
  });

  const result = await service.checkout(cashierIdentity, {
    invoiceId: 'C31INV001',
    items: [{ productId: 'C30P001', quantity: 1 }],
    payment: { amount: 10000, method: 'cash' },
  });

  assert.equal(result.idempotentReplay, false);
  assert.equal(result.receipt.invoiceId, 'C31INV001');
  assert.equal(result.receipt.status, 'PAID');
  assert.equal(result.receipt.items[0].lineTotal, 10000);
  assert.equal(result.receipt.payment.status, 'SUCCESS');
  assert.deepEqual(finalized, {
    customerId: null,
    externalTransactionId: null,
    invoiceId: 'C31INV001',
    items: [{ productId: 'C30P001', quantity: 1 }],
    note: null,
    paymentAmount: 10000,
    paymentMethod: 'CASH',
    promotionId: null,
    shiftId: '29',
  });
});

test('checkout replays an identical persisted invoice and rejects invoice id reuse', async () => {
  let finalizeCalls = 0;
  const service = new PosService({
    posRepository: {
      async findPaidReceipt() { return paidReceiptResult(); },
      async finalizeCheckout() { finalizeCalls += 1; },
    },
  });
  const input = {
    invoiceId: 'C31INV001',
    items: [{ productId: 'C30P001', quantity: 1 }],
    payment: { amount: 10000, method: 'CASH' },
  };

  const replay = await service.checkout(cashierIdentity, input);
  assert.equal(replay.idempotentReplay, true);
  assert.equal(replay.receipt.invoiceId, 'C31INV001');
  assert.equal(finalizeCalls, 0);

  await assert.rejects(
    service.checkout(cashierIdentity, {
      ...input,
      items: [{ productId: 'C30P001', quantity: 2 }],
    }),
    (error) => error.code === 'CHECKOUT_ID_CONFLICT' && error.statusCode === 409,
  );
});

test('checkout validation blocks point redemption, tampered fields and invalid payments', () => {
  const base = {
    invoiceId: 'C31INV001',
    items: [{ productId: 'C30P001', quantity: 1 }],
    payment: { amount: 10000, method: 'CASH' },
  };
  for (const input of [
    { ...base, pointsToRedeem: 1 },
    { ...base, total: 1 },
    { ...base, payment: { ...base.payment, status: 'SUCCESS' } },
    { ...base, payment: { amount: 0, method: 'CASH' } },
    { ...base, payment: { amount: 10000, method: 'CRYPTO' } },
  ]) {
    assert.throws(
      () => normalizeCheckoutInput(input),
      (error) => error.code === 'VALIDATION_ERROR',
    );
  }
});

test('checkout maps FEFO transaction errors without returning raw SQL messages', () => {
  const stockError = mapCheckoutError({ number: 51526, message: 'raw database detail' });
  assert.equal(stockError.code, 'INSUFFICIENT_STOCK');
  assert.equal(stockError.statusCode, 409);
  assert.doesNotMatch(stockError.message, /raw database detail/);

  const changedError = mapCheckoutError({ number: 51527, message: 'raw database detail' });
  assert.equal(changedError.code, 'INVENTORY_CHANGED_RETRY');
  assert.equal(changedError.statusCode, 409);
});
