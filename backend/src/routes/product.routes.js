'use strict';

const express = require('express');
const productController = require('../controllers/product.controller');
const { validateQuery } = require('../middleware/validation.middleware');
const { asyncHandler } = require('../utils/async-handler');

const router = express.Router();

const validatePublicProductList = validateQuery({
  allowed: ['page', 'pageSize', 'search', 'categoryId'],
});

router.get('/categories', asyncHandler(productController.listPublicCategories));
router.get('/', validatePublicProductList, asyncHandler(productController.listPublicProducts));
router.get('/:productId', asyncHandler(productController.getPublicProduct));

module.exports = router;
