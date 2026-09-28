'use strict';

const { SupplierService } = require('../services/supplier.service');

const supplierService = new SupplierService();

async function listSuppliers(request, response) {
  response.status(200).json({
    success: true,
    data: await supplierService.listSuppliers(request.query),
  });
}

async function getSupplier(request, response) {
  response.status(200).json({
    success: true,
    data: await supplierService.getSupplier(request.params.supplierId),
  });
}

async function createSupplier(request, response) {
  response.status(201).json({
    success: true,
    data: await supplierService.createSupplier(request.body),
  });
}

async function updateSupplier(request, response) {
  response.status(200).json({
    success: true,
    data: await supplierService.updateSupplier(request.params.supplierId, request.body),
  });
}

async function updateSupplierStatus(request, response) {
  response.status(200).json({
    success: true,
    data: await supplierService.updateSupplierStatus(
      request.params.supplierId,
      request.body,
    ),
  });
}

module.exports = {
  createSupplier,
  getSupplier,
  listSuppliers,
  updateSupplier,
  updateSupplierStatus,
};
