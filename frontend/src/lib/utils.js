import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { formatDistanceToNow, format } from 'date-fns';

export function cn(...inputs) { return twMerge(clsx(inputs)); }
export function formatNumber(n) { return n?.toLocaleString() ?? '0'; }
export function formatDate(d) {
  if (!d) return '';
  try { return format(new Date(d), 'MMM d, yyyy'); } catch { return ''; }
}
export function formatRelativeTime(d) {
  if (!d) return '';
  try { return formatDistanceToNow(new Date(d), { addSuffix: true }); } catch { return ''; }
}
export function debounce(fn, delay) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); };
}
