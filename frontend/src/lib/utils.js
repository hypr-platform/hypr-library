/**
 * Procedural gradient generator for deck thumbnails (when real thumbnail unavailable).
 * Based on HYPR brand palette.
 */
const GRADIENT_PALETTE = [
  ['#0F1830', '#1A7DB5'],
  ['#11151D', '#2DA0DE'],
  ['#1A7DB5', '#2DA0DE'],
  ['#0B0E14', '#3F4651'],
  ['#1F242E', '#1A7DB5'],
  ['#0F1830', '#3F4651'],
  ['#2DA0DE', '#5FB8E8'],
  ['#0B0E14', '#1A7DB5'],
  ['#11151D', '#1F242E'],
  ['#1A7DB5', '#0F1830'],
];

export function gradientFor(seed) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) % GRADIENT_PALETTE.length;
  }
  const [a, b] = GRADIENT_PALETTE[h];
  return `linear-gradient(135deg, ${a} 0%, ${b} 100%)`;
}

/**
 * Clean noisy HYPR naming convention into a more readable card title.
 * "HYPR | ADIDAS | RUNNING | AUDIENCE DISCOVERY" → "ADIDAS | RUNNING"
 */
export function cleanTitle(rawTitle) {
  return rawTitle
    .replace(/^HYPR\s*[|_]\s*/i, '')
    .replace(/\s*[|]\s*AUDIENCE DISCOVERY/i, '')
    .replace(/AudienceDiscovery/gi, '')
    .replace(/_/g, ' ')
    .trim();
}

/**
 * Format bytes to human-readable.
 */
export function formatBytes(bytes) {
  if (!bytes) return '—';
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
}

/**
 * Format ISO timestamp to short PT-BR date.
 */
export function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('pt-BR', {
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}
