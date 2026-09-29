import { Directory, File } from 'expo-file-system';
import { cacheDirectory, writeAsStringAsync } from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import * as XLSX from 'xlsx';

import { formatMoney } from './format';

export type ExportLine = {
  label: string;
  quantity: number;
  vendorId: string | null;
  vendorName: string;
  unitPrice: number;
  lineTotalLow: number;
  lineTotalMid: number;
  nextVendorName: string | null;
  nextPrice: number | null;
};

export type ExportOrder = {
  orderId: string;
  createdAt: string;
  workspaceName: string;
  totalLow: number;
  totalMid: number;
  lines: ExportLine[];
};

const PDF_MIME = 'application/pdf';
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function groupByVendor(order: ExportOrder): { vendorName: string; lines: ExportLine[] }[] {
  const map = new Map<string, ExportLine[]>();
  for (const line of order.lines) {
    const list = map.get(line.vendorName) ?? [];
    list.push(line);
    map.set(line.vendorName, list);
  }
  return [...map.entries()]
    .map(([vendorName, lines]) => ({ vendorName, lines }))
    .sort((a, b) => a.vendorName.localeCompare(b.vendorName));
}

function orderNumber(order: ExportOrder): string {
  return `PO-${order.orderId.slice(0, 8).toUpperCase()}`;
}

async function shareFile(uri: string, mimeType: string, dialogTitle: string, uti: string) {
  const available = await Sharing.isAvailableAsync();
  if (!available) {
    throw new Error('Sharing is not available on this device');
  }
  await Sharing.shareAsync(uri, { mimeType, dialogTitle, UTI: uti });
}

/**
 * Write a file into a folder the user picks (Downloads/Documents on Android, Files on iOS).
 * Returns the destination URI.
 */
async function saveToDevice(
  sourceUri: string,
  fileName: string,
  mimeType: string
): Promise<string> {
  if (Platform.OS === 'web') {
    throw new Error('Saving to the device is only available in the mobile app');
  }
  const directory = await Directory.pickDirectoryAsync();
  let destination: File;
  try {
    destination = directory.createFile(fileName, mimeType);
  } catch {
    // A file with this name already exists — replace it.
    destination = new File(directory, fileName);
    try {
      destination.delete();
    } catch {
      /* nothing to remove */
    }
  }
  destination.write(await new File(sourceUri).bytes());
  return destination.uri;
}

/* ------------------------------------------------------------------ PDF */

function buildOrderHtml(order: ExportOrder): string {
  const groups = groupByVendor(order);
  const rowsHtml = groups
    .map((group) => {
      const vendorTotal = group.lines.reduce((sum, l) => sum + l.lineTotalLow, 0);
      return `
        <tr class="vendor"><td colspan="5">${escapeHtml(group.vendorName)}</td></tr>
        ${group.lines
          .map(
            (line) => `<tr>
              <td>${escapeHtml(line.label)}</td>
              <td class="num">${line.quantity}</td>
              <td class="num">${formatMoney(line.unitPrice)}</td>
              <td class="num">${formatMoney(line.lineTotalLow)}</td>
              <td class="muted">${escapeHtml(line.nextVendorName ?? '—')}${
                line.nextPrice !== null ? ` · ${formatMoney(line.nextPrice)}` : ''
              }</td>
            </tr>`
          )
          .join('')}
        <tr class="subtotal"><td colspan="3">Vendor subtotal</td><td class="num">${formatMoney(vendorTotal)}</td><td></td></tr>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #0F172B; padding: 32px; font-size: 13px; }
  h1 { font-size: 24px; margin: 0; }
  .sub { color: #64748B; margin-top: 4px; font-size: 12px; }
  .badge { display: inline-block; background: #E7EEF7; color: #5B7FA6; border-radius: 999px; padding: 4px 10px; font-size: 11px; font-weight: 700; margin-top: 10px; }
  table { width: 100%; border-collapse: collapse; margin-top: 22px; }
  th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: .06em; color: #94A3B8; border-bottom: 2px solid #E7ECF2; padding: 8px 6px; }
  td { padding: 8px 6px; border-bottom: 1px solid #EDF1F6; vertical-align: top; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  tr.vendor td { background: #F5F7FA; font-weight: 700; }
  tr.subtotal td { font-weight: 600; background: #FAFBFD; }
  .muted { color: #94A3B8; font-size: 11px; }
  .totals { margin-top: 26px; margin-left: auto; width: 260px; }
  .totals .row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #E7ECF2; }
  .totals .big { font-size: 18px; font-weight: 800; }
  .foot { margin-top: 34px; color: #94A3B8; font-size: 10px; }
</style>
</head>
<body>
  <h1>Purchase Order</h1>
  <div class="sub">${escapeHtml(order.workspaceName)} · ${new Date(
    order.createdAt
  ).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })}</div>
  <div class="badge">${orderNumber(order)} · ${order.lines.length} lines</div>
  <table>
    <thead>
      <tr>
        <th>Product</th>
        <th class="num">Qty</th>
        <th class="num">Unit price</th>
        <th class="num">Line total</th>
        <th>Next best option</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  <div class="totals">
    <div class="row"><span>Lowest possible total</span><span class="big">${formatMoney(order.totalLow)}</span></div>
    <div class="row"><span>Median-range total</span><span>${formatMoney(order.totalMid)}</span></div>
    <div class="row"><span>Potential saving</span><span>${formatMoney(order.totalMid - order.totalLow)}</span></div>
  </div>
  <div class="foot">Generated by SmartProc — smarter purchasing, healthier tomorrows.</div>
</body>
</html>`;
}

/** Render the order to a PDF in the cache directory and return its URI. */
async function writeOrderPdf(order: ExportOrder): Promise<string> {
  const { uri } = await Print.printToFileAsync({ html: buildOrderHtml(order) });
  return uri;
}

/* ---------------------------------------------------------------- Excel */

/** Build the order as an .xlsx file in the cache directory and return its URI. */
async function writeOrderExcel(order: ExportOrder): Promise<string> {
  const groups = groupByVendor(order);
  const rows: Record<string, string | number>[] = [
    {
      Vendor: order.workspaceName,
      Product: `Purchase order ${orderNumber(order)}`,
      Qty: '',
      'Unit price': '',
      'Line total (low)': '',
      'Next option': '',
      'Line total (mid)': '',
    },
  ];
  for (const group of groups) {
    rows.push({
      Vendor: group.vendorName,
      Product: '',
      Qty: '',
      'Unit price': '',
      'Line total (low)': '',
      'Next option': '',
      'Line total (mid)': '',
    });
    for (const line of group.lines) {
      rows.push({
        Vendor: '',
        Product: line.label,
        Qty: line.quantity,
        'Unit price': line.unitPrice.toFixed(2),
        'Line total (low)': line.lineTotalLow.toFixed(2),
        'Next option': line.nextVendorName
          ? `${line.nextVendorName}${line.nextPrice !== null ? ` @ ${line.nextPrice.toFixed(2)}` : ''}`
          : '',
        'Line total (mid)': line.lineTotalMid.toFixed(2),
      });
    }
  }
  rows.push({
    Vendor: '',
    Product: 'LOWEST POSSIBLE TOTAL',
    Qty: '',
    'Unit price': '',
    'Line total (low)': order.totalLow.toFixed(2),
    'Next option': '',
    'Line total (mid)': '',
  });
  rows.push({
    Vendor: '',
    Product: 'MEDIAN-RANGE TOTAL',
    Qty: '',
    'Unit price': '',
    'Line total (low)': '',
    'Next option': '',
    'Line total (mid)': order.totalMid.toFixed(2),
  });

  const worksheet = XLSX.utils.json_to_sheet(rows);
  worksheet['!cols'] = [
    { wch: 22 },
    { wch: 30 },
    { wch: 6 },
    { wch: 12 },
    { wch: 16 },
    { wch: 26 },
    { wch: 16 },
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Purchase Order');

  const base64 = XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' });
  const path = `${cacheDirectory ?? ''}smartproc-${orderNumber(order)}.xlsx`;
  await writeAsStringAsync(path, base64, { encoding: 'base64' });
  return path;
}

/* --------------------------------------------------------------- public */

/** Share the finalized order as a PDF via the platform share sheet. */
export async function exportOrderPdf(order: ExportOrder): Promise<void> {
  const uri = await writeOrderPdf(order);
  await shareFile(uri, PDF_MIME, `Purchase order ${orderNumber(order)}`, 'com.adobe.pdf');
}

/** Share the finalized order as an Excel file via the platform share sheet. */
export async function exportOrderExcel(order: ExportOrder): Promise<void> {
  const uri = await writeOrderExcel(order);
  await shareFile(
    uri,
    XLSX_MIME,
    `Purchase order ${orderNumber(order)}`,
    'com.microsoft.excel.xlsx'
  );
}

/** Save the order PDF into a folder the user picks on the device. */
export async function saveOrderPdf(order: ExportOrder): Promise<string> {
  const uri = await writeOrderPdf(order);
  return saveToDevice(uri, `${orderNumber(order)}.pdf`, PDF_MIME);
}

/** Save the order Excel file into a folder the user picks on the device. */
export async function saveOrderExcel(order: ExportOrder): Promise<string> {
  const uri = await writeOrderExcel(order);
  return saveToDevice(uri, `${orderNumber(order)}.xlsx`, XLSX_MIME);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
