'use strict';

const express = require('express');
const adminController = require('../controllers/admin.controller');
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

router.use(authenticate, authorize('MANAGER'));

router.get('/employees', validateEmployeeList, asyncHandler(adminController.listEmployees));
router.post('/employees', validateEmployeeCreate, asyncHandler(adminController.createEmployee));
router.get('/employees/:employeeId', asyncHandler(adminController.getEmployee));
router.patch(
  '/employees/:employeeId',
  validateEmployeeUpdate,
  asyncHandler(adminController.updateEmployee),
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
