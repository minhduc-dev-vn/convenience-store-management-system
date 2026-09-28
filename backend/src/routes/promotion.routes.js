'use strict';

const express = require('express');
const promotionController = require('../controllers/promotion.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const { validateBody, validateQuery } = require('../middleware/validation.middleware');
const { asyncHandler } = require('../utils/async-handler');

const router = express.Router();

const validatePublicPromotionList = validateQuery({ allowed: ['productId'] });
const validateEvaluation = validateBody({ required: ['promotionId', 'items'] });

router.get('/', validatePublicPromotionList, asyncHandler(promotionController.listPublicPromotions));
router.post(
  '/evaluate',
  authenticate,
  authorize('CASHIER'),
  validateEvaluation,
  asyncHandler(promotionController.evaluatePromotion),
);
router.get('/:promotionId', asyncHandler(promotionController.getPublicPromotion));

module.exports = router;
