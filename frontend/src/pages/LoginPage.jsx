import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { getRoleHomePath } from '../auth/roles';
import { useAuth } from '../auth/AuthContext';
import { FormField, Notice } from '../components';
import { getErrorMessage } from '../api';

function LoginPage() {
  const { login } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [form, setForm] = useState({ identifier: '', password: '', remember: false });
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const updateField = (event) => {
    const { checked, name, type, value } = event.target;
    setForm((current) => ({ ...current, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);

    if (!form.identifier.trim() || !form.password) {
      setError('Vui lòng nhập đầy đủ tài khoản và mật khẩu.');
      return;
    }

    setIsSubmitting(true);
    try {
      const session = await login(
        { identifier: form.identifier.trim(), password: form.password },
        { remember: form.remember },
      );
      navigate(getRoleHomePath(session.user.role), { replace: true });
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="auth-shell">
      <div className="auth-intro">
        <h1>Tiếp tục công việc theo đúng vai trò của bạn.</h1>
        <p>
          Một tài khoản dùng chung cho khách hàng, thu ngân, nhân viên kho và quản lý.
          Quyền truy cập được xác nhận bởi hệ thống sau khi đăng nhập.
        </p>
      </div>

      <form className="form-card" onSubmit={handleSubmit} noValidate>
        <div className="form-card__heading">
          <h2>Đăng nhập</h2>
          <p>Nhập tên đăng nhập, số điện thoại hoặc email đã đăng ký.</p>
        </div>

        {location.state?.registrationSuccess && (
          <Notice tone="success">Đăng ký thành công. Bạn có thể đăng nhập ngay.</Notice>
        )}
        <Notice tone="error">{error}</Notice>

        <FormField htmlFor="identifier" label="Tên đăng nhập hoặc số điện thoại" required>
          <input
            autoComplete="username"
            id="identifier"
            name="identifier"
            value={form.identifier}
            onChange={updateField}
          />
        </FormField>
        <FormField htmlFor="password" label="Mật khẩu" required>
          <input
            autoComplete="current-password"
            id="password"
            name="password"
            type="password"
            value={form.password}
            onChange={updateField}
          />
        </FormField>

        <label className="check-field" htmlFor="remember">
          <input
            checked={form.remember}
            id="remember"
            name="remember"
            type="checkbox"
            onChange={updateField}
          />
          <span>Ghi nhớ đăng nhập trên trình duyệt này</span>
        </label>

        <button className="button button--primary button--block" disabled={isSubmitting} type="submit">
          {isSubmitting ? 'Đang đăng nhập…' : 'Đăng nhập'}
        </button>
        <p className="form-card__footer">
          Chưa có tài khoản thành viên? <Link to="/auth/register">Đăng ký khách hàng</Link>
        </p>
      </form>
    </section>
  );
}

export default LoginPage;
