'use strict';

const { AdminService } = require('../services/admin.service');

const adminService = new AdminService();

async function listEmployees(request, response) {
  response.status(200).json({
    success: true,
    data: await adminService.listEmployees(request.query),
  });
}

async function getEmployee(request, response) {
  response.status(200).json({
    success: true,
    data: await adminService.getEmployee(request.params.employeeId),
  });
}

async function createEmployee(request, response) {
  response.status(201).json({
    success: true,
    data: await adminService.createEmployee(request.auth, request.body, request.ip ?? null),
  });
}

async function updateEmployee(request, response) {
  response.status(200).json({
    success: true,
    data: await adminService.updateEmployee(
      request.auth,
      request.params.employeeId,
      request.body,
      request.ip ?? null,
    ),
  });
}

async function listAccounts(request, response) {
  response.status(200).json({
    success: true,
    data: await adminService.listAccounts(request.query),
  });
}

async function getAccount(request, response) {
  response.status(200).json({
    success: true,
    data: await adminService.getAccount(request.params.accountId),
  });
}

async function createAccount(request, response) {
  response.status(201).json({
    success: true,
    data: await adminService.createAccount(request.auth, request.body, request.ip ?? null),
  });
}

async function updateAccountRole(request, response) {
  response.status(200).json({
    success: true,
    data: await adminService.updateAccountRole(
      request.auth,
      request.params.accountId,
      request.body,
      request.ip ?? null,
    ),
  });
}

async function updateAccountStatus(request, response) {
  response.status(200).json({
    success: true,
    data: await adminService.updateAccountStatus(
      request.auth,
      request.params.accountId,
      request.body,
      request.ip ?? null,
    ),
  });
}

async function resetEmployeePassword(request, response) {
  response.status(200).json({
    success: true,
    data: await adminService.resetEmployeePassword(
      request.auth,
      request.params.accountId,
      request.body,
      request.ip ?? null,
    ),
  });
}

module.exports = {
  createAccount,
  createEmployee,
  getAccount,
  getEmployee,
  listAccounts,
  listEmployees,
  resetEmployeePassword,
  updateAccountRole,
  updateAccountStatus,
  updateEmployee,
};
