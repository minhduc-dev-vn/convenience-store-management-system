import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AsyncContent, PageHeader } from '../components';
import { getCustomerLoyalty, getCustomerProfile } from '../services/customer.service';

const tierLabels = {
  BRONZE: 'Đồng',
  SILVER: 'Bạc',
  GOLD: 'Vàng',
  DIAMOND: 'Kim cương',
};

function CustomerOverviewPage() {
  const [state, setState] = useState({ data: null, error: null, isLoading: true });

  const loadOverview = useCallback(async (signal) => {
    setState((current) => ({ ...current, error: null, isLoading: true }));
    try {
      const [profile, loyalty] = await Promise.all([
        getCustomerProfile({ signal }),
        getCustomerLoyalty({ signal }),
      ]);
      setState({ data: { profile, loyalty }, error: null, isLoading: false });
    } catch (error) {
      if (error.name !== 'AbortError') setState({ data: null, error, isLoading: false });
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadOverview(controller.signal);
    return () => controller.abort();
  }, [loadOverview]);

  const retry = () => loadOverview();

  return (
    <section className="workspace-page">
      <PageHeader
        title="Tổng quan tài khoản"
        description="Theo dõi thông tin thành viên và truy cập nhanh các dịch vụ cá nhân."
      />
      <AsyncContent
        error={state.error}
        isLoading={state.isLoading}
        loadingMessage="Đang tải thông tin tài khoản…"
        onRetry={retry}
      >
        {state.data && (
          <div className="dashboard-grid">
            <article className="metric-card metric-card--accent">
              <span>Điểm tích lũy hiện tại</span>
              <strong>{state.data.loyalty.loyaltyPoints.toLocaleString('vi-VN')}</strong>
              <p>Hạng thành viên: {tierLabels[state.data.loyalty.membershipTier] ?? state.data.loyalty.membershipTier}</p>
            </article>
            <article className="profile-summary">
              <h2>{state.data.profile.fullName}</h2>
              <dl className="description-list">
                <div><dt>Số điện thoại</dt><dd>{state.data.profile.phone}</dd></div>
                <div><dt>Email</dt><dd>{state.data.profile.email || 'Chưa cập nhật'}</dd></div>
              </dl>
              <Link className="text-link" to="/customer/profile">Cập nhật hồ sơ</Link>
            </article>
            <article className="action-card action-card--wide">
              <h2>Hóa đơn và lịch sử tích lũy</h2>
              <p>Xem danh sách hóa đơn thuộc tài khoản của bạn, lọc theo thời gian và mở chi tiết từng giao dịch.</p>
              <Link className="button button--primary" to="/customer/history">Xem lịch sử mua hàng</Link>
            </article>
          </div>
        )}
      </AsyncContent>
    </section>
  );
}

export default CustomerOverviewPage;
