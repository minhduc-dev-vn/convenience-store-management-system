'use strict';

const { StocktakeService } = require('../services/stocktake.service');

const stocktakeService = new StocktakeService();

async function listWarehouseStocktakes(request, response) {
  response.status(200).json({
    success: true,
    data: await stocktakeService.listWarehouseStocktakes(request.auth, request.query),
  });
}

async function listManagerStocktakes(request, response) {
  response.status(200).json({
    success: true,
    data: await stocktakeService.listManagerStocktakes(request.auth, request.query),
  });
}

async function getWarehouseStocktake(request, response) {
  response.status(200).json({
    success: true,
    data: await stocktakeService.getWarehouseStocktake(
      request.auth,
      request.params.stocktakeId,
    ),
  });
}

async function getManagerStocktake(request, response) {
  response.status(200).json({
    success: true,
    data: await stocktakeService.getManagerStocktake(
      request.auth,
      request.params.stocktakeId,
    ),
  });
}

async function createStocktake(request, response) {
  response.status(201).json({
    success: true,
    data: await stocktakeService.createStocktake(request.auth, request.body),
  });
}

async function recordCount(request, response) {
  response.status(200).json({
    success: true,
    data: await stocktakeService.recordCount(
      request.auth,
      request.params.stocktakeId,
      request.params.lotId,
      request.body,
    ),
  });
}

async function proposeStocktake(request, response) {
  response.status(200).json({
    success: true,
    data: await stocktakeService.proposeStocktake(
      request.auth,
      request.params.stocktakeId,
      request.body,
      request.ip ?? null,
    ),
  });
}

async function approveStocktake(request, response) {
  response.status(200).json({
    success: true,
    data: await stocktakeService.approveStocktake(
      request.auth,
      request.params.stocktakeId,
      request.body,
      request.ip ?? null,
    ),
  });
}

async function rejectStocktake(request, response) {
  response.status(200).json({
    success: true,
    data: await stocktakeService.rejectStocktake(
      request.auth,
      request.params.stocktakeId,
      request.body,
      request.ip ?? null,
    ),
  });
}

module.exports = {
  approveStocktake,
  createStocktake,
  getManagerStocktake,
  getWarehouseStocktake,
  listManagerStocktakes,
  listWarehouseStocktakes,
  proposeStocktake,
  recordCount,
  rejectStocktake,
};
