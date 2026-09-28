'use strict';

const { PromotionService } = require('../services/promotion.service');

const promotionService = new PromotionService();

async function listPublicPromotions(request, response) {
  response.status(200).json({
    success: true,
    data: await promotionService.listPublicPromotions(request.query),
  });
}

async function getPublicPromotion(request, response) {
  response.status(200).json({
    success: true,
    data: await promotionService.getPublicPromotion(request.params.promotionId),
  });
}

async function evaluatePromotion(request, response) {
  response.status(200).json({
    success: true,
    data: await promotionService.evaluatePromotion(request.body),
  });
}

async function listPromotions(request, response) {
  response.status(200).json({
    success: true,
    data: await promotionService.listPromotions(request.query),
  });
}

async function getPromotion(request, response) {
  response.status(200).json({
    success: true,
    data: await promotionService.getPromotion(request.params.promotionId),
  });
}

async function createPromotion(request, response) {
  response.status(201).json({
    success: true,
    data: await promotionService.createPromotion(request.body),
  });
}

async function updatePromotion(request, response) {
  response.status(200).json({
    success: true,
    data: await promotionService.updatePromotion(
      request.params.promotionId,
      request.body,
    ),
  });
}

async function updatePromotionStatus(request, response) {
  response.status(200).json({
    success: true,
    data: await promotionService.updatePromotionStatus(
      request.params.promotionId,
      request.body,
    ),
  });
}

module.exports = {
  createPromotion,
  evaluatePromotion,
  getPromotion,
  getPublicPromotion,
  listPromotions,
  listPublicPromotions,
  updatePromotion,
  updatePromotionStatus,
};
