'use strict';

const { InventoryService } = require('../services/inventory.service');

const inventoryService = new InventoryService();

async function listProducts(request, response) {
  response.status(200).json({
    success: true,
    data: await inventoryService.listProducts(request.auth, request.query),
  });
}

async function listLots(request, response) {
  response.status(200).json({
    success: true,
    data: await inventoryService.listLots(request.auth, request.query),
  });
}

async function listProductLots(request, response) {
  response.status(200).json({
    success: true,
    data: await inventoryService.listLots(request.auth, {
      ...request.query,
      productId: request.params.productId,
    }),
  });
}

module.exports = {
  listLots,
  listProductLots,
  listProducts,
};
