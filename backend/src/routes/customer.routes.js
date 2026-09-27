'use strict';

const express = require('express');
const customerController = require('../controllers/customer.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const { validateBody } = require('../middleware/validation.middleware');
const { asyncHandler } = require('../utils/async-handler');

const router = express.Router();
const validateProfileUpdate = validateBody({
  optional: ['fullName', 'email', 'address'],
  atLeastOne: ['fullName', 'email', 'address'],
});

router.use(authenticate, authorize('CUSTOMER'));
router.get('/me', asyncHandler(customerController.getOwnProfile));
router.patch('/me', validateProfileUpdate, asyncHandler(customerController.updateOwnProfile));

module.exports = router;
