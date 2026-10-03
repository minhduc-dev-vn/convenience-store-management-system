'use strict';

const express = require('express');
const returnController = require('../controllers/return.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const { validateBody } = require('../middleware/validation.middleware');
const { asyncHandler } = require('../utils/async-handler');

const router = express.Router();
const validateReturnCreate = validateBody({
  required: ['invoiceId', 'reason', 'items'],
});

router.use(authenticate, authorize('CASHIER'));
router.post('/', validateReturnCreate, asyncHandler(returnController.createReturn));

module.exports = router;
