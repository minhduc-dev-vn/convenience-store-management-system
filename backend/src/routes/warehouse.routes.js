'use strict';

const express = require('express');
const receivingController = require('../controllers/receiving.controller');
const stocktakeController = require('../controllers/stocktake.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const { validateBody, validateQuery } = require('../middleware/validation.middleware');
const { asyncHandler } = require('../utils/async-handler');

const router = express.Router();

const validateLookupList = validateQuery({ allowed: ['page', 'pageSize', 'search'] });
const validateReceiptList = validateQuery({
  allowed: ['page', 'pageSize', 'search', 'status'],
});
const validateReceiptCreate = validateBody({
  required: ['supplierId'],
  optional: ['receivedAt', 'note'],
});
const receiptUpdateFields = ['supplierId', 'receivedAt', 'note'];
const validateReceiptUpdate = validateBody({
  optional: receiptUpdateFields,
  atLeastOne: receiptUpdateFields,
});
const validateLineCreate = validateBody({
  required: ['productId', 'manufacturerLot', 'quantity', 'unitCost'],
  optional: ['manufactureDate', 'expiryDate'],
});
const lineUpdateFields = [
  'productId', 'manufacturerLot', 'manufactureDate', 'expiryDate', 'quantity', 'unitCost',
];
const validateLineUpdate = validateBody({
  optional: lineUpdateFields,
  atLeastOne: lineUpdateFields,
});
const validateStocktakeList = validateQuery({
  allowed: ['page', 'pageSize', 'search', 'status', 'workflowState'],
});
const validateStocktakeCreate = validateBody({ optional: ['note'] });
const validateStocktakeCount = validateBody({
  required: ['actualQuantity'],
  optional: ['reason'],
});
const validateStocktakeProposal = validateBody({ optional: ['comment'] });

router.use(authenticate, authorize('WAREHOUSE'));

router.get(
  '/receiving/suppliers',
  validateLookupList,
  asyncHandler(receivingController.listSupplierOptions),
);
router.get(
  '/receiving/products',
  validateLookupList,
  asyncHandler(receivingController.listProductOptions),
);
router.get(
  '/receiving/receipts',
  validateReceiptList,
  asyncHandler(receivingController.listReceipts),
);
router.post(
  '/receiving/receipts',
  validateReceiptCreate,
  asyncHandler(receivingController.createDraft),
);
router.get(
  '/receiving/receipts/:receiptId',
  asyncHandler(receivingController.getReceipt),
);
router.patch(
  '/receiving/receipts/:receiptId',
  validateReceiptUpdate,
  asyncHandler(receivingController.updateDraft),
);
router.post(
  '/receiving/receipts/:receiptId/lines',
  validateLineCreate,
  asyncHandler(receivingController.addLine),
);
router.patch(
  '/receiving/receipts/:receiptId/lines/:detailId',
  validateLineUpdate,
  asyncHandler(receivingController.updateLine),
);
router.delete(
  '/receiving/receipts/:receiptId/lines/:detailId',
  asyncHandler(receivingController.deleteLine),
);
router.post(
  '/receiving/receipts/:receiptId/cancel',
  asyncHandler(receivingController.cancelReceipt),
);
router.post(
  '/receiving/receipts/:receiptId/confirm',
  asyncHandler(receivingController.confirmReceipt),
);

router.get(
  '/stocktakes',
  validateStocktakeList,
  asyncHandler(stocktakeController.listWarehouseStocktakes),
);
router.post(
  '/stocktakes',
  validateStocktakeCreate,
  asyncHandler(stocktakeController.createStocktake),
);
router.get(
  '/stocktakes/:stocktakeId',
  asyncHandler(stocktakeController.getWarehouseStocktake),
);
router.patch(
  '/stocktakes/:stocktakeId/lots/:lotId',
  validateStocktakeCount,
  asyncHandler(stocktakeController.recordCount),
);
router.post(
  '/stocktakes/:stocktakeId/propose',
  validateStocktakeProposal,
  asyncHandler(stocktakeController.proposeStocktake),
);

module.exports = router;
