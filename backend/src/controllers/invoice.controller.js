'use strict';

const { InvoiceService } = require('../services/invoice.service');

const invoiceService = new InvoiceService();

async function listInvoices(request, response) {
  response.status(200).json({
    success: true,
    data: await invoiceService.listInvoices(request.auth, request.query),
  });
}

async function getInvoice(request, response) {
  response.status(200).json({
    success: true,
    data: await invoiceService.getInvoice(request.auth, request.params.invoiceId),
  });
}

module.exports = {
  getInvoice,
  listInvoices,
};
