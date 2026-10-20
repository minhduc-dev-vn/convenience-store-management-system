import { useCallback, useEffect, useState } from 'react';
import { AsyncContent, Modal, PageHeader, PromotionCard } from '../../components';
import { getPublicPromotion, listPublicPromotions } from '../../services/promotion.service';

const money = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,
});

const dateTime = new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

function PromotionPage() {
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState({ data: [], error: null, isLoading: true });
  const [detail, setDetail] = useState({ data: null, error: null, isLoading: false });

  const load = useCallback(async (signal) => {
    setState((current) => ({ ...current, error: null, isLoading: true }));
    try {
      const data = await listPublicPromotions({}, { signal });
      setState({ data, error: null, isLoading: false });
    } catch (error) {
      if (error.name !== 'AbortError') setState({ data: [], error, isLoading: false });
    }
  }, [reloadKey]);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const openDetail = async (promotion) => {
    setDetail({ data: promotion, error: null, isLoading: true });
    try {
      const data = await getPublicPromotion(promotion.promotionId);
      setDetail({ data, error: null, isLoading: false });
    } catch (error) {
      setDetail({ data: promotion, error, isLoading: false });
    }
  };

  return (
    <section className="workspace-page promotions-public-page">
      <PageHeader
        title="Khuyến mãi đang diễn ra"
        description="Xem điều kiện và danh sách sản phẩm áp dụng. Trang này được truy cập công khai, không yêu cầu đăng nhập."
      />

      <AsyncContent
        error={state.error}
        isLoading={state.isLoading}
        loadingMessage="Đang tải chương trình khuyến mãi…"
        onRetry={() => setReloadKey((value) => value + 1)}
        isEmpty={state.data.length === 0}
        emptyTitle="Chưa có chương trình đang diễn ra"
        emptyMessage="Các chương trình mới sẽ xuất hiện tại đây khi bắt đầu hiệu lực."
      >
        <div className="promotion-grid">
          {state.data.map((promotion) => (
            <PromotionCard key={promotion.promotionId} promotion={promotion} onView={openDetail} />
          ))}
        </div>
      </AsyncContent>

      {detail.data && (
        <Modal
          title={detail.data.name}
          description={`Mã chương trình ${detail.data.promotionId}`}
          onClose={() => setDetail({ data: null, error: null, isLoading: false })}
          size="large"
        >
          <dl className="description-list promotion-detail-list">
            <div><dt>Hình thức</dt><dd>{detail.data.type === 'PERCENT' ? 'Giảm theo phần trăm' : 'Giảm số tiền cố định'}</dd></div>
            <div><dt>Mức ưu đãi</dt><dd>{detail.data.type === 'PERCENT' ? `${detail.data.value}%` : money.format(detail.data.value)}</dd></div>
            <div><dt>Đơn tối thiểu</dt><dd>{money.format(detail.data.minimumOrderValue)}</dd></div>
            <div><dt>Giảm tối đa</dt><dd>{detail.data.maximumDiscount == null ? 'Không giới hạn riêng' : money.format(detail.data.maximumDiscount)}</dd></div>
            <div><dt>Bắt đầu</dt><dd>{dateTime.format(new Date(detail.data.startAt))}</dd></div>
            <div><dt>Kết thúc</dt><dd>{dateTime.format(new Date(detail.data.endAt))}</dd></div>
          </dl>
          <h3>Sản phẩm áp dụng</h3>
          <ul className="promotion-product-list">
            {detail.data.products.map((product) => (
              <li key={product.productId}><strong>{product.productId}</strong><span>{product.name}</span></li>
            ))}
          </ul>
          {detail.isLoading && <p className="form-note">Đang xác nhận thông tin mới nhất…</p>}
          {detail.error && <p className="form-note">Không thể làm mới chi tiết; thông tin từ danh sách đang được hiển thị.</p>}
        </Modal>
      )}
    </section>
  );
}

export default PromotionPage;
