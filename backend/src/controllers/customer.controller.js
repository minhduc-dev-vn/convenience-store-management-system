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

module.exports = {
  getOwnProfile,
  updateOwnProfile,
};
