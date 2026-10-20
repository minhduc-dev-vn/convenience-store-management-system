'use strict';

const { ReturnService } = require('../services/return.service');

const returnService = new ReturnService();

async function createReturn(request, response) {
  response.status(201).json({
    success: true,
    data: await returnService.createReturn(
      request.auth,
      request.body,
      request.ip ?? null,
    ),
  });
}

module.exports = {
  createReturn,
};
