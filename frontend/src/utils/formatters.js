export function formatCurrency(value, type = 'crypto', symbol = '') {
  if (value === undefined || value === null || isNaN(value)) return '$0.00';
  
  const symUpper = String(symbol).toUpperCase();

  // Format Gold (XAU / GC=F)
  if (symUpper === 'GC=F' || symUpper.includes('XAU') || symUpper === 'GOLD') {
    return `$${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  
  // Format Forex Currency Pairs (EUR/USD, USD/JPY, etc)
  if ((type === 'forex' || symUpper.includes('=X')) && !symUpper.includes('XAU') && symUpper !== 'GC=F') {
    return Number(value).toFixed(4);
  }
  
  // Kripto mikro (< $1.0)
  if (value < 1.0) {
    return `$${Number(value).toFixed(4)}`;
  }
  
  return `$${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
    compactDisplay: 'short'
  }).format(value);
}

export function formatDateShort(dateStr) {
  if (!dateStr) return '—';
  // Input bisa "2024-11-15" atau "2024-11-15 09:00"
  const parts = String(dateStr).split(' ');
  const d = parts[0];
  const t = parts[1];
  const [y, m, day] = d.split('-');
  if (!y || !m || !day) return dateStr;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  return t ? `${day} ${months[Number(m) - 1]} '${y.slice(2)} ${t.slice(0, 5)}` : `${day} ${months[Number(m) - 1]} '${y.slice(2)}`;
}
