'use strict';

const { CustomerService } = require('../services/customer.service');

const customerService = new CustomerService();

async function getOwnProfile(request, response) {
  response.status(200).json({
    success: true,
    data: await customerService.getOwnProfile(request.auth),
  });
}

async function updateOwnProfile(request, response) {
  response.status(200).json({
    success: true,
    data: await customerService.updateOwnProfile(request.auth, request.body),
  });
}

async function getOwnLoyalty(request, response) {
  response.status(200).json({
    success: true,
    data: await customerService.getOwnLoyalty(request.auth),
  });
}

async function listOwnInvoices(request, response) {
  response.status(200).json({
    success: true,
    data: await customerService.listOwnInvoices(request.auth, request.query),
  });
}

async function getOwnInvoiceDetail(request, response) {
  response.status(200).json({
    success: true,
    data: await customerService.getOwnInvoiceDetail(request.auth, request.params.invoiceId),
  });
}

module.exports = {
  getOwnInvoiceDetail,
  getOwnLoyalty,
  getOwnProfile,
  listOwnInvoices,
  updateOwnProfile,
};
