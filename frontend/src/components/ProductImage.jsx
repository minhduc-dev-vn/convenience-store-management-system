import { useEffect, useState } from 'react';

export function getProductInitials(name = '') {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(-2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || 'SP';
}

function ProductImage({ className = '', imageUrl, name, loading = 'lazy' }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [imageUrl]);

  const classes = ['product-image', className].filter(Boolean).join(' ');
  if (imageUrl && !failed) {
    return (
      <div className={classes}>
        <img
          src={imageUrl}
          alt={name}
          loading={loading}
          onError={() => setFailed(true)}
        />
      </div>
    );
  }

  return (
    <div className={classes} role="img" aria-label={`Hình minh họa ${name}`}>
      <span aria-hidden="true">{getProductInitials(name)}</span>
    </div>
  );
}

export default ProductImage;
