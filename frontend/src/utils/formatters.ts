/**
 * Formatting utilities for monetary values, timestamps, and coordinates
 */

/**
 * Formats integer minor units (paise) into INR currency string
 * Avoids floating-point math inaccuracies by doing clean integer division
 */
export function formatPaise(minorUnits: string | number | undefined | null): string {
  if (minorUnits === undefined || minorUnits === null) return '₹0.00';
  const numeric = typeof minorUnits === 'string' ? parseInt(minorUnits, 10) : minorUnits;
  if (isNaN(numeric)) return '₹0.00';

  const rupees = numeric / 100;
  return rupees.toLocaleString('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Formats an ISO-8601 date string to human-readable date
 */
export function formatDate(isoString: string | undefined | null): string {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    return d.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return isoString;
  }
}

/**
 * Formats an ISO-8601 date string to date and time
 */
export function formatDateTime(isoString: string | undefined | null): string {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    return d.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return isoString;
  }
}

/**
 * Human-readable freshness label
 */
export function getFreshnessLabel(freshness: 'CURRENT' | 'STALE' | 'UNAVAILABLE', elapsedSeconds: number): string {
  switch (freshness) {
    case 'CURRENT':
      return `LIVE — Updated ${elapsedSeconds}s ago`;
    case 'STALE':
      return `DELAYED — Last seen ${Math.floor(elapsedSeconds / 60)}m ago`;
    case 'UNAVAILABLE':
    default:
      return 'OFFLINE — Vehicle off-duty / Shift ended';
  }
}
