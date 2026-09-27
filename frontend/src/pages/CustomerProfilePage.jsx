import { useCallback, useEffect, useState } from 'react';
import { getErrorMessage } from '../api';
import { AsyncContent, FormField, Notice, PageHeader } from '../components';
import { getCustomerProfile, updateCustomerProfile } from '../services/customer.service';

function CustomerProfilePage() {
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState({ fullName: '', email: '', address: '' });
  const [loadError, setLoadError] = useState(null);
  const [submitError, setSubmitError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const applyProfile = (data) => {
    setProfile(data);
    setForm({
      fullName: data.fullName ?? '',
      email: data.email ?? '',
      address: data.address ?? '',
    });
  };

  const loadProfile = useCallback(async (signal) => {
    setLoadError(null);
    setIsLoading(true);
    try {
      applyProfile(await getCustomerProfile({ signal }));
    } catch (error) {
      if (error.name !== 'AbortError') setLoadError(error);
    } finally {
      if (!signal?.aborted) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadProfile(controller.signal);
    return () => controller.abort();
  }, [loadProfile]);

  const updateField = (event) => {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitError(null);
    setSuccess(null);
    if (!form.fullName.trim()) {
      setSubmitError('Họ và tên không được để trống.');
      return;
    }

    setIsSubmitting(true);
    try {
      const updated = await updateCustomerProfile({
        fullName: form.fullName.trim(),
        email: form.email.trim() || null,
        address: form.address.trim() || null,
      });
      applyProfile(updated);
      setSuccess('Hồ sơ cá nhân đã được cập nhật.');
    } catch (error) {
      setSubmitError(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="workspace-page">
      <PageHeader
        eyebrow="MH-28"
        title="Hồ sơ cá nhân"
        description="Cập nhật thông tin liên hệ của chính tài khoản khách hàng đang đăng nhập."
      />
      <AsyncContent
        error={loadError}
        isLoading={isLoading}
        loadingMessage="Đang tải hồ sơ…"
        onRetry={() => loadProfile()}
      >
        {profile && (
          <form className="form-card form-card--profile" onSubmit={handleSubmit} noValidate>
            <Notice tone="success">{success}</Notice>
            <Notice tone="error">{submitError}</Notice>
            <div className="form-grid">
              <FormField htmlFor="profileFullName" label="Họ và tên" required>
                <input id="profileFullName" name="fullName" value={form.fullName} onChange={updateField} />
              </FormField>
              <FormField htmlFor="profilePhone" label="Số điện thoại" hint="Số điện thoại định danh không thể sửa tại đây.">
                <input id="profilePhone" value={profile.phone} readOnly />
              </FormField>
              <FormField htmlFor="profileEmail" label="Email">
                <input id="profileEmail" name="email" type="email" value={form.email} onChange={updateField} />
              </FormField>
              <FormField htmlFor="profileAddress" label="Địa chỉ">
                <input id="profileAddress" name="address" value={form.address} onChange={updateField} />
              </FormField>
            </div>
            <div className="readonly-summary" aria-label="Thông tin thành viên chỉ đọc">
              <span>Điểm tích lũy <strong>{profile.loyaltyPoints.toLocaleString('vi-VN')}</strong></span>
              <span>Hạng thành viên <strong>{profile.membershipTier}</strong></span>
            </div>
            <button className="button button--primary" disabled={isSubmitting} type="submit">
              {isSubmitting ? 'Đang lưu…' : 'Lưu thay đổi'}
            </button>
          </form>
        )}
      </AsyncContent>
    </section>
  );
}

export default CustomerProfilePage;
