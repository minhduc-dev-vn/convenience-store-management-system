'use strict';

const express = require('express');
const posController = require('../controllers/pos.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const { validateBody, validateQuery } = require('../middleware/validation.middleware');
const { asyncHandler } = require('../utils/async-handler');

const router = express.Router();

const validateOpenShift = validateBody({
  required: ['openingCash'],
  optional: ['note'],
});
const validateProductSearch = validateQuery({
  allowed: ['page', 'pageSize', 'search'],
});
const validateQuote = validateBody({
  required: ['items'],
  optional: ['customerPhone', 'promotionId'],
});
const validateCheckout = validateBody({
  required: ['invoiceId', 'items', 'payment'],
  optional: ['customerPhone', 'note', 'promotionId'],
});

router.use(authenticate, authorize('CASHIER'));

router.get('/shifts/current', asyncHandler(posController.getCurrentShift));
router.post('/shifts/open', validateOpenShift, asyncHandler(posController.openShift));
router.post('/quotes', validateQuote, asyncHandler(posController.calculateQuote));
router.post('/checkouts', validateCheckout, asyncHandler(posController.checkout));
router.get('/invoices/:invoiceId', asyncHandler(posController.getReceipt));
router.get('/products', validateProductSearch, asyncHandler(posController.searchProducts));
router.get('/products/barcode/:barcode', asyncHandler(posController.getProductByBarcode));

module.exports = router;
