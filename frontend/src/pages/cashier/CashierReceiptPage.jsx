import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { getErrorMessage } from '../../api/errors';
import { ErrorState, LoadingState } from '../../components';
import ReceiptView from '../../components/pos/ReceiptView';
import { getPosReceipt } from '../../services/pos.service';

function CashierReceiptPage() {
  const { invoiceId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const initialReceipt = location.state?.receipt?.invoiceId === invoiceId
    ? location.state.receipt
    : null;
  const [receipt, setReceipt] = useState(initialReceipt);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(!initialReceipt);

  const loadReceipt = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const data = await getPosReceipt(invoiceId);
      setReceipt(data.receipt);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setIsLoading(false);
    }
  }, [invoiceId]);

  useEffect(() => {
    loadReceipt();
  }, [loadReceipt]);

  if (isLoading && !receipt) return <LoadingState message="Đang tải hóa đơn đã lưu" />;
  if (error && !receipt) return <ErrorState message={error} onRetry={loadReceipt} />;

  return (
    <section className="workspace-page cashier-pos-page">
      <ReceiptView
        receipt={receipt}
        onPrint={() => window.print()}
        onNewOrder={() => navigate('/cashier/pos', { replace: true })}
      />
    </section>
  );
}

export default CashierReceiptPage;
