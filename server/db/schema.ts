import {
  boolean,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  // Bumped to invalidate every previously issued JWT (logout, password reset).
  tokenVersion: integer('token_version').notNull().default(0),
  resetToken: text('reset_token'),
  resetTokenExpiresAt: timestamp('reset_token_expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const workspaces = pgTable(
  'workspaces',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    industry: text('industry').notNull().default('Other'),
    currency: text('currency').notNull().default('USD'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('workspaces_user_idx').on(t.userId)]
);

export const vendors = pgTable(
  'vendors',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    contact: text('contact'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('vendors_workspace_idx').on(t.workspaceId)]
);

export const productGroups = pgTable(
  'product_groups',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('product_groups_workspace_idx').on(t.workspaceId)]
);

export const products = pgTable(
  'products',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    unit: text('unit').notNull().default('unit'),
    category: text('category').notNull().default(''),
    stockQty: numeric('stock_qty', { precision: 12, scale: 2 }),
    lowStockThreshold: numeric('low_stock_threshold', { precision: 12, scale: 2 }),
    groupId: uuid('group_id').references(() => productGroups.id, { onDelete: 'set null' }),
    sourceUploadId: uuid('source_upload_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('products_workspace_idx').on(t.workspaceId),
    index('products_group_idx').on(t.groupId),
  ]
);

export const productPrices = pgTable(
  'product_prices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    vendorId: uuid('vendor_id')
      .notNull()
      .references(() => vendors.id, { onDelete: 'cascade' }),
    price: numeric('price', { precision: 12, scale: 2 }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('product_prices_product_idx').on(t.productId),
    index('product_prices_vendor_idx').on(t.vendorId),
    uniqueIndex('product_prices_product_vendor_uidx').on(t.productId, t.vendorId),
  ]
);

export const uploads = pgTable(
  'uploads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    fileName: text('file_name').notNull(),
    fileType: text('file_type').notNull(), // image | pdf | excel
    status: text('status').notNull().default('processing'), // processing | review | committed | discarded
    demoPreview: boolean('demo_preview').notNull().default(false),
    taggedVendorId: uuid('tagged_vendor_id'),
    extractedRowCount: integer('extracted_row_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('uploads_workspace_idx').on(t.workspaceId)]
);

export const uploadRows = pgTable(
  'upload_rows',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    uploadId: uuid('upload_id')
      .notNull()
      .references(() => uploads.id, { onDelete: 'cascade' }),
    rowIndex: integer('row_index').notNull().default(0),
    name: text('name').notNull(),
    price: numeric('price', { precision: 12, scale: 2 }),
    vendorName: text('vendor_name'),
    quantity: text('quantity'),
    status: text('status').notNull().default('pending'), // pending | confirmed | skipped
    matchedProductId: uuid('matched_product_id'),
  },
  (t) => [index('upload_rows_upload_idx').on(t.uploadId)]
);

export const priceHistory = pgTable(
  'price_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    vendorId: uuid('vendor_id')
      .notNull()
      .references(() => vendors.id, { onDelete: 'cascade' }),
    price: numeric('price', { precision: 12, scale: 2 }).notNull(),
    previousPrice: numeric('previous_price', { precision: 12, scale: 2 }),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
    sourceUploadId: uuid('source_upload_id'),
  },
  (t) => [index('price_history_workspace_idx').on(t.workspaceId)]
);

export const purchaseOrders = pgTable(
  'purchase_orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('draft'), // draft | finalized
    totalLow: numeric('total_low', { precision: 12, scale: 2 }).notNull().default('0'),
    totalMid: numeric('total_mid', { precision: 12, scale: 2 }).notNull().default('0'),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    finalizedAt: timestamp('finalized_at', { withTimezone: true }),
  },
  (t) => [index('purchase_orders_workspace_idx').on(t.workspaceId)]
);

export const purchaseOrderLines = pgTable(
  'purchase_order_lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => purchaseOrders.id, { onDelete: 'cascade' }),
    productId: uuid('product_id').references(() => products.id, { onDelete: 'cascade' }),
    groupId: uuid('group_id').references(() => productGroups.id, { onDelete: 'set null' }),
    chosenVendorId: uuid('chosen_vendor_id').references(() => vendors.id, { onDelete: 'set null' }),
    quantity: integer('quantity').notNull().default(1),
    unitPrice: numeric('unit_price', { precision: 12, scale: 2 }),
    lineTotal: numeric('line_total', { precision: 12, scale: 2 }),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [index('purchase_order_lines_order_idx').on(t.orderId)]
);

export const purchaseEvents = pgTable(
  'purchase_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    vendorId: uuid('vendor_id').references(() => vendors.id, { onDelete: 'set null' }),
    orderId: uuid('order_id').references(() => purchaseOrders.id, { onDelete: 'set null' }),
    quantity: integer('quantity').notNull().default(1),
    unitPrice: numeric('unit_price', { precision: 12, scale: 2 }),
    purchasedAt: timestamp('purchased_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('purchase_events_workspace_idx').on(t.workspaceId),
    index('purchase_events_product_idx').on(t.productId),
  ]
);

export type User = typeof users.$inferSelect;
export type Workspace = typeof workspaces.$inferSelect;
export type Vendor = typeof vendors.$inferSelect;
export type Product = typeof products.$inferSelect;
