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

async function listCustomers(request, response) {
  response.status(200).json({
    success: true,
    data: await adminService.listCustomers(request.query),
  });
}

async function getCustomer(request, response) {
  response.status(200).json({
    success: true,
    data: await adminService.getCustomer(request.params.customerId),
  });
}

async function listCustomerInvoices(request, response) {
  response.status(200).json({
    success: true,
    data: await adminService.listCustomerInvoices(
      request.params.customerId,
      request.query,
    ),
  });
}

async function getCustomerInvoiceDetail(request, response) {
  response.status(200).json({
    success: true,
    data: await adminService.getCustomerInvoiceDetail(
      request.params.customerId,
      request.params.invoiceId,
    ),
  });
}

async function updateCustomerAccountStatus(request, response) {
  response.status(200).json({
    success: true,
    data: await adminService.updateCustomerAccountStatus(
      request.auth,
      request.params.customerId,
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
  getCustomer,
  getCustomerInvoiceDetail,
  getEmployee,
  listAccounts,
  listCustomerInvoices,
  listCustomers,
  listEmployees,
  resetEmployeePassword,
  updateAccountRole,
  updateAccountStatus,
  updateCustomerAccountStatus,
  updateEmployee,
};
