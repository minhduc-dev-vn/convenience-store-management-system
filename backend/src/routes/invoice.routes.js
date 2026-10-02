'use strict';

const express = require('express');
const invoiceController = require('../controllers/invoice.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const { validateQuery } = require('../middleware/validation.middleware');
const { asyncHandler } = require('../utils/async-handler');

const router = express.Router();

const validateInvoiceSearch = validateQuery({
  allowed: ['page', 'pageSize', 'invoiceId', 'from', 'to', 'cashierId'],
});

router.use(authenticate, authorize('CASHIER', 'MANAGER'));

router.get('/', validateInvoiceSearch, asyncHandler(invoiceController.listInvoices));
router.get('/:invoiceId', asyncHandler(invoiceController.getInvoice));

module.exports = router;
