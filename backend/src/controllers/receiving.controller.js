'use strict';

const { ReceivingService } = require('../services/receiving.service');

const receivingService = new ReceivingService();

async function listReceipts(request, response) {
  response.status(200).json({
    success: true,
    data: await receivingService.listReceipts(request.auth, request.query),
  });
}

async function getReceipt(request, response) {
  response.status(200).json({
    success: true,
    data: await receivingService.getReceipt(request.auth, request.params.receiptId),
  });
}

async function createDraft(request, response) {
  response.status(201).json({
    success: true,
    data: await receivingService.createDraft(request.auth, request.body),
  });
}

async function updateDraft(request, response) {
  response.status(200).json({
    success: true,
    data: await receivingService.updateDraft(
      request.auth,
      request.params.receiptId,
      request.body,
    ),
  });
}

async function addLine(request, response) {
  response.status(201).json({
    success: true,
    data: await receivingService.addLine(
      request.auth,
      request.params.receiptId,
      request.body,
    ),
  });
}

async function updateLine(request, response) {
  response.status(200).json({
    success: true,
    data: await receivingService.updateLine(
      request.auth,
      request.params.receiptId,
      request.params.detailId,
      request.body,
    ),
  });
}

async function deleteLine(request, response) {
  response.status(200).json({
    success: true,
    data: await receivingService.deleteLine(
      request.auth,
      request.params.receiptId,
      request.params.detailId,
    ),
  });
}

async function cancelReceipt(request, response) {
  response.status(200).json({
    success: true,
    data: await receivingService.cancelReceipt(request.auth, request.params.receiptId),
  });
}

async function confirmReceipt(request, response) {
  response.status(200).json({
    success: true,
    data: await receivingService.confirmReceipt(
      request.auth,
      request.params.receiptId,
      request.ip ?? null,
    ),
  });
}

async function listSupplierOptions(request, response) {
  response.status(200).json({
    success: true,
    data: await receivingService.listSupplierOptions(request.auth, request.query),
  });
}

async function listProductOptions(request, response) {
  response.status(200).json({
    success: true,
    data: await receivingService.listProductOptions(request.auth, request.query),
  });
}

module.exports = {
  addLine,
  cancelReceipt,
  confirmReceipt,
  createDraft,
  deleteLine,
  getReceipt,
  listProductOptions,
  listReceipts,
  listSupplierOptions,
  updateDraft,
  updateLine,
};
