'use strict';

const { PosService } = require('../services/pos.service');

const posService = new PosService();

async function getCurrentShift(request, response) {
  response.status(200).json({
    success: true,
    data: await posService.getCurrentShift(request.auth),
  });
}

async function openShift(request, response) {
  response.status(201).json({
    success: true,
    data: await posService.openShift(request.auth, request.body),
  });
}

async function getShiftReconciliation(request, response) {
  response.status(200).json({
    success: true,
    data: await posService.getShiftReconciliation(request.auth, request.params.shiftId),
  });
}

async function closeShift(request, response) {
  response.status(200).json({
    success: true,
    data: await posService.closeShift(request.auth, request.params.shiftId, request.body),
  });
}

async function searchProducts(request, response) {
  response.status(200).json({
    success: true,
    data: await posService.searchProducts(request.auth, request.query),
  });
}

async function getProductByBarcode(request, response) {
  response.status(200).json({
    success: true,
    data: await posService.getProductByBarcode(request.auth, request.params.barcode),
  });
}

async function calculateQuote(request, response) {
  response.status(200).json({
    success: true,
    data: await posService.calculateQuote(request.auth, request.body),
  });
}

async function checkout(request, response) {
  const data = await posService.checkout(request.auth, request.body);
  response.status(data.idempotentReplay ? 200 : 201).json({
    success: true,
    data,
  });
}

async function getReceipt(request, response) {
  response.status(200).json({
    success: true,
    data: await posService.getReceipt(request.auth, request.params.invoiceId),
  });
}

module.exports = {
  calculateQuote,
  checkout,
  closeShift,
  getCurrentShift,
  getProductByBarcode,
  getReceipt,
  getShiftReconciliation,
  openShift,
  searchProducts,
};
