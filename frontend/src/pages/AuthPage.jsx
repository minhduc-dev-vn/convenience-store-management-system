import { EmptyState } from '../components/StateViews';

function AuthPage() {
  return (
    <section className="placeholder-page">
      <div className="page-heading">
        <p className="eyebrow">AUTH</p>
        <h1>Khu vực xác thực</h1>
        <p>Route nền tảng cho luồng đăng nhập và đăng ký ở các prompt nghiệp vụ sau.</p>
      </div>
      <EmptyState
        title="Chưa triển khai biểu mẫu xác thực"
        message="C02 chỉ khởi tạo cấu trúc và điều hướng; không triển khai trước chức năng nghiệp vụ."
      />
    </section>
  );
}

export default AuthPage;
