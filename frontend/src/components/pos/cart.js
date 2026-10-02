function normalizeStock(product) {
  const stock = Number(product?.availableStock);
  if (!Number.isSafeInteger(stock) || stock < 1) {
    throw new RangeError('Sản phẩm hiện không còn tồn khả dụng.');
  }
  return stock;
}

function normalizeQuantity(value, maximum) {
  const quantity = Number(value);
  if (!Number.isSafeInteger(quantity) || quantity < 1) {
    throw new RangeError('Số lượng phải là số nguyên lớn hơn 0.');
  }
  if (quantity > maximum) {
    throw new RangeError(`Số lượng không được vượt tồn khả dụng (${maximum}).`);
  }
  return quantity;
}

export function addProductToCart(cart, product) {
  const availableStock = normalizeStock(product);
  const current = cart.find((item) => item.productId === product.productId);
  if (!current) {
    return [...cart, { ...product, availableStock, quantity: 1 }];
  }
  const nextQuantity = normalizeQuantity(current.quantity + 1, availableStock);
  return cart.map((item) => (
    item.productId === product.productId
      ? { ...item, ...product, availableStock, quantity: nextQuantity }
      : item
  ));
}

export function updateCartQuantity(cart, productId, value) {
  return cart.map((item) => (
    item.productId === productId
      ? { ...item, quantity: normalizeQuantity(value, normalizeStock(item)) }
      : item
  ));
}

export function removeCartItem(cart, productId) {
  return cart.filter((item) => item.productId !== productId);
}

export function buildQuotePayload(cart, { customerPhone = '', promotionId = '' } = {}) {
  if (!Array.isArray(cart) || cart.length === 0) {
    throw new RangeError('Giỏ hàng cần ít nhất một sản phẩm.');
  }
  const payload = {
    items: cart.map((item) => ({
      productId: item.productId,
      quantity: normalizeQuantity(item.quantity, normalizeStock(item)),
    })),
  };
  const normalizedPhone = String(customerPhone ?? '').trim();
  const normalizedPromotion = String(promotionId ?? '').trim();
  if (normalizedPhone) payload.customerPhone = normalizedPhone;
  if (normalizedPromotion) payload.promotionId = normalizedPromotion;
  return payload;
}

