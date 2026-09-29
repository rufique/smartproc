const DAY_MS = 24 * 60 * 60 * 1000;

/** USD, 2-decimal precision (PRD 5). Digits are displayed monospaced by <Money/>. */
export function formatMoney(value: number | null | undefined): string {
  const amount = Number.isFinite(value ?? NaN) ? (value as number) : 0;
  const sign = amount < 0 ? '-' : '';
  const fixed = Math.abs(amount).toFixed(2);
  const [whole, decimals] = fixed.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}$${grouped}.${decimals}`;
}

/** Compact money for tight table cells: $1,824 (no decimals). */
export function formatMoneyShort(value: number | null | undefined): string {
  const amount = Number.isFinite(value ?? NaN) ? (value as number) : 0;
  const sign = amount < 0 ? '-' : '';
  const whole = Math.round(Math.abs(amount));
  return `${sign}$${String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

export function relTime(iso: string | number | Date | null | undefined): string {
  if (!iso) return 'never';
  const date = iso instanceof Date ? iso : new Date(iso);
  const diff = Date.now() - date.getTime();
  if (diff < 0) return 'just now';
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`;
  const years = Math.floor(months / 12);
  return `${years} year${years === 1 ? '' : 's'} ago`;
}

export function daysAgo(iso: string | number | Date): number {
  const date = iso instanceof Date ? iso : new Date(iso);
  return Math.max(Math.floor((Date.now() - date.getTime()) / DAY_MS), 0);
}

export function formatDate(iso: string | number | Date | null | undefined): string {
  if (!iso) return '—';
  const date = iso instanceof Date ? iso : new Date(iso);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export const INDUSTRY_ICON: Record<string, { emoji: string; tint: string }> = {
  'Healthcare & Pharmaceuticals': { emoji: '💊', tint: 'bg-[#E7EEF7]' },
  'Building & Hardware': { emoji: '🔨', tint: 'bg-[#F1EDE6]' },
  'Food & Grocery Retail': { emoji: '🛒', tint: 'bg-[#E6F3EA]' },
  'Electronics & Appliances': { emoji: '🔌', tint: 'bg-[#E8EDF7]' },
  'Agriculture & Agrochemicals': { emoji: '🌱', tint: 'bg-[#E9F4E4]' },
  'Fashion & Apparel': { emoji: '👔', tint: 'bg-[#F5EAF3]' },
  'Industrial & Manufacturing': { emoji: '🏭', tint: 'bg-[#ECEFF3]' },
  'Hospitality Supplies': { emoji: '🛎️', tint: 'bg-[#F7F0E4]' },
  Other: { emoji: '🏢', tint: 'bg-[#ECEFF3]' },
};
