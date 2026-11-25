# OpsTrace AI Engineering Rules

1. **Architecture & Monorepo:**
   - Use `pnpm` workspaces (`apps/api`, `apps/web`, `apps/mobile`, `packages/shared-types`, `packages/validation`).
   - Follow a strict NestJS modular monolith structure. Keep controllers thin (HTTP routing/DTOs only) and put all business rules in services.
   - Never put authoritative business logic or discrepancy calculations in the Next.js or Expo frontends.

2. **Multi-Tenancy & Data Integrity:**
   - Every organization-owned database query MUST be scoped by `organizationId` enforced via server-side guards/context.
   - Use PostgreSQL `Decimal` types for all monetary values (`unit_price`)—never floating-point numbers.
   - Wrap multi-step writes (such as goods receiving + reconciliation + exception generation + audit logging) in a single `prisma.$transaction()`.
   - Enforce idempotency keys on all receiving and offline sync endpoints to prevent duplicate records.

3. **Code Readability for Study:**
   - Keep functions small, single-purpose, and strictly typed with TypeScript.
   - Add concise JSDoc comments above all service methods, database transactions, and guards explaining the business rule and security intent.
   - Do not over-abstract or introduce unnecessary design patterns. Prefer explicit, readable code.

4. **Workflow Discipline:**
   - Implement only one module or feature per prompt.
   - Always generate corresponding Jest unit/integration tests when creating or modifying core business logic.
