import { describe, expect, it } from 'vitest';
import { normalizeBarcode } from './barcode';

describe('normalizeBarcode', () => {
  it('keeps EAN-13 and EAN-8', () => {
    expect(normalizeBarcode('7038010055720')).toBe('7038010055720');
    expect(normalizeBarcode(' 12345670 ')).toBe('12345670');
  });

  it('converts UPC-A and GTIN-14 to EAN-13', () => {
    expect(normalizeBarcode('012345678905')).toBe('0012345678905');
    expect(normalizeBarcode('07038010055720')).toBe('7038010055720');
  });

  it('extracts GTIN from GS1 Digital Link QR codes', () => {
    expect(normalizeBarcode('https://id.gs1.org/01/07038010055720/10/ABC')).toBe('7038010055720');
    expect(normalizeBarcode('(01)07038010055720(17)261231')).toBe('7038010055720');
  });

  it('rejects unrelated QR content', () => {
    expect(normalizeBarcode('https://example.com')).toBeNull();
    expect(normalizeBarcode('abc')).toBeNull();
  });
});
