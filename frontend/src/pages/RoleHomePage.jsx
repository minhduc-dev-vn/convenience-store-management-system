import { EmptyState } from '../components/StateViews';

function RoleHomePage({ eyebrow, title, description }) {
  return (
    <section className="placeholder-page">
      <div className="page-heading">
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <EmptyState
        title="Không gian đã sẵn sàng"
        message="Các màn hình chi tiết sẽ được bổ sung đúng thứ tự phát triển của dự án."
      />
    </section>
  );
}

export default RoleHomePage;
