import { getErrorMessage } from '../api';
import { EmptyState, ErrorState, LoadingState } from './StateViews';

function AsyncContent({
  children,
  emptyMessage,
  emptyTitle,
  error,
  isEmpty = false,
  isLoading = false,
  loadingMessage,
  onRetry,
}) {
  if (isLoading) return <LoadingState message={loadingMessage} />;
  if (error) return <ErrorState message={getErrorMessage(error)} onRetry={onRetry} />;

  if (isEmpty) {
    return <EmptyState title={emptyTitle} message={emptyMessage} />;
  }

  return children;
}

export default AsyncContent;
