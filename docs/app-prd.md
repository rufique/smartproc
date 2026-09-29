## SmartProc — Product Requirements Document

### 1. Overview
SmartProc is an iOS app for retailers/wholesalers that turns supplier invoices, price lists, and catalogs (image, PDF, Excel) into a structured, always-current product-vendor price catalog, then helps the user assemble the cheapest possible purchase order and stay ahead of stockouts — all scoped per company workspace, priced in USD.

### 2. Core User & Problem
Retail/procurement operators receive supplier price lists in inconsistent formats (photos of price sheets, PDFs, Excel sheets) and manually cross-reference prices across vendors to decide what to buy and from whom — slow, error-prone, and blind to substitute products or usual restock needs.

### 3. Key Features

**3.1 Authentication & Workspaces**
- Email/password login, account creation, forgot password.
- User can create multiple company workspaces, each with a name and an assigned industry category (Healthcare & Pharmaceuticals, Building & Hardware, Food & Grocery Retail, etc.).
- All catalog, vendor, procurement, and analytics data is scoped to the active workspace; user can switch workspaces from Profile.

**3.2 Smart Ingestion**
- Upload JPEG/JPG/PNG, PDF, or Excel (.xlsx/.csv).
- Hybrid upload UX: primary scan-style flow with live progress/read-out; secondary plain file picker.
- OCR/AI extraction pulls: product name, unit price, (optionally) quantity/unit, and vendor (from file metadata or user-tagged at upload).
- On extraction, system matches against existing catalog entries (fuzzy name match) to update price on existing product-vendor record, or creates a new record if no match.
- User reviews/confirms extracted rows before committing (edit name, price, vendor, quantity) to correct OCR errors.

**3.3 Product Catalog**
- Central catalog, sectioned/filterable by vendor, grouped/ungrouped status, low-stock.
- Search by product name.
- Each product record: name, vendor(s), price(s) per vendor, last updated date, stock/restock cadence data.
- Product grouping: user can link multiple differently-named products as functional substitutes (e.g., generic drug equivalents). Grouped products display a "linked" badge and count; substitute group is treated as one purchasable "need" in procurement.
- CRUD: add/edit/delete product, manage vendor assignment, manage group membership.

**3.4 Procurement / Purchase Order Builder**
- User selects a list of products (or substitute groups) to procure.
- App compiles a comparison table per product/group:
  - Lowest price + vendor
  - Next-best option price + vendor
  - Line total (low scenario), line total (mid/next-option scenario)
- Aggregate summary: total at lowest possible pricing vs. median-range total (mixing in next-option prices).
- User can adjust chosen vendor per line if desired (override lowest pick).
- Generate final purchase order; export as PDF document or Excel file (formatted with vendor groupings/line items/totals).

**3.5 Suggestions Engine**
- Triggered after a fresh upload that changes prices, or accessible anytime.
- "You usually buy these too": surfaces products/groups with regular purchase history that are absent from the current draft order, based on purchase cadence.
- Shows last-purchased date and typical reorder interval per suggested item.
- One-tap "add all to order" or add individually.

**3.6 Purchase Pattern Monitoring & Restock Alerts**
- Tracks historical purchase quantities and dates per product (from generated/confirmed purchase orders).
- Computes typical reorder cadence per product.
- Dashboard surfaces restock urgency (e.g., "3 days left") based on consumption rate vs. current cadence.
- Price-change feed on dashboard: recent vendor price increases/decreases from latest uploads, with visual up/down indicators.

**3.7 Dashboard (Home)**
- Workspace context header (active company + quick stats: SKUs tracked, vendors tracked).
- Restock urgency list/chart.
- Recent price-change feed.
- Quick access to upload.

**3.8 Profile**
- User info, workspace switcher/list (with industry tags), add new workspace, currency setting (USD), notifications, log out.

### 4. Data Model (high-level)
- **User**: id, name, email, auth credentials.
- **Workspace (Company)**: id, name, industry category, owner/user link, currency (USD default).
- **Vendor**: id, workspace_id, name, contact info (optional).
- **Product**: id, workspace_id, name, unit, current price(s) by vendor, group_id (nullable), created/updated timestamps, source_upload_id.
- **ProductGroup**: id, workspace_id, name/label, member product_ids.
- **PriceHistory**: id, product_id, vendor_id, price, recorded_at, source_upload_id.
- **Upload**: id, workspace_id, file_type, file_url, status, extracted_row_count, uploaded_at.
- **PurchaseOrder**: id, workspace_id, created_at, line_items[], total_low, total_mid, export_format.
- **PurchaseOrderLine**: product_id/group_id, chosen_vendor_id, unit_price, quantity, line_total.
- **PurchaseHistory/Pattern**: product_id, quantities over time, computed avg_cadence_days, last_purchased_at.

### 5. Non-functional Requirements
- OCR/AI extraction should handle noisy phone-photo images and varied Excel/PDF layouts; include a manual-correction step (never silently trust extraction).
- Currency: USD throughout, 2-decimal precision, monospaced digit display.
- Data isolation strictly per workspace.
- Exports must be shareable via iOS share sheet (PDF/XLSX file).
- Offline-tolerant catalog browsing (cached), online required for upload/extraction.

### 6. Out of Scope (v1)
- Multi-user roles/permissions within a workspace (single owner/user per workspace for v1).
- Direct vendor ordering/integration (export only, no automated sending).
- Multi-currency conversion.

### 7. Success Metrics
- % of uploads requiring no manual correction.
- Average time to build a purchase order.
- $ saved (lowest vs. median total) per order.
- Restock alerts leading to timely reorder (no stockouts).
