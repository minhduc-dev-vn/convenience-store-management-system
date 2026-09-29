import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getErrorMessage } from '../../api';
import {
  AsyncContent,
  ConfirmDialog,
  DataTable,
  FormField,
  Modal,
  Notice,
  PageHeader,
} from '../../components';
import {
  addReceiptLine,
  createReceiptDraft,
  deleteReceiptLine,
  getReceipt,
  listReceivingProducts,
  listReceivingSuppliers,
  updateReceiptDraft,
  updateReceiptLine,
} from '../../services/receiving.service';
import {
  buildLinePayload,
  buildReceiptPayload,
  createEmptyReceiptForm,
  EMPTY_LINE_FORM,
  lineToForm,
  receiptToForm,
  validateLineForm,
  validateReceiptForm,
} from './receivingForms';

const money = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 2,
});

function LineForm({ isSubmitting, line, onCancel, onSubmit, products }) {
  const [form, setForm] = useState(() => (line ? lineToForm(line) : { ...EMPTY_LINE_FORM }));
  const [errors, setErrors] = useState({});
  const update = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const submit = (event) => {
    event.preventDefault();
    const nextErrors = validateLineForm(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length === 0) onSubmit(buildLinePayload(form));
  };

  return (
    <form className="admin-form" onSubmit={submit} noValidate>
      <div className="form-grid form-grid--two">
        <FormField htmlFor="receivingProduct" label="Sản phẩm nhập" required error={errors.productId}>
          <select id="receivingProduct" value={form.productId} onChange={(event) => update('productId', event.target.value)} autoFocus>
            <option value="">Chọn sản phẩm</option>
            {products.map((product) => (
              <option key={product.productId} value={product.productId}>
                {product.productId} · {product.name} ({product.unit})
              </option>
            ))}
          </select>
        </FormField>
        <FormField htmlFor="manufacturerLot" label="Số lô sản xuất" required error={errors.manufacturerLot}>
          <input id="manufacturerLot" maxLength="50" value={form.manufacturerLot} onChange={(event) => update('manufacturerLot', event.target.value)} />
        </FormField>
        <FormField htmlFor="manufactureDate" label="Ngày sản xuất" error={errors.manufactureDate}>
          <input id="manufactureDate" type="date" value={form.manufactureDate} onChange={(event) => update('manufactureDate', event.target.value)} />
        </FormField>
        <FormField htmlFor="expiryDate" label="Hạn sử dụng" error={errors.expiryDate}>
          <input id="expiryDate" type="date" min={form.manufactureDate || undefined} value={form.expiryDate} onChange={(event) => update('expiryDate', event.target.value)} />
        </FormField>
        <FormField htmlFor="receivingQuantity" label="Số lượng nhập" required error={errors.quantity}>
          <input id="receivingQuantity" type="number" min="1" step="1" value={form.quantity} onChange={(event) => update('quantity', event.target.value)} />
        </FormField>
        <FormField htmlFor="receivingUnitCost" label="Đơn giá nhập" required error={errors.unitCost}>
          <input id="receivingUnitCost" type="number" min="0" step="0.01" value={form.unitCost} onChange={(event) => update('unitCost', event.target.value)} />
        </FormField>
      </div>
      <p className="form-note">Hạn sử dụng phải sau ngày sản xuất. Tổng dòng và tổng phiếu do backend tính từ dữ liệu đã lưu.</p>
      <div className="modal__actions">
        <button className="button button--ghost" type="button" onClick={onCancel} disabled={isSubmitting}>Hủy</button>
        <button className="button button--primary" type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Đang lưu…' : line ? 'Lưu thay đổi' : 'Thêm vào phiếu nhập'}
        </button>
      </div>
    </form>
  );
}

function ReceivingEditorPage() {
  const { receiptId } = useParams();
  const navigate = useNavigate();
  const [receipt, setReceipt] = useState(null);
  const [form, setForm] = useState(() => createEmptyReceiptForm());
  const [formErrors, setFormErrors] = useState({});
  const [options, setOptions] = useState({ products: [], suppliers: [] });
  const [state, setState] = useState({ error: null, isLoading: Boolean(receiptId) });
  const [optionsError, setOptionsError] = useState(null);
  const [lineEditor, setLineEditor] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [success, setSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isDraft = !receipt || receipt.status === 'DRAFT';

  const loadReceipt = useCallback(async (signal) => {
    if (!receiptId) return;
    setState({ error: null, isLoading: true });
    try {
      const data = await getReceipt(receiptId, { signal });
      setReceipt(data);
      setForm(receiptToForm(data));
      setState({ error: null, isLoading: false });
    } catch (error) {
      if (error.name !== 'AbortError') setState({ error, isLoading: false });
    }
  }, [receiptId]);

  const loadOptions = useCallback(async (signal) => {
    try {
      const [suppliers, products] = await Promise.all([
        listReceivingSuppliers({ page: 1, pageSize: 100 }, { signal }),
        listReceivingProducts({ page: 1, pageSize: 100 }, { signal }),
      ]);
      setOptions({ suppliers: suppliers.items, products: products.items });
      setOptionsError(null);
    } catch (error) {
      if (error.name !== 'AbortError') setOptionsError(error);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadReceipt(controller.signal);
    loadOptions(controller.signal);
    return () => controller.abort();
  }, [loadOptions, loadReceipt]);

  const updateHeaderField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setFormErrors((current) => ({ ...current, [field]: undefined }));
  };

  const saveHeader = async (event) => {
    event.preventDefault();
    const errors = validateReceiptForm(form);
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setIsSubmitting(true);
    setActionError(null);
    try {
      const payload = buildReceiptPayload(form);
      const saved = receipt
        ? await updateReceiptDraft(receipt.receiptId, payload)
        : await createReceiptDraft(payload);
      setReceipt(saved);
      setForm(receiptToForm(saved));
      setSuccess(receipt ? 'Đã cập nhật thông tin phiếu nháp.' : `Đã tạo phiếu nháp ${saved.receiptId}.`);
      if (!receiptId) navigate(`/warehouse/receiving/${saved.receiptId}/edit`, { replace: true });
    } catch (error) {
      setActionError(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const saveLine = async (payload) => {
    setIsSubmitting(true);
    setActionError(null);
    try {
      const saved = lineEditor.line
        ? await updateReceiptLine(receipt.receiptId, lineEditor.line.detailId, payload)
        : await addReceiptLine(receipt.receiptId, payload);
      setReceipt(saved);
      setLineEditor(null);
      setSuccess(lineEditor.line ? 'Đã cập nhật dòng hàng nhập.' : 'Đã thêm mặt hàng vào phiếu nhập.');
    } catch (error) {
      setActionError(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const removeLine = async () => {
    setIsSubmitting(true);
    setActionError(null);
    try {
      const saved = await deleteReceiptLine(receipt.receiptId, deleteTarget.detailId);
      setReceipt(saved);
      setDeleteTarget(null);
      setSuccess('Đã xóa dòng hàng khỏi phiếu nháp.');
    } catch (error) {
      setActionError(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const columns = useMemo(() => [
    { key: 'product', header: 'Sản phẩm', render: (line) => <span className="owner-cell"><strong>{line.product.name}</strong><small>{line.product.productId}</small></span> },
    { key: 'manufacturerLot', header: 'Số lô' },
    { key: 'manufactureDate', header: 'NSX', render: (line) => line.manufactureDate || '—' },
    { key: 'expiryDate', header: 'HSD', render: (line) => line.expiryDate || '—' },
    { key: 'quantity', header: 'Số lượng' },
    { key: 'unitCost', header: 'Đơn giá', render: (line) => money.format(line.unitCost) },
    { key: 'lineTotal', header: 'Thành tiền', render: (line) => money.format(line.lineTotal) },
    ...(isDraft ? [{
      key: 'actions',
      header: 'Thao tác',
      render: (line) => (
        <div className="table-actions">
          <button className="table-action" type="button" onClick={() => { setActionError(null); setLineEditor({ line }); }}>Sửa</button>
          <button className="table-action table-action--danger" type="button" onClick={() => { setActionError(null); setDeleteTarget(line); }}>Xóa</button>
        </div>
      ),
    }] : []),
  ], [isDraft]);

  return (
    <section className="workspace-page">
      <PageHeader
        eyebrow="MH-11 · F20"
        title={receipt ? `Phiếu nhập ${receipt.receiptId}` : 'Lập phiếu nhập kho'}
        description="Lưu thông tin nhà cung cấp trước, sau đó thêm các mặt hàng và lô vào phiếu nháp."
        actions={receipt && (
          <Link className="button button--ghost" to={`/warehouse/receiving?receiptId=${encodeURIComponent(receipt.receiptId)}`}>
            Mở bước xác nhận
          </Link>
        )}
      />
      <Notice tone="success">{success}</Notice>
      <Notice tone="error">{(actionError || optionsError) && getErrorMessage(actionError || optionsError)}</Notice>

      <AsyncContent
        error={state.error}
        isLoading={state.isLoading}
        loadingMessage="Đang tải phiếu nhập…"
        onRetry={() => loadReceipt()}
      >
        {!isDraft && receipt && (
          <Notice tone="warning">Phiếu có trạng thái {receipt.status} nên chỉ được xem, không thể chỉnh sửa.</Notice>
        )}

        <form className="receiving-header-card" onSubmit={saveHeader} noValidate>
          <div className="receiving-card-heading">
            <div>
              <p className="eyebrow">Thông tin phiếu</p>
              <h2>{receipt?.receiptId || 'Mã phiếu do hệ thống tự sinh'}</h2>
            </div>
            {receipt && <span className={`status-badge status-badge--${receipt.status.toLowerCase()}`}>{receipt.status}</span>}
          </div>
          <div className="form-grid receiving-header-grid">
            <FormField htmlFor="receivingSupplier" label="Nhà cung cấp" required error={formErrors.supplierId}>
              <select id="receivingSupplier" value={form.supplierId} disabled={!isDraft} onChange={(event) => updateHeaderField('supplierId', event.target.value)}>
                <option value="">Chọn nhà cung cấp</option>
                {options.suppliers.map((supplier) => (
                  <option key={supplier.supplierId} value={supplier.supplierId}>{supplier.supplierId} · {supplier.name}</option>
                ))}
              </select>
            </FormField>
            <FormField htmlFor="receivedAt" label="Ngày nhập hàng" required error={formErrors.receivedAt}>
              <input id="receivedAt" type="datetime-local" value={form.receivedAt} disabled={!isDraft} onChange={(event) => updateHeaderField('receivedAt', event.target.value)} />
            </FormField>
            <FormField htmlFor="receiptNote" label="Ghi chú" error={formErrors.note}>
              <textarea id="receiptNote" rows="3" maxLength="255" value={form.note} disabled={!isDraft} onChange={(event) => updateHeaderField('note', event.target.value)} />
            </FormField>
          </div>
          {isDraft && (
            <div className="receiving-header-actions">
              <button className="button button--primary" type="submit" disabled={isSubmitting || Boolean(optionsError)}>
                {isSubmitting ? 'Đang lưu…' : receipt ? 'Lưu thay đổi phiếu' : 'Lưu bản nháp'}
              </button>
            </div>
          )}
        </form>

        {receipt && (
          <section className="receiving-lines-section">
            <div className="section-heading section-heading--compact">
              <div>
                <p className="eyebrow">Chi tiết hàng nhập</p>
                <h3>{receipt.lineCount} dòng hàng</h3>
              </div>
              {isDraft && (
                <button className="button button--primary" type="button" onClick={() => { setActionError(null); setLineEditor({ line: null }); }}>
                  Thêm mặt hàng
                </button>
              )}
            </div>
            <DataTable
              caption="Chi tiết hàng nhập"
              columns={columns}
              emptyMessage="Phiếu nhập chưa có mặt hàng."
              getRowKey={(line) => line.detailId}
              rows={receipt.lines}
            />
            <div className="receiving-total">
              <span>Tổng tiền phiếu nhập</span>
              <strong>{money.format(receipt.total)}</strong>
            </div>
          </section>
        )}
      </AsyncContent>

      {lineEditor && (
        <Modal
          title={lineEditor.line ? 'Cập nhật dòng hàng nhập' : 'Thêm mặt hàng vào phiếu'}
          description="Dữ liệu lô được kiểm tra lại tại backend trước khi lưu."
          onClose={() => !isSubmitting && setLineEditor(null)}
          size="large"
        >
          <Notice tone="error">{actionError && getErrorMessage(actionError)}</Notice>
          <LineForm
            isSubmitting={isSubmitting}
            line={lineEditor.line}
            onCancel={() => setLineEditor(null)}
            onSubmit={saveLine}
            products={options.products}
          />
        </Modal>
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Xóa dòng hàng khỏi phiếu nháp?"
          description={`${deleteTarget.product.name} · lô ${deleteTarget.manufacturerLot}. Tồn kho chưa thay đổi ở bước này.`}
          confirmLabel="Xóa dòng hàng"
          error={actionError && getErrorMessage(actionError)}
          isSubmitting={isSubmitting}
          onCancel={() => !isSubmitting && setDeleteTarget(null)}
          onConfirm={removeLine}
        />
      )}
    </section>
  );
}

export default ReceivingEditorPage;
