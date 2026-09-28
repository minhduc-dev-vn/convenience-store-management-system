'use strict';

const express = require('express');
const adminController = require('../controllers/admin.controller');
const productController = require('../controllers/product.controller');
const promotionController = require('../controllers/promotion.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const { validateBody, validateQuery } = require('../middleware/validation.middleware');
const { asyncHandler } = require('../utils/async-handler');

const router = express.Router();

const validateEmployeeList = validateQuery({
  allowed: ['page', 'pageSize', 'search', 'status'],
});
const validateEmployeeCreate = validateBody({
  required: ['fullName', 'phone'],
  optional: [
    'dateOfBirth', 'gender', 'email', 'address', 'startDate', 'baseSalary', 'status',
  ],
});
const employeeUpdateFields = [
  'fullName', 'dateOfBirth', 'gender', 'phone', 'email',
  'address', 'startDate', 'baseSalary', 'status',
];
const validateEmployeeUpdate = validateBody({
  optional: employeeUpdateFields,
  atLeastOne: employeeUpdateFields,
});
const validateAccountList = validateQuery({
  allowed: ['page', 'pageSize', 'search', 'ownerType', 'role', 'status'],
});
const validateAccountCreate = validateBody({
  required: ['ownerType', 'ownerId', 'username', 'role', 'password', 'passwordConfirmation'],
});
const validateRoleUpdate = validateBody({ required: ['role'] });
const validateStatusUpdate = validateBody({ required: ['status'] });
const validatePasswordReset = validateBody({
  required: ['newPassword', 'newPasswordConfirmation'],
});
const validateCustomerList = validateQuery({
  allowed: ['page', 'pageSize', 'search', 'membershipTier', 'status'],
});
const validateCustomerInvoiceList = validateQuery({
  allowed: ['page', 'pageSize', 'from', 'to'],
});
const validateProductList = validateQuery({
  allowed: ['page', 'pageSize', 'search', 'categoryId', 'status'],
});
const validateProductCreate = validateBody({
  required: ['productId', 'name', 'unit', 'price', 'minimumStock', 'categoryId'],
  optional: ['barcode', 'status'],
});
const productUpdateFields = ['name', 'barcode', 'unit', 'minimumStock', 'categoryId'];
const validateProductUpdate = validateBody({
  optional: productUpdateFields,
  atLeastOne: productUpdateFields,
});
const validateProductPrice = validateBody({ required: ['newPrice', 'reason'] });
const validatePriceHistory = validateQuery({ allowed: ['page', 'pageSize'] });
const validateCategoryList = validateQuery({
  allowed: ['page', 'pageSize', 'search', 'status'],
});
const validateCategoryCreate = validateBody({
  required: ['categoryId', 'name'],
  optional: ['description', 'status'],
});
const categoryUpdateFields = ['name', 'description'];
const validateCategoryUpdate = validateBody({
  optional: categoryUpdateFields,
  atLeastOne: categoryUpdateFields,
});
const validatePromotionList = validateQuery({
  allowed: ['page', 'pageSize', 'search', 'status', 'type'],
});
const validatePromotionCreate = validateBody({
  required: [
    'promotionId', 'name', 'type', 'value', 'startAt', 'endAt', 'productIds',
  ],
  optional: ['minimumOrderValue', 'maximumDiscount', 'status'],
});
const promotionUpdateFields = [
  'name', 'type', 'value', 'minimumOrderValue', 'maximumDiscount',
  'startAt', 'endAt', 'productIds',
];
const validatePromotionUpdate = validateBody({
  optional: promotionUpdateFields,
  atLeastOne: promotionUpdateFields,
});

router.use(authenticate, authorize('MANAGER'));

router.get('/employees', validateEmployeeList, asyncHandler(adminController.listEmployees));
router.post('/employees', validateEmployeeCreate, asyncHandler(adminController.createEmployee));
router.get('/employees/:employeeId', asyncHandler(adminController.getEmployee));
router.patch(
  '/employees/:employeeId',
  validateEmployeeUpdate,
  asyncHandler(adminController.updateEmployee),
);

router.get('/customers', validateCustomerList, asyncHandler(adminController.listCustomers));
router.get(
  '/customers/:customerId/invoices',
  validateCustomerInvoiceList,
  asyncHandler(adminController.listCustomerInvoices),
);
router.get(
  '/customers/:customerId/invoices/:invoiceId',
  asyncHandler(adminController.getCustomerInvoiceDetail),
);
router.patch(
  '/customers/:customerId/account/status',
  validateStatusUpdate,
  asyncHandler(adminController.updateCustomerAccountStatus),
);
router.get('/customers/:customerId', asyncHandler(adminController.getCustomer));

router.get('/products', validateProductList, asyncHandler(productController.listProducts));
router.post('/products', validateProductCreate, asyncHandler(productController.createProduct));
router.get(
  '/products/:productId/price-history',
  validatePriceHistory,
  asyncHandler(productController.listPriceHistory),
);
router.patch(
  '/products/:productId/price',
  validateProductPrice,
  asyncHandler(productController.updateProductPrice),
);
router.patch(
  '/products/:productId/status',
  validateStatusUpdate,
  asyncHandler(productController.updateProductStatus),
);
router.get('/products/:productId', asyncHandler(productController.getProduct));
router.patch(
  '/products/:productId',
  validateProductUpdate,
  asyncHandler(productController.updateProduct),
);

router.get('/categories', validateCategoryList, asyncHandler(productController.listCategories));
router.post(
  '/categories',
  validateCategoryCreate,
  asyncHandler(productController.createCategory),
);
router.patch(
  '/categories/:categoryId/status',
  validateStatusUpdate,
  asyncHandler(productController.updateCategoryStatus),
);
router.get('/categories/:categoryId', asyncHandler(productController.getCategory));
router.patch(
  '/categories/:categoryId',
  validateCategoryUpdate,
  asyncHandler(productController.updateCategory),
);

router.get(
  '/promotions',
  validatePromotionList,
  asyncHandler(promotionController.listPromotions),
);
router.post(
  '/promotions',
  validatePromotionCreate,
  asyncHandler(promotionController.createPromotion),
);
router.patch(
  '/promotions/:promotionId/status',
  validateStatusUpdate,
  asyncHandler(promotionController.updatePromotionStatus),
);
router.get('/promotions/:promotionId', asyncHandler(promotionController.getPromotion));
router.patch(
  '/promotions/:promotionId',
  validatePromotionUpdate,
  asyncHandler(promotionController.updatePromotion),
);

router.get('/accounts', validateAccountList, asyncHandler(adminController.listAccounts));
router.post('/accounts', validateAccountCreate, asyncHandler(adminController.createAccount));
router.get('/accounts/:accountId', asyncHandler(adminController.getAccount));
router.patch(
  '/accounts/:accountId/role',
  validateRoleUpdate,
  asyncHandler(adminController.updateAccountRole),
);
router.patch(
  '/accounts/:accountId/status',
  validateStatusUpdate,
  asyncHandler(adminController.updateAccountStatus),
);
router.post(
  '/accounts/:accountId/reset-password',
  validatePasswordReset,
  asyncHandler(adminController.resetEmployeePassword),
);

module.exports = router;
