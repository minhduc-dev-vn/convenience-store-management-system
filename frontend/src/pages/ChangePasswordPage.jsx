import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { getRoleHomePath } from '../auth/roles';
import { getErrorMessage } from '../api';
import { FormField, Notice, PageHeader } from '../components';
import { changePassword } from '../services/auth.service';

function ChangePasswordPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [form, setForm] = useState({
    currentPassword: '',
    newPassword: '',
    newPasswordConfirmation: '',
  });
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const updateField = (event) => {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (!form.currentPassword || form.newPassword.length < 6) {
      setError('Mật khẩu hiện tại là bắt buộc và mật khẩu mới phải có ít nhất 6 ký tự.');
      return;
    }
    if (form.newPassword !== form.newPasswordConfirmation) {
      setError('Xác nhận mật khẩu mới chưa khớp.');
      return;
    }

    setIsSubmitting(true);
    try {
      await changePassword(form);
      setForm({ currentPassword: '', newPassword: '', newPasswordConfirmation: '' });
      setSuccess('Mật khẩu đã được thay đổi thành công.');
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="narrow-page">
      <PageHeader
        title="Đổi mật khẩu"
        description="Màn hình bảo mật dùng chung cho mọi tài khoản đã đăng nhập."
      />
      <form className="form-card" onSubmit={handleSubmit} noValidate>
        <Notice tone="success">{success}</Notice>
        <Notice tone="error">{error}</Notice>
        <FormField htmlFor="currentPassword" label="Mật khẩu hiện tại" required>
          <input
            autoComplete="current-password"
            id="currentPassword"
            name="currentPassword"
            type="password"
            value={form.currentPassword}
            onChange={updateField}
          />
        </FormField>
        <FormField htmlFor="newPassword" label="Mật khẩu mới" hint="Tối thiểu 6 ký tự." required>
          <input
            autoComplete="new-password"
            id="newPassword"
            name="newPassword"
            type="password"
            value={form.newPassword}
            onChange={updateField}
          />
        </FormField>
        <FormField htmlFor="newPasswordConfirmation" label="Xác nhận mật khẩu mới" required>
          <input
            autoComplete="new-password"
            id="newPasswordConfirmation"
            name="newPasswordConfirmation"
            type="password"
            value={form.newPasswordConfirmation}
            onChange={updateField}
          />
        </FormField>
        <div className="inline-actions">
          <button className="button button--primary" disabled={isSubmitting} type="submit">
            {isSubmitting ? 'Đang lưu…' : 'Lưu mật khẩu mới'}
          </button>
          <button
            className="button button--ghost"
            type="button"
            onClick={() => navigate(getRoleHomePath(user.role))}
          >
            Hủy thao tác
          </button>
        </div>
      </form>
    </section>
  );
}

export default ChangePasswordPage;
