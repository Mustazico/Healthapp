/**
 * Normalises a scanned code to an EAN/GTIN usable for lookup.
 * Handles EAN-8/13, UPC-A (12 digits) and GS1 QR codes / Digital Link URLs carrying a GTIN-14 (AI 01).
 */
export function normalizeBarcode(text: string): string | null {
  const t = text.trim();
  if (/^\d{8,14}$/.test(t)) {
    if (t.length === 12) return '0' + t;
    if (t.length === 14 && t.startsWith('0')) return t.slice(1);
    return t;
  }
  const m = t.match(/(?:\/01\/|\(01\)|^01)(\d{14})/);
  if (m) return m[1].startsWith('0') ? m[1].slice(1) : m[1];
  return null;
}

export function isValidEan(s: string): boolean {
  return /^\d{8,14}$/.test(s);
}
