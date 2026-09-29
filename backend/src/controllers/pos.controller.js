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

module.exports = {
  calculateQuote,
  getCurrentShift,
  getProductByBarcode,
  openShift,
  searchProducts,
};
