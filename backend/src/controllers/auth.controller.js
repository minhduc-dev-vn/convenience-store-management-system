'use strict';

const { AuthService } = require('../services/auth.service');

const authService = new AuthService();

async function register(request, response) {
  response.status(201).json({
    success: true,
    data: await authService.register(request.body),
  });
}

async function login(request, response) {
  response.status(200).json({
    success: true,
    data: await authService.login(request.body),
  });
}

async function changePassword(request, response) {
  response.status(200).json({
    success: true,
    data: await authService.changePassword(request.auth, request.body, request.ip ?? null),
  });
}

module.exports = {
  changePassword,
  login,
  register,
};
