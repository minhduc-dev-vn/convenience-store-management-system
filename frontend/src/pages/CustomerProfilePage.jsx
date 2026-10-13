import { useCallback, useEffect, useState } from 'react';
import { AsyncContent, FormField, Notice, PageHeader } from '../components';
import { getCustomerProfile, updateCustomerProfile } from '../services/customer.service';
import { submitCustomerProfileForm } from './customer/customerProfileForm';

function CustomerProfilePage() {
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState({ fullName: '', email: '', address: '' });
  const [loadError, setLoadError] = useState(null);
  const [submitError, setSubmitError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
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
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setFieldErrors((current) => {
      if (!Object.hasOwn(current, name)) return current;
      const next = { ...current };
      delete next[name];
      return next;
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitError(null);
    setSuccess(null);
    setFieldErrors({});

    setIsSubmitting(true);
    try {
      const result = await submitCustomerProfileForm(form, updateCustomerProfile);
      setFieldErrors(result.fieldErrors);
      setSubmitError(result.globalError);
      if (result.profile) {
        applyProfile(result.profile);
        setSuccess(result.successMessage);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="workspace-page">
      <PageHeader
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
              <FormField htmlFor="profileFullName" label="Họ và tên" required error={fieldErrors.fullName}>
                <input
                  aria-describedby={fieldErrors.fullName ? 'profileFullName-error' : undefined}
                  aria-invalid={Boolean(fieldErrors.fullName)}
                  id="profileFullName"
                  name="fullName"
                  value={form.fullName}
                  onChange={updateField}
                />
              </FormField>
              <FormField htmlFor="profilePhone" label="Số điện thoại" hint="Số điện thoại định danh không thể sửa tại đây.">
                <input id="profilePhone" value={profile.phone} readOnly />
              </FormField>
              <FormField htmlFor="profileEmail" label="Email" error={fieldErrors.email}>
                <input
                  aria-describedby={fieldErrors.email ? 'profileEmail-error' : undefined}
                  aria-invalid={Boolean(fieldErrors.email)}
                  id="profileEmail"
                  name="email"
                  type="email"
                  value={form.email}
                  onChange={updateField}
                />
              </FormField>
              <FormField htmlFor="profileAddress" label="Địa chỉ" error={fieldErrors.address}>
                <input
                  aria-describedby={fieldErrors.address ? 'profileAddress-error' : undefined}
                  aria-invalid={Boolean(fieldErrors.address)}
                  id="profileAddress"
                  name="address"
                  value={form.address}
                  onChange={updateField}
                />
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
