import { Link } from 'react-router-dom';

function NotFoundPage() {
  return (
    <section className="not-found-page">
      <p className="not-found-code">404</p>
      <h1>Không tìm thấy trang</h1>
      <p>Đường dẫn bạn truy cập không tồn tại trong hệ thống.</p>
      <Link className="button button--primary" to="/">Về trang tổng quan</Link>
    </section>
  );
}

export default NotFoundPage;
