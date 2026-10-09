import { Link } from 'react-router-dom';
import { PageHeader } from '../../../components';

const reports = [
  {
    title: 'Doanh thu',
    description: 'Doanh thu gộp, tiền hoàn, doanh thu thuần, số hóa đơn và xu hướng theo ngày.',
    to: '/manager/reports/revenue',
  },
  {
    title: 'Hàng hóa và nhập hàng',
    description: 'Tỷ trọng ngành hàng, sản phẩm bán chạy/chậm, tồn kho và chi phí nhập hàng.',
    to: '/manager/reports/merchandise',
  },
  {
    title: 'Nhân viên và ca làm việc',
    description: 'Hiệu suất thu ngân, doanh thu theo nhân viên và đối chiếu từng ca làm việc.',
    to: '/manager/reports/workforce',
  },
];

function ReportsDashboardPage() {
  return (
    <section className="workspace-page">
      <PageHeader
        title="Dashboard báo cáo"
        description="Chọn nhóm báo cáo để xem dữ liệu giao dịch thực tế. Các phép tổng hợp do SQL Server thực hiện và API MANAGER cung cấp."
      />
      <div className="dashboard-grid report-dashboard-grid">
        {reports.map((report) => (
          <article className="action-card" key={report.to}>
            <h2>{report.title}</h2>
            <p>{report.description}</p>
            <Link className="button button--primary" to={report.to}>Mở báo cáo</Link>
          </article>
        ))}
      </div>
      <aside className="report-decision-note">
        <strong>Phạm vi chỉ số hiện tại</strong>
        <p>Lợi nhuận ước tính chưa được hiển thị vì công thức nghiệp vụ chưa được chốt. Dashboard chỉ trình bày doanh thu và các số liệu đã có nguồn tính authoritative.</p>
      </aside>
    </section>
  );
}

export default ReportsDashboardPage;
