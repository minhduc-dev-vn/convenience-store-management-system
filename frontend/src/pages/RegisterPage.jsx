import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getErrorMessage } from '../api';
import { FormField, Notice } from '../components';
import { registerCustomer } from '../services/auth.service';

const initialForm = {
  fullName: '',
  phone: '',
  email: '',
  dateOfBirth: '',
  password: '',
  passwordConfirmation: '',
};

function validateRegistration(form) {
  if (!form.fullName.trim()) return 'Vui lòng nhập họ và tên.';
  if (!/^\+?[0-9]{9,15}$/.test(form.phone.trim())) {
    return 'Số điện thoại phải có từ 9 đến 15 chữ số.';
  }
  if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
    return 'Email không đúng định dạng.';
  }
  if (form.password.length < 6) return 'Mật khẩu phải có ít nhất 6 ký tự.';
  if (form.password !== form.passwordConfirmation) return 'Xác nhận mật khẩu chưa khớp.';
  return null;
}

function RegisterPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const updateField = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const validationMessage = validateRegistration(form);
    setError(validationMessage);
    if (validationMessage) return;

    setIsSubmitting(true);
    try {
      await registerCustomer({
        fullName: form.fullName.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || undefined,
        dateOfBirth: form.dateOfBirth || undefined,
        password: form.password,
        passwordConfirmation: form.passwordConfirmation,
      });
      navigate('/auth/login', { replace: true, state: { registrationSuccess: true } });
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="auth-shell auth-shell--register">
      <div className="auth-intro">
        <h1>Tạo tài khoản khách hàng.</h1>
        <p>
          Đăng ký để xem lịch sử mua hàng, điểm tích lũy và quản lý thông tin liên hệ cá nhân.
        </p>
      </div>

      <form className="form-card form-card--wide" onSubmit={handleSubmit} noValidate>
        <div className="form-card__heading">
          <h2>Đăng ký thành viên</h2>
          <p>Số điện thoại được dùng làm tên đăng nhập của tài khoản khách hàng.</p>
        </div>
        <Notice tone="error">{error}</Notice>

        <div className="form-grid">
          <FormField htmlFor="fullName" label="Họ và tên" required>
            <input id="fullName" name="fullName" value={form.fullName} onChange={updateField} />
          </FormField>
          <FormField htmlFor="phone" label="Số điện thoại" required>
            <input
              autoComplete="tel"
              id="phone"
              inputMode="tel"
              name="phone"
              value={form.phone}
              onChange={updateField}
            />
          </FormField>
          <FormField htmlFor="email" label="Email">
            <input
              autoComplete="email"
              id="email"
              name="email"
              type="email"
              value={form.email}
              onChange={updateField}
            />
          </FormField>
          <FormField htmlFor="dateOfBirth" label="Ngày sinh">
            <input
              id="dateOfBirth"
              max={new Date().toISOString().slice(0, 10)}
              name="dateOfBirth"
              type="date"
              value={form.dateOfBirth}
              onChange={updateField}
            />
          </FormField>
          <FormField htmlFor="registerPassword" label="Mật khẩu" required>
            <input
              autoComplete="new-password"
              id="registerPassword"
              name="password"
              type="password"
              value={form.password}
              onChange={updateField}
            />
          </FormField>
          <FormField htmlFor="passwordConfirmation" label="Xác nhận mật khẩu" required>
            <input
              autoComplete="new-password"
              id="passwordConfirmation"
              name="passwordConfirmation"
              type="password"
              value={form.passwordConfirmation}
              onChange={updateField}
            />
          </FormField>
        </div>

        <button className="button button--primary button--block" disabled={isSubmitting} type="submit">
          {isSubmitting ? 'Đang tạo tài khoản…' : 'Hoàn tất đăng ký'}
        </button>
        <p className="form-card__footer"><Link to="/auth/login">Quay lại đăng nhập</Link></p>
      </form>
    </section>
  );
}

export default RegisterPage;
