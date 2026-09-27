'use strict';

const express = require('express');
const customerController = require('../controllers/customer.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const { validateBody, validateQuery } = require('../middleware/validation.middleware');
const { asyncHandler } = require('../utils/async-handler');

const router = express.Router();
const validateProfileUpdate = validateBody({
  optional: ['fullName', 'email', 'address'],
  atLeastOne: ['fullName', 'email', 'address'],
});
const validateInvoiceListQuery = validateQuery({
  allowed: ['page', 'pageSize', 'from', 'to'],
});

router.use(authenticate, authorize('CUSTOMER'));
router.get('/me/loyalty', asyncHandler(customerController.getOwnLoyalty));
router.get(
  '/me/invoices',
  validateInvoiceListQuery,
  asyncHandler(customerController.listOwnInvoices),
);
router.get('/me/invoices/:invoiceId', asyncHandler(customerController.getOwnInvoiceDetail));
router.get('/me', asyncHandler(customerController.getOwnProfile));
router.patch('/me', validateProfileUpdate, asyncHandler(customerController.updateOwnProfile));

module.exports = router;
