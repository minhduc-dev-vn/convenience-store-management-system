'use strict';

const express = require('express');
const inventoryController = require('../controllers/inventory.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const { validateQuery } = require('../middleware/validation.middleware');
const { asyncHandler } = require('../utils/async-handler');

const router = express.Router();

const validateInventoryList = validateQuery({
  allowed: [
    'page', 'pageSize', 'search', 'categoryId', 'mode',
    'referenceDate', 'nearExpiryDays',
  ],
});
const validateLotList = validateQuery({
  allowed: [
    'page', 'pageSize', 'search', 'categoryId', 'productId',
    'expiryStatus', 'lotStatus', 'referenceDate', 'nearExpiryDays',
  ],
});
const validateProductLotList = validateQuery({
  allowed: [
    'page', 'pageSize', 'expiryStatus', 'lotStatus',
    'referenceDate', 'nearExpiryDays',
  ],
});

router.use(authenticate, authorize('WAREHOUSE', 'MANAGER'));

router.get('/products', validateInventoryList, asyncHandler(inventoryController.listProducts));
router.get('/lots', validateLotList, asyncHandler(inventoryController.listLots));
router.get(
  '/products/:productId/lots',
  validateProductLotList,
  asyncHandler(inventoryController.listProductLots),
);

module.exports = router;
