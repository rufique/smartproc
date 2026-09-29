import '../env';

import { hashSync } from 'bcryptjs';
import { eq } from 'drizzle-orm';

import { db } from './index';
import {
  priceHistory,
  productGroups,
  productPrices,
  products,
  purchaseEvents,
  purchaseOrderLines,
  purchaseOrders,
  uploadRows,
  uploads,
  users,
  vendors,
  workspaces,
} from './schema';

const DEMO_EMAIL = 'amara@westendpharm.com';
const DEMO_PASSWORD = 'password123';
const DAY = 24 * 60 * 60 * 1000;

const daysAgo = (days: number, hour = 9) => {
  const d = new Date(Date.now() - days * DAY);
  d.setHours(hour, 41, 0, 0);
  return d;
};

const money = (value: number) => value.toFixed(2);

/** Repeat a purchase every `intervalDays`, most recent `lastDays` ago, going back ~6 months. */
function cadence(lastDays: number, intervalDays: number): Date[] {
  const out: Date[] = [];
  for (let d = lastDays; d <= 185; d += intervalDays) out.push(daysAgo(d));
  return out.reverse(); // chronological
}

async function main() {
  // Re-seed = wipe the demo account and everything that cascades from it.
  const [existing] = await db.select().from(users).where(eq(users.email, DEMO_EMAIL));
  if (existing) {
    await db.delete(users).where(eq(users.id, existing.id));
    console.log('Removed previous demo account.');
  }

  const [user] = await db
    .insert(users)
    .values({
      name: 'Amara Boateng',
      email: DEMO_EMAIL,
      passwordHash: hashSync(DEMO_PASSWORD, 10),
    })
    .returning();

  const wsRows = await db
    .insert(workspaces)
    .values([
      { userId: user!.id, name: 'Westend Pharmacy', industry: 'Healthcare & Pharmaceuticals' },
      { userId: user!.id, name: 'Boateng Hardware Supplies', industry: 'Building & Hardware' },
      { userId: user!.id, name: 'Fresh Grocers Ltd', industry: 'Food & Grocery Retail' },
    ])
    .returning();
  const ws = wsRows[0]!; // active workspace
  const [, wsHardware, wsGrocers] = wsRows;

  const vendorRows = await db
    .insert(vendors)
    .values([
      { workspaceId: ws.id, name: 'MedSup Ltd', contact: 'orders@medsup.example' },
      { workspaceId: ws.id, name: 'PharmaCore', contact: 'sales@pharmacore.example' },
      { workspaceId: ws.id, name: 'Vitalis Distributors', contact: 'hello@vitalis.example' },
    ])
    .returning();
  const [medsup, pharmacore, vitalis] = vendorRows;

  // Substitute group (4 members -> "3 linked substitutes" badge)
  const [group] = await db
    .insert(productGroups)
    .values({ workspaceId: ws.id, label: 'Amoxicillin 500mg' })
    .returning();

  type SeedProduct = {
    name: string;
    category: string;
    unit?: string;
    stock?: number;
    threshold?: number;
    grouped?: boolean;
    offers: { vendor: 'medsup' | 'pharmacore' | 'vitalis'; price: number }[];
  };

  const seedProducts: SeedProduct[] = [
    {
      name: 'Amoxicillin 500mg',
      category: 'Antibiotic',
      unit: 'box',
      stock: 22,
      threshold: 10,
      grouped: true,
      offers: [
        { vendor: 'medsup', price: 12.5 },
        { vendor: 'pharmacore', price: 13.9 },
      ],
    },
    {
      name: 'Amoxil 500mg',
      category: 'Antibiotic',
      unit: 'box',
      grouped: true,
      offers: [
        { vendor: 'medsup', price: 13.9 },
        { vendor: 'vitalis', price: 14.4 },
      ],
    },
    {
      name: 'Amoxicillin Caps 500',
      category: 'Antibiotic',
      unit: 'box',
      grouped: true,
      offers: [{ vendor: 'pharmacore', price: 12.8 }],
    },
    {
      name: 'Moxatil 500',
      category: 'Antibiotic',
      unit: 'box',
      grouped: true,
      offers: [{ vendor: 'vitalis', price: 13.2 }],
    },
    {
      name: 'Paracetamol 500mg',
      category: 'Analgesic',
      unit: 'pack',
      stock: 8,
      threshold: 15,
      offers: [
        { vendor: 'vitalis', price: 4.1 },
        { vendor: 'medsup', price: 4.5 },
      ],
    },
    {
      name: 'Paracetamol Syrup',
      category: 'Analgesic',
      unit: 'bottle',
      stock: 26,
      threshold: 10,
      offers: [
        { vendor: 'vitalis', price: 3.75 },
        { vendor: 'medsup', price: 3.9 },
      ],
    },
    {
      name: 'Surgical Gloves M',
      category: 'Medical Supplies',
      unit: 'box',
      stock: 9,
      threshold: 5,
      offers: [
        { vendor: 'pharmacore', price: 205 },
        { vendor: 'medsup', price: 210 },
      ],
    },
    {
      name: 'Saline 500ml',
      category: 'IV Fluids',
      unit: 'bag',
      offers: [
        { vendor: 'vitalis', price: 95 },
        { vendor: 'pharmacore', price: 98 },
      ],
    },
    {
      name: 'Ibuprofen 200mg',
      category: 'Analgesic',
      unit: 'pack',
      offers: [
        { vendor: 'medsup', price: 7.6 },
        { vendor: 'vitalis', price: 8.2 },
      ],
    },
    {
      name: 'Cotton Rolls 500g',
      category: 'Consumables',
      unit: 'roll',
      offers: [
        { vendor: 'pharmacore', price: 365 },
        { vendor: 'vitalis', price: 375 },
      ],
    },
    {
      name: 'Alcohol Swabs 100s',
      category: 'Consumables',
      unit: 'box',
      offers: [
        { vendor: 'medsup', price: 18.5 },
        { vendor: 'pharmacore', price: 19 },
      ],
    },
    {
      name: 'Latex Gloves S',
      category: 'Medical Supplies',
      unit: 'box',
      offers: [
        { vendor: 'pharmacore', price: 42 },
        { vendor: 'vitalis', price: 44.5 },
      ],
    },
    {
      name: 'Antiseptic Solution 1L',
      category: 'Antiseptics',
      unit: 'bottle',
      offers: [{ vendor: 'medsup', price: 24.5 }],
    },
  ];

  const vendorMap = { medsup: medsup!, pharmacore: pharmacore!, vitalis: vitalis! } as const;
  const productRows = [];
  for (const seed of seedProducts) {
    const [product] = await db
      .insert(products)
      .values({
        workspaceId: ws.id,
        name: seed.name,
        unit: seed.unit ?? 'unit',
        category: seed.category,
        stockQty: seed.stock === undefined ? null : String(seed.stock),
        lowStockThreshold: seed.threshold === undefined ? null : String(seed.threshold),
        groupId: seed.grouped ? group!.id : null,
      })
      .returning();
    productRows.push(product!);
  }

  const byName = new Map(productRows.map((p) => [p.name, p]));
  const priceRows = [];
  for (const seed of seedProducts) {
    const product = byName.get(seed.name)!;
    for (const offer of seed.offers) {
      priceRows.push({
        workspaceId: ws.id,
        productId: product.id,
        vendorId: vendorMap[offer.vendor].id,
        price: money(offer.price),
        updatedAt: daysAgo(1),
      });
    }
  }
  await db.insert(productPrices).values(priceRows);

  // Recent price-change feed (from the latest upload, ~2h ago)
  const [upload] = await db
    .insert(uploads)
    .values({
      workspaceId: ws.id,
      fileName: 'medsup-price-list-june.xlsx',
      fileType: 'excel',
      status: 'committed',
      extractedRowCount: 8,
      createdAt: daysAgo(0, 7),
    })
    .returning();

  await db.insert(priceHistory).values([
    {
      workspaceId: ws.id,
      productId: byName.get('Ibuprofen 200mg')!.id,
      vendorId: medsup!.id,
      price: money(7.6),
      previousPrice: money(8.2),
      recordedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      sourceUploadId: upload!.id,
    },
    {
      workspaceId: ws.id,
      productId: byName.get('Cotton Rolls 500g')!.id,
      vendorId: pharmacore!.id,
      price: money(365),
      previousPrice: money(340),
      recordedAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
      sourceUploadId: upload!.id,
    },
    {
      workspaceId: ws.id,
      productId: byName.get('Saline 500ml')!.id,
      vendorId: vitalis!.id,
      price: money(95),
      previousPrice: money(95),
      recordedAt: new Date(Date.now() - 4 * 60 * 60 * 1000),
      sourceUploadId: upload!.id,
    },
  ]);

  await db.insert(uploadRows).values(
    seedProducts.slice(0, 8).map((seed, i) => ({
      uploadId: upload!.id,
      rowIndex: i,
      name: seed.name,
      price: money(seed.offers[0].price),
      vendorName: vendorMap[seed.offers[0].vendor].name,
      status: 'confirmed' as const,
      matchedProductId: byName.get(seed.name)!.id,
    }))
  );

  // Purchase history: drives cadence, restock urgency, suggestions and the trend chart.
  const cadencePlan: {
    name: string;
    lastDays: number;
    interval: number;
    qty: number;
    price: number;
    vendor: 'medsup' | 'pharmacore' | 'vitalis';
  }[] = [
    { name: 'Amoxicillin 500mg', lastDays: 3, interval: 7, qty: 50, price: 12.5, vendor: 'medsup' },
    {
      name: 'Paracetamol Syrup',
      lastDays: 5,
      interval: 14,
      qty: 60,
      price: 3.75,
      vendor: 'vitalis',
    },
    {
      name: 'Surgical Gloves M',
      lastDays: 9,
      interval: 30,
      qty: 30,
      price: 205,
      vendor: 'pharmacore',
    },
    { name: 'Ibuprofen 200mg', lastDays: 11, interval: 21, qty: 80, price: 7.6, vendor: 'medsup' },
    { name: 'Saline 500ml', lastDays: 14, interval: 30, qty: 20, price: 95, vendor: 'vitalis' },
    {
      name: 'Latex Gloves S',
      lastDays: 19,
      interval: 14,
      qty: 30,
      price: 42,
      vendor: 'pharmacore',
    },
    {
      name: 'Cotton Rolls 500g',
      lastDays: 6,
      interval: 21,
      qty: 40,
      price: 365,
      vendor: 'pharmacore',
    },
    {
      name: 'Antiseptic Solution 1L',
      lastDays: 30,
      interval: 28,
      qty: 12,
      price: 24.5,
      vendor: 'medsup',
    },
    {
      name: 'Alcohol Swabs 100s',
      lastDays: 38,
      interval: 42,
      qty: 20,
      price: 18.5,
      vendor: 'medsup',
    },
  ];

  const eventValues = [];
  for (const plan of cadencePlan) {
    const product = byName.get(plan.name);
    if (!product) continue;
    for (const at of cadence(plan.lastDays, plan.interval)) {
      eventValues.push({
        workspaceId: ws.id,
        productId: product.id,
        vendorId: vendorMap[plan.vendor].id,
        quantity: plan.qty,
        unitPrice: money(plan.price),
        purchasedAt: at,
      });
    }
  }
  if (eventValues.length) await db.insert(purchaseEvents).values(eventValues);

  // Draft order: 7 products selected (matches the Procure screen)
  const draftLines: { name: string; qty: number }[] = [
    { name: 'Amoxicillin 500mg', qty: 50 },
    { name: 'Paracetamol 500mg', qty: 100 },
    { name: 'Surgical Gloves M', qty: 10 },
    { name: 'Saline 500ml', qty: 10 },
    { name: 'Ibuprofen 200mg', qty: 100 },
    { name: 'Cotton Rolls 500g', qty: 3 },
    { name: 'Alcohol Swabs 100s', qty: 10 },
  ];

  const [order] = await db
    .insert(purchaseOrders)
    .values({ workspaceId: ws.id, status: 'draft' })
    .returning();

  const priceFor = new Map(priceRows.map((p) => [`${p.productId}:${p.vendorId}`, Number(p.price)]));
  let totalLow = 0;
  let totalMid = 0;
  const lineValues = draftLines.map((line, i) => {
    const product = byName.get(line.name)!;
    const seed = seedProducts.find((s) => s.name === line.name)!;
    const prices = seed.offers
      .map((o) => priceFor.get(`${product.id}:${vendorMap[o.vendor].id}`) ?? o.price)
      .sort((a, b) => a - b);
    const low = prices[0] ?? 0;
    const mid = prices[1] ?? low;
    totalLow += low * line.qty;
    totalMid += mid * line.qty;
    return {
      orderId: order!.id,
      productId: product.id,
      quantity: line.qty,
      sortOrder: i,
    };
  });
  await db.insert(purchaseOrderLines).values(lineValues);
  await db
    .update(purchaseOrders)
    .set({ totalLow: money(totalLow), totalMid: money(totalMid) })
    .where(eq(purchaseOrders.id, order!.id));

  // Second/third workspaces start empty (workspace switching is visibly scoped).
  void wsHardware;
  void wsGrocers;

  console.log('Seed complete.');
  console.log(`  Demo login: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  console.log(`  Workspace:  ${ws.name}`);
  console.log(
    `  Products:   ${productRows.length} | Vendors: ${vendorRows.length} | Events: ${eventValues.length}`
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  });
