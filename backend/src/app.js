'use strict';

const express = require('express');
const adminRoutes = require('./routes/admin.routes');
const authRoutes = require('./routes/auth.routes');
const customerRoutes = require('./routes/customer.routes');
const healthRoutes = require('./routes/health.routes');
const invoiceRoutes = require('./routes/invoice.routes');
const inventoryRoutes = require('./routes/inventory.routes');
const posRoutes = require('./routes/pos.routes');
const productRoutes = require('./routes/product.routes');
const promotionRoutes = require('./routes/promotion.routes');
const returnRoutes = require('./routes/return.routes');
const warehouseRoutes = require('./routes/warehouse.routes');
const { getSecuritySettings } = require('./config/security.config');
const { notFoundHandler, errorHandler } = require('./middleware/error.middleware');
const {
  createCors,
  createSecurityHeaders,
  requestContext,
} = require('./middleware/security.middleware');

function createApp({ securitySettings = getSecuritySettings() } = {}) {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', securitySettings.trustProxy);
  app.use(requestContext);
  app.use(createSecurityHeaders(securitySettings));
  app.use(createCors(securitySettings));
  app.use(express.json({ limit: securitySettings.bodyLimit }));

  app.use('/api/health', healthRoutes);
  app.use('/api/invoices', invoiceRoutes);
  app.use('/api/inventory', inventoryRoutes);
  app.use('/api/pos', posRoutes);
  app.use('/api/products', productRoutes);
  app.use('/api/promotions', promotionRoutes);
  app.use('/api/returns', returnRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/customers', customerRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/warehouse', warehouseRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = createApp();
module.exports.createApp = createApp;
