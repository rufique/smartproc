import * as XLSX from 'xlsx';

export type ExtractedRow = {
  name: string;
  price: number | null;
  vendorName: string | null;
  quantity: string | null;
};

const HEADER_NAME = /name|product|item|description|sku|article/i;
const HEADER_PRICE = /price|rate|amount|cost|unit\s*price|sell/i;
const HEADER_VENDOR = /vendor|supplier|company|source|distributor/i;
const HEADER_QTY = /qty|quantity|pack|units/i;

function parsePrice(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/[^0-9.,-]/g, '').replace(/,/g, '');
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Pulls product rows out of an .xlsx / .csv buffer (base64).
 * Handles common header layouts and falls back to positional [name, price] columns.
 */
export function extractRowsFromWorkbook(base64: string): ExtractedRow[] {
  const workbook = XLSX.read(base64, { type: 'base64' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  const sheet = workbook.Sheets[sheetName];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  if (!raw.length) return [];

  const keys = Object.keys(raw[0]);
  const pick = (re: RegExp) => keys.find((k) => re.test(k));
  const nameKey = pick(HEADER_NAME) ?? keys[0];
  const priceKey = pick(HEADER_PRICE) ?? keys.find((k) => k !== nameKey) ?? keys[1];
  const vendorKey = pick(HEADER_VENDOR);
  const qtyKey = pick(HEADER_QTY);

  const rows: ExtractedRow[] = [];
  for (const rawRow of raw) {
    const name = String(rawRow[nameKey] ?? '')
      .trim()
      .slice(0, 160);
    if (!name || /^(name|product|item|description)$/i.test(name)) continue;
    const price = parsePrice(rawRow[priceKey]);
    const vendorName = vendorKey
      ? String(rawRow[vendorKey] ?? '')
          .trim()
          .slice(0, 120) || null
      : null;
    const quantity = qtyKey
      ? String(rawRow[qtyKey] ?? '')
          .trim()
          .slice(0, 40) || null
      : null;
    rows.push({ name, price, vendorName, quantity });
    if (rows.length >= 500) break;
  }
  return rows;
}
