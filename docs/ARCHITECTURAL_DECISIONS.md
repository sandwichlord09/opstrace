# OpsTrace Architectural Decisions

This document explains the core engineering trade-offs behind OpsTrace in plain language for system design review and interview study.

---

## 1. Modular Monolith vs. Microservices

**Decision:** Build `apps/api` as a NestJS modular monolith (`auth`, `warehouses`, `products`, `suppliers`, `purchase-orders`, `imports`, `goods-receipts`, `exceptions`, `stock-inspections`, `audit-logs`, `attachments`, `sync`, `analytics`) backed by a single PostgreSQL database.

**Why:**
- **ACID Transactions Across Domains:** Submitting a Goods Receipt must atomically persist the receipt, re-evaluate Purchase Order status, update Inventory Snapshots, raise Exceptions, write an Audit Log, and record an Idempotency key. In a monolith sharing one PostgreSQL database, this happens inside a single `prisma.$transaction()` with zero distributed-transaction complexity (no sagas or two-phase commits).
- **Clear Module Boundaries:** Each NestJS module owns its controller, service, and domain logic without reaching into unrelated tables arbitrarily, making future extraction (e.g., moving `imports` or `analytics` to a separate worker) straightforward if scale ever demands it.

---

## 2. Multi-Tenant Isolation via `AsyncLocalStorage` + `TenantContext`

**Decision:** Resolve the authenticated user's `organizationId` inside `JwtAuthGuard` (verified against live `memberships` on every request), store it in Node's `AsyncLocalStorage` via `TenantContext`, and require every service query to read `organizationId` from `TenantContext.getOrFail()`.

**Why:**
- **No Client Spoofing:** Request bodies and query parameters never supply `organizationId`. Even if a malicious client sends someone else's UUID in a route param (`GET /exceptions/:id`), the service executes `findFirst({ where: { id, organizationId } })`, returning `404 Not Found`.
- **Live Revocation:** Because `JwtAuthGuard` checks `memberships.status === 'ACTIVE'` on every request, suspending a user takes effect immediately rather than waiting for JWT expiration.

---

## 3. Deterministic Reconciliation Inside `prisma.$transaction()`

**Decision:** Implement `reconcile()` in `apps/api/src/goods-receipts/reconciliation.engine.ts` as a pure, side-effect-free TypeScript function executed inside `GoodsReceiptsService.submit()`'s `prisma.$transaction()`.

**Why:**
- **Zero External Dependencies & Testability:** Pure functions are trivial to unit test exhaustively (exact match, multi-receipt partial accumulation, over-delivery, final short-delivery, damaged goods exclusion, unexpected items, and severity thresholds) without mocking a database.
- **Accumulation Over All Receipts:** A PO can arrive in 3 partial deliveries (`40 + 30 + 30`). The engine aggregates **all** submitted receipts for that PO rather than looking only at the latest delivery.
- **Quarantine of Damaged Goods:** `acceptedQuantity = receivedQuantity - damagedQuantity`. Only the current receipt's accepted delta enters `inventory_snapshots`, preventing damaged stock from inflating sellable inventory.

---

## 4. `Decimal` vs. `Float` for Financial Accuracy

**Decision:** Store `purchase_order_items.unit_price` as PostgreSQL `DECIMAL(12, 2)` (`Prisma.Decimal`) and validate monetary strings/numbers strictly via Zod (`^\d+(\.\d{1,2})?$`), never using IEEE-754 floating-point arithmetic.

**Why:**
- Binary floating-point math (`0.1 + 0.2 === 0.30000000000000004`) introduces rounding drift across multi-line Purchase Orders and financial reconciliation reports. `Decimal(12, 2)` guarantees exact base-10 cent precision.

---

## 5. Presigned S3 URLs for Evidence Photos

**Decision:** Generate short-lived (300-second) presigned `PUT` and `GET` URLs against SeaweedFS/S3 (`@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`) instead of proxying binary image uploads through NestJS.

**Why:**
- **API Scalability:** Binary streams bypass the Node.js event loop and go straight from mobile/web clients to object storage.
- **Tenant & Path Security:** Storage keys are generated server-side as `{organizationId}/{entityType}/{entityId}/{uuid}` (never using user-supplied filenames in the S3 path), and `GET /attachments/:id/download-url` verifies `organizationId` ownership before signing.

---

## 6. Client-Generated UUID Idempotency Keys for Offline SQLite Sync

**Decision:** Require a client-generated UUID `idempotencyKey` on receiving and stock inspection endpoints, backed by `UNIQUE(organizationId, idempotencyKey)` in `sync_operations`.

**Why:**
- **Safe Mobile Retries:** Warehouses frequently have dead Wi-Fi zones. If `apps/mobile` submits a receipt, loses connectivity before receiving the HTTP `201`, and retries later from its `expo-sqlite` queue, the server detects the existing `sync_operations` row inside the transaction and returns the original record without duplicating inventory or exceptions.
- **Partial-Failure Isolation in Batches:** `POST /api/v1/sync/receiving` and `POST /api/v1/sync/inspections` return per-item results (`SYNCED`, `DUPLICATE_SKIPPED`, `FAILED`) so one invalid offline draft never blocks valid records behind it in the queue.
