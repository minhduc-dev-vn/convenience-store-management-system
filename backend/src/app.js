'use strict';

const express = require('express');
const adminRoutes = require('./routes/admin.routes');
const authRoutes = require('./routes/auth.routes');
const customerRoutes = require('./routes/customer.routes');
const healthRoutes = require('./routes/health.routes');
const inventoryRoutes = require('./routes/inventory.routes');
const productRoutes = require('./routes/product.routes');
const promotionRoutes = require('./routes/promotion.routes');
const warehouseRoutes = require('./routes/warehouse.routes');
const { notFoundHandler, errorHandler } = require('./middleware/error.middleware');

const app = express();

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

app.use('/api/health', healthRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/products', productRoutes);
app.use('/api/promotions', promotionRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/warehouse', warehouseRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
