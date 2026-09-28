'use strict';

const { ProductService } = require('../services/product.service');

const productService = new ProductService();

async function listPublicProducts(request, response) {
  response.status(200).json({
    success: true,
    data: await productService.listPublicProducts(request.query),
  });
}

async function getPublicProduct(request, response) {
  response.status(200).json({
    success: true,
    data: await productService.getPublicProduct(request.params.productId),
  });
}

async function listPublicCategories(_request, response) {
  response.status(200).json({
    success: true,
    data: await productService.listPublicCategories(),
  });
}

async function listProducts(request, response) {
  response.status(200).json({
    success: true,
    data: await productService.listProducts(request.query),
  });
}

async function getProduct(request, response) {
  response.status(200).json({
    success: true,
    data: await productService.getProduct(request.params.productId),
  });
}

async function createProduct(request, response) {
  response.status(201).json({
    success: true,
    data: await productService.createProduct(request.body),
  });
}

async function updateProduct(request, response) {
  response.status(200).json({
    success: true,
    data: await productService.updateProduct(request.params.productId, request.body),
  });
}

async function updateProductStatus(request, response) {
  response.status(200).json({
    success: true,
    data: await productService.updateProductStatus(
      request.params.productId,
      request.body,
    ),
  });
}

async function updateProductPrice(request, response) {
  response.status(200).json({
    success: true,
    data: await productService.updateProductPrice(
      request.auth,
      request.params.productId,
      request.body,
      request.ip ?? null,
    ),
  });
}

async function listPriceHistory(request, response) {
  response.status(200).json({
    success: true,
    data: await productService.listPriceHistory(
      request.params.productId,
      request.query,
    ),
  });
}

async function listCategories(request, response) {
  response.status(200).json({
    success: true,
    data: await productService.listCategories(request.query),
  });
}

async function getCategory(request, response) {
  response.status(200).json({
    success: true,
    data: await productService.getCategory(request.params.categoryId),
  });
}

async function createCategory(request, response) {
  response.status(201).json({
    success: true,
    data: await productService.createCategory(request.body),
  });
}

async function updateCategory(request, response) {
  response.status(200).json({
    success: true,
    data: await productService.updateCategory(request.params.categoryId, request.body),
  });
}

async function updateCategoryStatus(request, response) {
  response.status(200).json({
    success: true,
    data: await productService.updateCategoryStatus(
      request.params.categoryId,
      request.body,
    ),
  });
}

module.exports = {
  createCategory,
  createProduct,
  getCategory,
  getProduct,
  getPublicProduct,
  listCategories,
  listPriceHistory,
  listProducts,
  listPublicCategories,
  listPublicProducts,
  updateCategory,
  updateCategoryStatus,
  updateProduct,
  updateProductPrice,
  updateProductStatus,
};
