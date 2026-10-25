export function formatCurrency(value, type = 'crypto', symbol = '') {
  if (value === undefined || value === null || isNaN(value)) return '$0.00';
  const num = Number(value);
  const abs = Math.abs(num);

  if (abs === 0) return '$0.00';
  if (abs < 0.0001) {
    return `$${num.toFixed(8)}`;
  }
  if (abs < 0.01) {
    return `$${num.toFixed(6)}`;
  }
  if (abs < 1.0) {
    return `$${num.toFixed(4)}`;
  }
  if (abs < 10.0) {
    return `$${num.toFixed(4)}`;
  }
  return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatPercent(value) {
  if (value === undefined || value === null || isNaN(value)) return '0.00%';
  const num = Number(value);
  const sign = num > 0 ? '+' : '';
  return `${sign}${num.toFixed(2)}%`;
}

export function formatCompactNumber(value) {
  if (!value || isNaN(value)) return '0';
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    compactDisplay: 'short',
  }).format(value);
}

export function formatDateShort(dateStr) {
  if (!dateStr) return '—';
  const parts = String(dateStr).split(' ');
  const d = parts[0];
  const t = parts[1];
  const [y, m, day] = d.split('-');
  if (!y || !m || !day) return dateStr;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  return t ? `${day} ${months[Number(m) - 1]} '${y.slice(2)} ${t.slice(0, 5)}` : `${day} ${months[Number(m) - 1]} '${y.slice(2)}`;
}
