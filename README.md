# OpsTrace — Operational Discrepancy & Evidence Management Platform

OpsTrace connects physical warehouse operations with digital ERP/procurement records. It detects receiving discrepancies and inventory variances using deterministic business rules, manages evidence-backed exception investigations, and supports offline-first mobile receiving with idempotent synchronization.

## Architecture Overview

OpsTrace is a TypeScript monorepo managed with `pnpm` workspaces:

- **`apps/api`** — NestJS modular monolith (`http://localhost:3001/api/v1`) backed by PostgreSQL 16 (Prisma), Redis 7 (BullMQ CSV imports), and SeaweedFS S3 (presigned evidence photo uploads).
- **`apps/web`** — Next.js 14 App Router dashboard (`http://localhost:3000`) for managers, procurement, and auditors (Master Data, Purchase Orders & CSV Bulk Import, Goods Receiving, Exception Investigation Center, Analytics Overview, and Immutable Audit Trail).
- **`apps/mobile`** — React Native / Expo warehouse app featuring barcode scanning (`expo-camera`), presigned photo evidence (`expo-image-picker`), and an `expo-sqlite` offline queue with sequential idempotent sync.
- **`packages/shared-types`** — Authoritative TypeScript enums and DTO interfaces shared across API, Web, and Mobile.
- **`packages/validation`** — Shared Zod schemas for client-side and server-side validation.

## Local Quickstart

### 1. Start Infrastructure (PostgreSQL, Redis, SeaweedFS S3)

```bash
docker compose up -d
```

### 2. Configure Environment & Run Migrations + Seed

```bash
cp apps/api/.env.example apps/api/.env
pnpm install
pnpm --filter @opstrace/shared-types --filter @opstrace/validation build
pnpm --filter @opstrace/api db:generate
pnpm --filter @opstrace/api db:migrate
pnpm --filter @opstrace/api db:seed
```

### 3. Run Applications

```bash
# Terminal 1: API (port 3001)
pnpm --filter @opstrace/api dev

# Terminal 2: Web Dashboard (port 3000)
pnpm --filter @opstrace/web dev

# Terminal 3: Mobile App (Expo)
pnpm --filter @opstrace/mobile start
```

## Demo Login Credentials

All synthetic accounts belong to **Northstar Distribution Corporation** and use password **`Password123!`**:

| Role | Email | Capabilities |
|---|---|---|
| `ORG_ADMIN` | `admin@northstar.ph` | Full system, user, master data, and operational access |
| `OPS_MANAGER` | `manager@northstar.ph` | Purchase Orders, Exception assignment/resolution, Analytics, Audit Logs |
| `WAREHOUSE_SUPERVISOR` | `supervisor@northstar.ph` | Receiving, Stock Inspections, Exception comments, Reports |
| `WAREHOUSE_EMPLOYEE` | `receiver@northstar.ph` | Mobile/Web Goods Receiving & Cycle-Count Inspections |
| `AUDITOR` | `auditor@northstar.ph` | Read-only Exceptions, Reports, and Audit Logs |

An isolated secondary organization (**Metro South Logistics Corp**, `admin@metrosouth.ph`) is also seeded to demonstrate strict multi-tenant data isolation.

## Verification & Testing

```bash
# Build shared packages
pnpm --filter @opstrace/shared-types --filter @opstrace/validation build

# Build & unit/integration test API (15 suites, 97 tests)
pnpm --filter @opstrace/api build
pnpm --filter @opstrace/api test

# Production build of Next.js Web Dashboard
pnpm --filter @opstrace/web build

# Typecheck Expo Mobile App
pnpm --filter @opstrace/mobile exec tsc --noEmit
```
