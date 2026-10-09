import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getErrorMessage } from '../../api/errors';
import { ErrorState, LoadingState, Notice, PageHeader } from '../../components';
import PosCart from '../../components/pos/PosCart';
import ProductSearch from '../../components/pos/ProductSearch';
import CheckoutDialog from '../../components/pos/CheckoutDialog';
import {
  addProductToCart,
  buildQuotePayload,
  removeCartItem,
  updateCartQuantity,
} from '../../components/pos/cart';
import {
  buildCheckoutPayload,
  createInvoiceId,
} from '../../components/pos/checkout';
import { listPublicPromotions } from '../../services/promotion.service';
import {
  calculatePosQuote,
  checkoutPosOrder,
  getCurrentPosShift,
  getPosProductByBarcode,
  getPosReceipt,
  searchPosProducts,
} from '../../services/pos.service';

function formatDateTime(value) {
  return value ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : '—';
}

function CashierPosPage() {
  const navigate = useNavigate();
  const scannerRef = useRef(null);
  const quoteRequestRef = useRef(0);
  const checkoutSubmittingRef = useRef(false);
  const [shift, setShift] = useState(null);
  const [pageStatus, setPageStatus] = useState('loading');
  const [cart, setCart] = useState([]);
  const [quote, setQuote] = useState(null);
  const [quoteOptions, setQuoteOptions] = useState({ customerPhone: '', promotionId: '' });
  const [promotions, setPromotions] = useState([]);
  const [promotionsError, setPromotionsError] = useState('');
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [checkoutInvoiceId, setCheckoutInvoiceId] = useState('');
  const [checkoutError, setCheckoutError] = useState('');
  const [isCheckoutSubmitting, setIsCheckoutSubmitting] = useState(false);
  const [query, setQuery] = useState('');
  const [products, setProducts] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const [isQuoting, setIsQuoting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const handleRequestError = useCallback((requestError) => {
    if (requestError?.code === 'SHIFT_REQUIRED') {
      setShift(null);
      setPageStatus('ready');
    }
    setError(getErrorMessage(requestError));
  }, []);

  async function loadShift() {
    setPageStatus('loading');
    setError('');
    try {
      const data = await getCurrentPosShift();
      setShift(data.shift);
      setPageStatus('ready');
      requestAnimationFrame(() => scannerRef.current?.focus());
    } catch (requestError) {
      setPageStatus('error');
      setError(getErrorMessage(requestError));
    }
  }

  useEffect(() => {
    loadShift();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    listPublicPromotions({}, { signal: controller.signal })
      .then((data) => setPromotions(Array.isArray(data) ? data : []))
      .catch((requestError) => {
        if (requestError.name !== 'AbortError') {
          setPromotionsError('Không thể tải danh sách khuyến mãi. Bạn vẫn có thể thanh toán không áp dụng ưu đãi.');
        }
      });
    return () => controller.abort();
  }, []);

  const applicablePromotions = useMemo(() => {
    const productIds = new Set(cart.map((item) => item.productId));
    return promotions.filter((promotion) => (
      promotion.products?.some((product) => productIds.has(product.productId))
    ));
  }, [cart, promotions]);

  async function refreshQuote(nextCart, options = {}, { forCheckout = false } = {}) {
    const requestId = quoteRequestRef.current + 1;
    quoteRequestRef.current = requestId;
    if (nextCart.length === 0) {
      setQuote(null);
      setQuoteOptions({ customerPhone: '', promotionId: '' });
      setIsQuoting(false);
      return null;
    }
    setIsQuoting(true);
    setError('');
    try {
      const normalizedOptions = {
        customerPhone: String(options.customerPhone ?? '').trim(),
        promotionId: String(options.promotionId ?? '').trim(),
      };
      const data = await calculatePosQuote(buildQuotePayload(nextCart, normalizedOptions));
      if (quoteRequestRef.current !== requestId) return null;
      setQuote(data);
      setQuoteOptions(normalizedOptions);
      setCart((current) => current.map((item) => {
        const authoritative = data.items.find((quoted) => quoted.productId === item.productId);
        return authoritative ? { ...item, availableStock: authoritative.availableStock } : item;
      }));
      return data;
    } catch (requestError) {
      if (quoteRequestRef.current !== requestId) return null;
      if (forCheckout) {
        if (requestError?.code === 'SHIFT_REQUIRED') {
          setShift(null);
          setIsCheckoutOpen(false);
        }
        setCheckoutError(getErrorMessage(requestError));
      } else {
        setQuote(null);
        handleRequestError(requestError);
      }
      return null;
    } finally {
      if (quoteRequestRef.current === requestId) setIsQuoting(false);
    }
  }

  function commitCart(nextCart, successMessage = '') {
    setCart(nextCart);
    setCheckoutInvoiceId('');
    setNotice(successMessage);
    refreshQuote(nextCart, {});
    requestAnimationFrame(() => scannerRef.current?.focus());
  }

  function handleAdd(product) {
    try {
      commitCart(addProductToCart(cart, product), `${product.name} đã được thêm vào giỏ.`);
      setQuery('');
    } catch (cartError) {
      setError(cartError.message);
    }
  }

  async function runSearch(value, { barcodeFirst = false, targetPage = 1 } = {}) {
    const normalized = value.trim();
    if (!normalized) return;
    setIsSearching(true);
    setError('');
    setNotice('');
    try {
      if (barcodeFirst) {
        try {
          const data = await getPosProductByBarcode(normalized);
          handleAdd(data.product);
          setProducts([]);
          setPage(1);
          setTotalPages(0);
          return;
        } catch (barcodeError) {
          if (barcodeError?.code !== 'PRODUCT_NOT_SELLABLE') throw barcodeError;
        }
      }
      const data = await searchPosProducts({ page: targetPage, pageSize: 8, search: normalized });
      setProducts(data.items);
      setPage(data.pagination.page);
      setTotalPages(data.pagination.totalPages);
      if (data.items.length === 0) setNotice('Không tìm thấy sản phẩm đang bán và còn tồn phù hợp.');
    } catch (requestError) {
      handleRequestError(requestError);
    } finally {
      setIsSearching(false);
    }
  }

  function handleQuantityChange(productId, value) {
    try {
      commitCart(updateCartQuantity(cart, productId, value));
    } catch (cartError) {
      setError(cartError.message);
    }
  }

  function handleRemove(productId) {
    commitCart(removeCartItem(cart, productId));
  }

  function handleClear() {
    commitCart([]);
    setProducts([]);
    setQuery('');
    setNotice('Đã hủy đơn hàng hiện tại.');
  }

  function handlePreparePayment() {
    if (!shift) {
      setError('Bạn cần có ca OPEN trước khi chuyển sang thanh toán.');
      return;
    }
    if (!quote || isQuoting || cart.length === 0) {
      setError('Đơn hàng chưa có báo giá hợp lệ từ máy chủ.');
      return;
    }
    setCheckoutInvoiceId((current) => current || createInvoiceId());
    setCheckoutError('');
    setIsCheckoutOpen(true);
    setNotice('');
  }

  async function handleRefreshCheckoutQuote(options) {
    setCheckoutError('');
    return refreshQuote(cart, options, { forCheckout: true });
  }

  async function handleCheckout(paymentInput) {
    if (checkoutSubmittingRef.current) return;
    checkoutSubmittingRef.current = true;
    setIsCheckoutSubmitting(true);
    setCheckoutError('');
    try {
      const options = {
        customerPhone: paymentInput.customerPhone,
        promotionId: paymentInput.promotionId,
      };
      const latestQuote = await refreshQuote(cart, options, { forCheckout: true });
      if (!latestQuote) return;
      if (paymentInput.promotionId && latestQuote.promotion?.eligible !== true) {
        setCheckoutError('Khuyến mãi đã chọn không còn đủ điều kiện áp dụng.');
        return;
      }
      const payload = buildCheckoutPayload({
        ...paymentInput,
        cart,
        invoiceId: checkoutInvoiceId,
        quote: latestQuote,
      });
      const checkoutResult = await checkoutPosOrder(payload);
      let persistedReceipt = checkoutResult.receipt;
      try {
        const persisted = await getPosReceipt(checkoutInvoiceId);
        persistedReceipt = persisted.receipt;
      } catch {
        // Checkout response is already serialized from the committed invoice.
      }
      setCart([]);
      setQuote(null);
      setQuoteOptions({ customerPhone: '', promotionId: '' });
      setProducts([]);
      setQuery('');
      setIsCheckoutOpen(false);
      navigate(`/cashier/receipts/${encodeURIComponent(checkoutInvoiceId)}`, {
        replace: true,
        state: { receipt: persistedReceipt },
      });
    } catch (requestError) {
      if (requestError?.code === 'SHIFT_REQUIRED') {
        setShift(null);
        setIsCheckoutOpen(false);
      }
      setCheckoutError(getErrorMessage(requestError));
    } finally {
      checkoutSubmittingRef.current = false;
      setIsCheckoutSubmitting(false);
    }
  }

  if (pageStatus === 'loading') return <LoadingState message="Đang kiểm tra ca và khởi tạo quầy bán hàng" />;
  if (pageStatus === 'error') return <ErrorState message={error} onRetry={loadShift} />;
  if (!shift) {
    return (
      <section className="workspace-page">
        <PageHeader title="Chưa có ca làm việc OPEN" description="Backend chưa ghi nhận ca mở cho tài khoản thu ngân hiện tại." />
        <div className="shift-required-card">
          <strong>Mở ca trước khi bán hàng</strong>
          <p>Việc mở ca ghi nhận tiền đầu ca và là điều kiện bắt buộc trước khi tìm sản phẩm hoặc lập đơn hàng.</p>
          <Link className="button button--primary" to="/cashier">Đi đến mở ca</Link>
        </div>
      </section>
    );
  }

  return (
    <section className="workspace-page cashier-pos-page">
      <PageHeader
        title="Bán hàng tại quầy"
        description="Quét sản phẩm, điều chỉnh giỏ và xác nhận báo giá trực tiếp từ backend."
      />

      <div className="pos-shift-strip">
        <div><span className="status-badge status-badge--active">{shift.status}</span><strong>Ca #{shift.shiftId}</strong></div>
        <span>{shift.employee?.name || shift.employee?.employeeId}</span>
        <span>Bắt đầu {formatDateTime(shift.startedAt)}</span>
      </div>

      <Notice tone="error">{error}</Notice>
      <Notice tone="success">{notice}</Notice>

      <div className="pos-workspace">
        <ProductSearch
          inputRef={scannerRef}
          isLoading={isSearching}
          onAdd={handleAdd}
          onPageChange={(nextPage) => runSearch(query, { targetPage: nextPage })}
          onSearch={runSearch}
          page={page}
          products={products}
          query={query}
          setQuery={setQuery}
          totalPages={totalPages}
        />
        <PosCart
          cart={cart}
          isQuoting={isQuoting}
          onClear={handleClear}
          onQuantityChange={handleQuantityChange}
          onRemove={handleRemove}
          quote={quote}
        />
      </div>

      <div className="pos-checkout-bar">
        <div>
          <strong>Giá và tổng tiền do backend xác nhận</strong>
          <span>Giỏ hàng sẽ được kiểm tra lại ở bước thanh toán.</span>
        </div>
        <button
          className="button button--primary button--large"
          type="button"
          disabled={!shift || cart.length === 0 || !quote || isQuoting}
          onClick={handlePreparePayment}
        >
          {isQuoting ? 'Đang kiểm tra…' : 'Thanh toán'}
        </button>
      </div>

      {isCheckoutOpen && quote && (
        <CheckoutDialog
          appliedOptions={quoteOptions}
          error={checkoutError}
          invoiceId={checkoutInvoiceId}
          isQuoting={isQuoting}
          isSubmitting={isCheckoutSubmitting}
          onCancel={() => {
            setIsCheckoutOpen(false);
            setCheckoutError('');
          }}
          onConfirm={handleCheckout}
          onRefreshQuote={handleRefreshCheckoutQuote}
          promotions={applicablePromotions}
          promotionsError={promotionsError}
          quote={quote}
        />
      )}
    </section>
  );
}

export default CashierPosPage;
