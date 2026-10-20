'use strict';

const express = require('express');
const authController = require('../controllers/auth.controller');
const { authenticate, authorize, ROLES } = require('../middleware/auth.middleware');
const { validateBody } = require('../middleware/validation.middleware');
const { asyncHandler } = require('../utils/async-handler');

const router = express.Router();

const validateRegistration = validateBody({
  required: ['fullName', 'phone', 'password', 'passwordConfirmation'],
  optional: ['email', 'dateOfBirth'],
});
const validateLogin = validateBody({
  required: ['identifier', 'password'],
});
const validatePasswordChange = validateBody({
  required: ['currentPassword', 'newPassword', 'newPasswordConfirmation'],
});

router.post('/register', validateRegistration, asyncHandler(authController.register));
router.post('/login', validateLogin, asyncHandler(authController.login));
router.patch(
  '/password',
  authenticate,
  authorize(...ROLES),
  validatePasswordChange,
  asyncHandler(authController.changePassword),
);

module.exports = router;
