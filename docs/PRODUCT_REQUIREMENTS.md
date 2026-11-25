OPSTRACE
Complete Software Engineering Project Plan & Technical Specification

Project Codename: OpsTrace
Project Type: Full-Stack Enterprise-Style Software Portfolio Project
Development Classification: Independent Personal Project
Primary Objective: Secure a software development position at a medium-sized company
Secondary Objective: Develop a foundation that could eventually become a commercial SaaS product
Initial Development Period: 30 Days
Extended Development Period: Optional 30–60 days for advanced features
Target Market Scenario: Medium-sized Philippine distribution and warehouse businesses
Applications: Web Application + Cross-Platform Mobile Application
Development Approach: API-first, modular monolith, test-driven for critical business logic, AI-assisted development

PART I — PROJECT OVERVIEW
1. Executive Summary

OpsTrace is a mobile-first operational discrepancy and evidence management platform designed to demonstrate how modern business software can connect physical operations with digital records.

The platform addresses a common operational scenario: the information recorded by a business does not always reflect what actually happened.

Examples:

A purchase order indicates 100 units, but the warehouse receives only 92.
An inventory system records 50 units, but physical inspection finds 43.
A delivery is marked complete without sufficient supporting evidence.
A warehouse employee submits an inspection, but the report is never properly reviewed.
A manager cannot determine who changed an operational record or why.

These situations can create financial discrepancies, inaccurate inventory records, poor accountability, and inefficient investigations.

OpsTrace provides a centralized system for:

Recording physical operational activities.
Comparing actual records against expected business records.
Detecting discrepancies using deterministic business rules.
Collecting photographic and documentary evidence.
Managing investigations and assignments.
Tracking the complete history of operational activities.
Providing management reports and analytics.

The system consists of two user-facing applications and one shared backend.

OpsTrace Web

Designed for managers, administrators, procurement personnel, and operations staff.

OpsTrace Mobile

Designed for warehouse personnel and employees who perform physical inspections and receiving activities.

OpsTrace API

The centralized backend responsible for authentication, authorization, business rules, data processing, synchronization, and persistence.

All applications communicate through a shared API and database.

2. Project Objectives
Primary objective: Employment portfolio

Demonstrate practical software engineering capabilities through a substantial, working application.

The project should demonstrate:

Full-stack application development.
Mobile application development.
RESTful API architecture.
Relational database design.
Multi-tenant data isolation.
Role-based access control.
Business logic implementation.
Data reconciliation algorithms.
File handling.
Background processing.
Offline synchronization.
Automated testing.
Containerization.
Deployment.
Technical documentation.
Secondary objective: Product development experience

Develop a product that resembles a real business application.

The system should have:

A coherent product identity.
Realistic business workflows.
Consistent UI/UX.
Meaningful operational data.
Functional mobile and web applications.
Proper error handling.
Maintainable architecture.
Explicit non-objectives

The initial project will NOT attempt to build:

A complete ERP.
An accounting application.
A payroll system.
A CRM.
A complete procurement management suite.
An enterprise resource planning replacement.
An AI chatbot.
A full logistics routing platform.

These are intentionally excluded to prevent scope creep.

PART II — PRODUCT DESIGN
3. Product Identity

Product Name: OpsTrace

Product Category: Operational Discrepancy and Evidence Management

Product Tagline:

"Every operation accounted for."

Product Description:

OpsTrace connects physical warehouse activities with digital business records, identifies operational inconsistencies, and provides a structured process for investigating and resolving them.

Core product philosophy

OpsTrace should not merely store information.

It should help users understand:

What was expected?
What actually happened?
What is different?
Who recorded the activity?
What evidence supports the record?
Who is responsible for resolving the issue?
What actions were performed?
How was the issue resolved?

This philosophy should guide all feature and architecture decisions.

4. User Roles

The application will support organization-level user accounts with role-based permissions.

4.1 Organization Administrator

Responsibilities:

Manage company information.
Create and manage users.
Create warehouses.
Configure user roles.
Manage product records.
Configure operational settings.
Review system activity.
4.2 Operations Manager

Responsibilities:

View operational dashboards.
Monitor discrepancies.
Assign investigations.
Review evidence.
Approve resolutions.
Generate reports.
4.3 Warehouse Supervisor

Responsibilities:

Manage receiving activities.
Monitor warehouse inspections.
Review employee submissions.
Identify inventory discrepancies.
Submit findings to managers.
4.4 Warehouse Employee

Responsibilities:

View assigned receiving tasks.
Scan products.
Record received quantities.
Perform physical inventory counts.
Upload photographs.
Submit inspection reports.
4.5 Auditor / Read-only User

Responsibilities:

Review operational records.
View historical activities.
Review audit trails.
Access permitted reports.

Read-only users must not be able to modify business records.

5. Main Business Workflow

This is the primary workflow that the entire application will be designed around.

Scenario: Incomplete warehouse delivery

A company expects 100 units from a supplier.

Its purchase order records 100 units.

However, the warehouse physically receives only 92 units.

The employee records the actual quantity through OpsTrace Mobile.

The backend validates the receiving report, stores it, and executes the reconciliation engine.

The engine identifies an eight-unit discrepancy.

An exception is generated.

The operations manager sees the exception through OpsTrace Web.

The manager assigns the investigation to an appropriate employee.

The employee reviews the receiving evidence and adds an investigation note.

The manager reviews the findings and resolves the discrepancy.

The system records the complete activity history.

Workflow diagram
mermaid
flowchart TD
    A[Purchase Order Imported] --> B[Warehouse Receives Delivery]
    B --> C[Employee Records Actual Quantity]
    C --> D[Attach Supporting Evidence]
    D --> E[Submit Receiving Report]
    E --> F[Backend Validation]
    F --> G[Save Receiving Transaction]
    G --> H[Reconciliation Engine]
    H --> I{Discrepancy Found?}
    I -->|No| J[Mark Reconciliation Complete]
    I -->|Yes| K[Create Exception]
    K --> L[Manager Reviews Exception]
    L --> M[Assign Investigation]
    M --> N[Employee Investigates]
    N --> O[Submit Findings]
    O --> P[Manager Reviews]
    P --> Q[Resolve or Reopen]
    Q --> R[Audit Trail Updated]


This workflow is the minimum complete business process that must work before the project can be considered a successful MVP.

PART III — APPLICATION SPECIFICATIONS
6. OpsTrace Web Application

Primary technology: Next.js + TypeScript

The web application serves as the management and administrative interface.

6.1 Authentication

Required features:

Login.
Registration for initial demonstration organizations.
Logout.
Session management.
Password reset flow.
Protected routes.
Organization selection where applicable.

Security requirements:

Password hashing.
Secure session handling.
Server-side authorization.
Protection against unauthorized API access.
6.2 Dashboard

The dashboard should present an overview of organizational operations.

Required metrics:

Metric	Description
Total exceptions	All detected discrepancies
Open exceptions	Issues awaiting resolution
Critical exceptions	Highest-severity unresolved issues
Resolved exceptions	Successfully resolved issues
Average resolution time	Average time between detection and resolution
Pending inspections	Inspections awaiting review
Inventory variance	Difference between recorded and physical quantities

Dashboard sections:

Summary metric cards.
Exception trends.
Exceptions by warehouse.
Exceptions by category.
Recent activities.
Pending investigations.
Overdue investigations.

All metrics must come from actual database records, not hardcoded numbers.

6.3 Organization Management

Features:

Organization profile.
Organization settings.
User management.
Role assignment.
Warehouse management.
Organization activity history.
6.4 Product Management

Product fields:

Product ID.
SKU.
Product name.
Description.
Barcode.
Unit of measurement.
Category.
Status.
Organization ID.

Required functionality:

Create products.
Edit products.
Search products.
Filter products.
Archive products.
Prevent duplicate SKU values within an organization.
6.5 Supplier Management

Supplier fields:

Supplier ID.
Supplier name.
Contact information.
Email.
Phone number.
Address.
Organization ID.
Status.

Required functionality:

Create suppliers.
Update suppliers.
View supplier history.
View supplier-related exceptions.
6.6 Warehouse Management

Features:

Create warehouses.
Edit warehouse information.
Assign warehouse supervisors.
View warehouse inventory.
View warehouse inspections.
View warehouse discrepancies.
6.7 Purchase Order Management

Purchase orders contain:

Purchase order number.
Supplier.
Warehouse.
Order date.
Expected delivery date.
Status.
Line items.
Expected quantities.
Unit prices.

Required functionality:

Create purchase orders.
Import purchase orders.
View purchase order details.
Update permitted fields.
Track receiving progress.

Initial statuses:

Draft.
Issued.
Partially received.
Fully received.
Cancelled.
6.8 Exception Management Center

This is one of the most important web modules.

The exception table should contain:

Column	Description
Exception ID	Unique identifier
Category	Type of discrepancy
Reference	Related business record
Warehouse	Affected location
Severity	Critical, high, medium, low
Assignee	Responsible user
Status	Current investigation state
Created	Detection timestamp

Required functionality:

Search.
Filtering.
Sorting.
Pagination.
Exception details.
Assignment.
Investigation notes.
Evidence review.
Status updates.
Resolution.
6.9 Exception Detail Page

Each exception should have its own detailed investigation interface.

Sections:

Exception summary.
Discrepancy explanation.
Expected versus actual values.
Related purchase order.
Receiving report.
Supporting photographs.
Assigned personnel.
Investigation comments.
Resolution information.
Audit history.
6.10 Audit Trail Viewer

Display significant system events.

Example:

Timestamp	User	Action
09:00	System	Exception created
09:15	Manager	Assigned to employee
09:45	Employee	Added investigation note
10:10	Employee	Uploaded evidence
11:00	Manager	Resolved exception

Audit records must be immutable through normal application workflows.

6.11 Analytics and Reporting

Initial reports:

Exception distribution by category.
Exception distribution by warehouse.
Supplier discrepancy frequency.
Inventory variance.
Exception aging.
Average resolution time.

Report export:

CSV.
PDF, if time permits.
7. OpsTrace Mobile Application

Primary technology: React Native + Expo + TypeScript

The mobile application is designed around physical operations.

It must not simply replicate the web dashboard.

7.1 Mobile Authentication

Features:

Login.
Logout.
Secure token/session handling.
User profile.
Organization context.
Protected screens.
7.2 Mobile Home Screen

Display:

Assigned tasks.
Pending receiving activities.
Pending inspections.
Recent submissions.
Synchronization status.
Notifications.
7.3 Goods Receiving

Primary mobile workflow.

Steps:

Select warehouse.
Search purchase order.
View expected products.
Scan barcode or select product.
Enter actual received quantity.
Record damaged quantities.
Attach photographs.
Review receiving report.
Submit.

The application should display expected and actual quantities side by side.

Example:

Purchase order: PO-00142

Product	Expected	Received
SKU-001	100	92
SKU-002	50	50
SKU-003	25	20

The employee should be able to save the report as a draft before submission.

7.4 Barcode Scanning

Use Expo Camera or an appropriate Expo-supported barcode scanning solution.

Required functionality:

Request camera permission.
Scan supported barcode formats.
Retrieve matching product records.
Display product information.
Handle unknown barcodes.
Prevent accidental repeated scans.

Do not require barcode scanning to be available for every workflow. Manual product search should remain available.

7.5 Inventory Inspection

Workflow:

Select warehouse.
Select inventory item.
Retrieve recorded quantity.
Enter physical quantity.
Record condition or notes.
Attach photographs.
Submit inspection.

The backend compares the physical count with the recorded inventory snapshot.

7.6 Photo Evidence

Support:

Camera capture.
Image selection.
Image preview.
Upload progress.
Attachment status.
Association with receiving or inspection records.

Validate file types and sizes on the server.

7.7 Offline Mode

This is an advanced feature and a major engineering differentiator.

The application should support creating records without internet access.

Local storage:

SQLite.

Offline workflow:

Employee creates a receiving record.
Application saves the record locally.
Record receives a local synchronization identifier.
Record enters the pending synchronization queue.
When connectivity returns, the application submits the record.
Backend validates the submission.
Backend responds with the permanent record ID.
Local record is marked synchronized.

Important requirements:

Idempotency keys.
Retry handling.
Duplicate submission prevention.
Synchronization status.
Failed submission visibility.
Conflict handling.

For the MVP, support offline creation of receiving and inspection records. Do not attempt unrestricted offline editing of existing records.

7.8 Mobile Notifications

Notify employees when:

A task is assigned.
An investigation requests additional evidence.
A submission requires correction.
An exception is updated.

Push notifications are an enhancement. In-app notifications should work even if push notification configuration is not completed.

PART IV — BACKEND ENGINEERING
8. Backend Architecture

Technology: NestJS + TypeScript

Use a modular monolith.

The application should have clear module boundaries without unnecessary microservices.

Proposed backend modules
text
apps/api/src/
│
├── auth/
├── users/
├── organizations/
├── memberships/
├── roles/
├── permissions/
├── warehouses/
├── suppliers/
├── products/
├── purchase-orders/
├── goods-receipts/
├── inventory/
├── inspections/
├── reconciliation/
├── exceptions/
├── investigations/
├── attachments/
├── notifications/
├── audit/
├── imports/
├── synchronization/
├── analytics/
└── common/


Each module should contain appropriate controllers, services, DTOs, entities or Prisma access, and tests.

Architecture rules
Controllers handle HTTP requests.
Services implement business operations.
Validation occurs before business processing.
Authorization is enforced server-side.
Database transactions protect related writes.
Background jobs handle expensive asynchronous work.
Business rules should not depend on the frontend.
AI should not determine authoritative business outcomes.
9. API Design

Use RESTful endpoints under:

/api/v1

Authentication
http
POST /auth/login
POST /auth/logout
POST /auth/register
POST /auth/refresh
GET  /auth/me

Organizations and users
http
GET    /organizations
POST   /organizations
GET    /organizations/:id
PATCH  /organizations/:id

GET    /users
POST   /users
GET    /users/:id
PATCH  /users/:id

Warehouses
http
GET    /warehouses
POST   /warehouses
GET    /warehouses/:id
PATCH  /warehouses/:id

Products
http
GET    /products
POST   /products
GET    /products/:id
PATCH  /products/:id
DELETE /products/:id

Suppliers
http
GET    /suppliers
POST   /suppliers
GET    /suppliers/:id
PATCH  /suppliers/:id

Purchase orders
http
GET    /purchase-orders
POST   /purchase-orders
GET    /purchase-orders/:id
PATCH  /purchase-orders/:id
POST   /purchase-orders/import
GET    /purchase-orders/:id/receipts

Goods receiving
http
GET    /goods-receipts
POST   /goods-receipts
GET    /goods-receipts/:id
PATCH  /goods-receipts/:id
POST   /goods-receipts/:id/submit

Inventory inspections
http
GET    /inspections
POST   /inspections
GET    /inspections/:id
POST   /inspections/:id/submit

Exceptions
http
GET    /exceptions
GET    /exceptions/:id
POST   /exceptions/:id/assign
POST   /exceptions/:id/comments
POST   /exceptions/:id/resolve
POST   /exceptions/:id/reopen

Audit trail
http
GET /audit-logs
GET /audit-logs/:id

Synchronization
http
POST /sync/receiving
POST /sync/inspections
GET  /sync/status

Analytics
http
GET /analytics/overview
GET /analytics/exceptions
GET /analytics/warehouses
GET /analytics/suppliers


These are initial endpoint contracts. Final request and response schemas must be documented during implementation.

PART V — DATABASE DESIGN
10. PostgreSQL Database Architecture

Use PostgreSQL with Prisma ORM.

All tenant-owned business records must be scoped to an organization.

10.1 Core identity tables

organizations

id
name
slug
industry
created_at
updated_at

users

id
email
password_hash
first_name
last_name
is_active
created_at
updated_at

memberships

id
organization_id
user_id
role_id
status
created_at

roles

id
organization_id, nullable for system roles
name
description

permissions

id
key
description

role_permissions

role_id
permission_id

Important constraints:

Unique user email.
Unique organization membership per user.
Foreign keys.
Indexed organization identifiers.
10.2 Warehouse and product tables

warehouses

id
organization_id
name
code
address
status

products

id
organization_id
sku
name
description
barcode
unit_of_measure
status

suppliers

id
organization_id
name
email
phone
address
status
10.3 Purchase order tables

purchase_orders

id
organization_id
supplier_id
warehouse_id
po_number
order_date
expected_delivery_date
status
created_by
created_at

purchase_order_items

id
purchase_order_id
product_id
ordered_quantity
unit_price

Constraints:

Unique PO number per organization.
Positive ordered quantity.
Non-negative unit price.
Valid supplier and warehouse references.
10.4 Receiving tables

goods_receipts

id
organization_id
purchase_order_id
warehouse_id
received_by
receipt_number
status
received_at
submitted_at
created_at

goods_receipt_items

id
goods_receipt_id
purchase_order_item_id
product_id
received_quantity
damaged_quantity
notes

Allow multiple partial receipts against one purchase order.

Never assume one purchase order equals one delivery.

10.5 Inventory tables

inventory_snapshots

id
organization_id
warehouse_id
product_id
quantity
recorded_at
source_reference

stock_inspections

id
organization_id
warehouse_id
product_id
recorded_quantity
physical_quantity
difference
performed_by
status
inspected_at

For the MVP, inspections should compare against a clearly identified recorded snapshot. Do not implement a full inventory ledger unless the core workflow is already complete.

10.6 Exception tables

exceptions

id
organization_id
exception_number
category
severity
status
title
description
related_record_type
related_record_id
detected_at
resolved_at
created_at

exception_assignments

id
exception_id
assigned_to
assigned_by
assigned_at

exception_comments

id
exception_id
user_id
content
created_at

exception_resolutions

id
exception_id
resolved_by
resolution_type
resolution_notes
resolved_at
10.7 Supporting tables

attachments

id
organization_id
uploaded_by
related_record_type
related_record_id
storage_key
file_name
mime_type
file_size
created_at

audit_logs

id
organization_id
actor_user_id
action
entity_type
entity_id
metadata
created_at

import_jobs

id
organization_id
uploaded_by
file_name
status
total_rows
successful_rows
failed_rows
created_at

sync_operations

id
organization_id
user_id
idempotency_key
operation_type
status
server_record_id
created_at
10.8 Database engineering requirements

Implement:

Foreign key constraints.
Unique constraints.
Appropriate indexes.
Transactions.
Database migrations.
Consistent timestamps.
Numeric precision for quantities and prices.
Organization-level ownership constraints.
Referential integrity.

For money, use appropriate decimal types rather than floating-point arithmetic.

For receiving and reconciliation, use transactions to ensure that records cannot be partially committed.

PART VI — RECONCILIATION ENGINE
11. Deterministic Business Logic

This module is the technical heart of OpsTrace.

It must work without Gemini or any external AI service.

11.1 Three-way quantity comparison

Compare:

Ordered quantity.
Received quantity.
Damaged quantity.

Example:

Ordered: 100

Received: 92

Damaged: 2

Accepted quantity: 90.

The engine should distinguish:

Missing quantity.
Damaged quantity.
Accepted quantity.
Outstanding quantity.

For example:

Outstanding quantity = Ordered quantity - Received quantity.

Damaged quantity should be tracked separately and must not be accidentally counted as accepted inventory.

11.2 Partial deliveries

A purchase order may have several receiving records.

Example:

Delivery	Quantity
First	40
Second	30
Third	22
Total received	92

Ordered quantity: 100.

Outstanding quantity: 8.

The engine must aggregate valid submitted receiving records rather than compare only the latest delivery.

11.3 Inventory variance

Formula:

Inventory variance = Physical quantity - Recorded quantity.

Example:

Recorded: 50.

Physical: 43.

Variance: -7.

The system creates an inventory discrepancy.

11.4 Duplicate detection

Prevent:

Duplicate receiving submissions.
Duplicate import records.
Duplicate exception generation.
Duplicate synchronization submissions.

Use appropriate unique constraints, stable identifiers, and idempotency mechanisms.

Do not rely exclusively on checking whether a record already exists before inserting it. Concurrent requests can bypass a check-then-insert implementation.

11.5 Exception severity

Initial severity model:

Critical

Significant discrepancy above a configurable threshold.
High-impact operational issue.

High

Material discrepancy requiring prompt investigation.

Medium

Moderate quantity or process discrepancy.

Low

Minor discrepancy or informational issue.

Severity thresholds must be configurable and documented.

11.6 Exception lifecycle

Permitted statuses:

Open.
Assigned.
Investigating.
Awaiting response.
Resolved.
Rejected.
Closed.

Status transitions must be validated server-side.

For example, a resolved exception should not silently return to an open state without a recorded reopening action.

11.7 Reconciliation processing

The reconciliation engine should be implemented as a separate service.

Conceptual flow:

text
Receiving submission
       |
       v
Validate receiving data
       |
       v
Persist transaction
       |
       v
Calculate aggregated quantities
       |
       v
Evaluate business rules
       |
       v
Generate discrepancy results
       |
       v
Create or update exceptions
       |
       v
Record audit events


Critical operations should be protected by database transactions and appropriate concurrency controls.

For expensive imports or bulk processing, use background jobs.

PART VII — SECURITY AND RELIABILITY
12. Security Architecture

Security is one of the strongest areas to demonstrate during interviews.

Authentication
Secure password hashing.
Session or token lifecycle.
Login validation.
Logout handling.
Protected API routes.
Appropriate token expiration.
Authorization

Implement role-based permissions.

Examples:

Permission	Admin	Manager	Supervisor	Employee	Auditor
Manage users	Yes	No	No	No	No
Manage products	Yes	Yes	Limited	No	No
Create receiving	Yes	Yes	Yes	Yes	No
View exceptions	Yes	Yes	Yes	Assigned only	Yes
Assign exceptions	Yes	Yes	Limited	No	No
Resolve exceptions	Yes	Yes	Limited	No	No
View audit logs	Yes	Yes	Limited	No	Yes

Actual permissions must be enforced by the backend, not merely by hiding buttons.

Multi-tenancy

Every organization-owned resource must be scoped to the authenticated user's organization.

Tests must attempt:

Accessing another organization's purchase orders.
Accessing another organization's exceptions.
Downloading another organization's attachments.
Modifying another organization's records.

These operations must fail.

File security
Validate file size.
Validate MIME type.
Use generated storage keys.
Prevent unsafe filenames from being used as storage paths.
Restrict file access.
Use expiring signed URLs where appropriate.
Avoid exposing public object storage by default.
Reliability
Structured application logs.
Centralized error handling.
Database backups.
Retry handling.
Idempotent submission processing.
Database transaction management.
Clear error responses.
Audit integrity

Audit logs should not be editable through ordinary application APIs.

For particularly important events, record:

Actor.
Action.
Affected entity.
Timestamp.
Relevant before-and-after values.
Request correlation identifier where practical.

Never store passwords, authentication tokens, or other secrets in audit metadata.

PART VIII — TESTING STRATEGY
13. Automated Testing

Testing is mandatory.

A beautiful application without reliable business logic is not a strong engineering portfolio.

13.1 Unit tests

Test individual business functions.

Examples:

Quantity discrepancy calculation.
Inventory variance calculation.
Exception severity determination.
Status transition validation.
Permission checks.
Duplicate detection logic.
13.2 Integration tests

Test multiple modules working together.

Examples:

Purchase order creation.
Receiving submission.
Reconciliation execution.
Exception creation.
Assignment.
Resolution.
Audit logging.
13.3 API tests

Test:

Authentication.
Request validation.
Unauthorized requests.
Missing resources.
Invalid relationships.
Organization isolation.
Duplicate requests.
Pagination and filtering.
13.4 Mobile tests

Test:

Receiving workflow.
Barcode lookup.
Photo attachment.
Offline record creation.
Synchronization retries.
Duplicate submission handling.
13.5 End-to-end tests

Build one complete automated business scenario:

Create organization.
Create warehouse.
Create supplier.
Create product.
Create purchase order.
Submit receiving record.
Trigger reconciliation.
Verify exception.
Assign exception.
Resolve exception.
Verify audit history.
13.6 Important edge cases

Include tests for:

Two employees submitting simultaneously.
Partial deliveries.
Receiving quantities greater than ordered quantities.
Negative quantities.
Duplicate barcode scans.
Missing product records.
Failed file uploads.
Expired sessions.
Offline submissions.
Repeated synchronization attempts.
Invalid organization access.
13.7 Testing targets

Suggested project targets:

Critical business rules: comprehensive unit tests.
Backend services: meaningful unit and integration coverage.
API: all major workflows tested.
End-to-end: at least one complete business scenario.
Authorization: all major roles and organization boundaries tested.

A coverage percentage is not proof of correctness. Prioritize meaningful assertions over chasing an arbitrary coverage number.

PART IX — UI/UX DESIGN
14. Visual Direction

OpsTrace should look like a credible enterprise SaaS application.

Design principles
Clean layouts.
Consistent spacing.
Restrained colors.
Readable typography.
Functional data tables.
Clear status indicators.
Consistent navigation.
Useful empty states.
Clear validation messages.

Avoid:

Excessive gradients.
Unnecessary glass effects.
Random AI-generated visual elements.
Fake charts.
Decorative features without a purpose.
Overly complicated animations.
Suggested color palette

Primary: Navy / dark slate.

Accent: Professional blue.

Background: Warm white or neutral gray.

Success: Muted green.

Warning: Amber.

Critical: Muted red.

Web navigation
text
OpsTrace
│
├── Dashboard
│
├── Operations
│   ├── Purchase Orders
│   ├── Goods Receiving
│   ├── Inventory
│   └── Inspections
│
├── Exceptions
│   ├── All Exceptions
│   ├── Assigned to Me
│   └── Resolved
│
├── Reports
│
├── Administration
│   ├── Users
│   ├── Roles
│   ├── Warehouses
│   ├── Suppliers
│   └── Products
│
└── Settings

Mobile navigation
text
OpsTrace Mobile
│
├── Home
├── Receiving
├── Inspections
├── Tasks
└── Profile


Mobile interfaces should prioritize large touch targets, clear forms, and fast data entry.

PART X — AI DEVELOPMENT STRATEGY
15. Gemini as an Engineering Assistant

Gemini is a development assistant, not an architectural authority.

The project must remain functional without AI.

Appropriate uses

Planning

Review requirements.
Identify missing workflows.
Review architectural choices.

Database

Review schema design.
Identify relationship problems.
Suggest indexes and constraints.

Development

Generate individual modules.
Explain unfamiliar code.
Help implement validation.
Assist with debugging.

Testing

Generate edge cases.
Review test coverage.
Identify missing assertions.

Security

Review authorization logic.
Identify potential tenant isolation issues.
Review file handling.

Documentation

Draft API documentation.
Explain architectural decisions.
Improve README quality.
Development rules
Never ask Gemini to generate the entire application in one prompt.
Implement one module at a time.
Review every generated file.
Run tests after every significant change.
Understand the code before accepting it.
Do not allow AI to silently change database architecture.
Do not commit unreviewed generated code.
Maintain your own development notes.
Suggested AI workflow
text
Define requirement
      |
      v
Design the feature
      |
      v
Ask Gemini for implementation guidance
      |
      v
Review generated code
      |
      v
Run local tests
      |
      v
Inspect edge cases
      |
      v
Refactor if needed
      |
      v
Commit to Git

PART XI — 30-DAY IMPLEMENTATION SCHEDULE
16. Development Milestones

The 30-day target is an aggressive MVP schedule.

Assume approximately 5–8 focused hours per day.

Do not add new features until the current milestone works.

WEEK 1 — Architecture and Foundation

Day 1: Product definition

Tasks:

Finalize requirements.
Define user roles.
Define business workflows.
Create initial wireframes.
Set up GitHub repository.
Create development task board.

Deliverable: Requirements document and initial project structure.

Day 2: Architecture

Tasks:

Design modular monolith.
Define API conventions.
Create architecture diagram.
Design initial database ERD.
Define organization-level security boundaries.

Deliverable: Architecture documentation.

Day 3: Development environment

Tasks:

Install dependencies.
Initialize Next.js.
Initialize NestJS.
Initialize Expo.
Configure TypeScript.
Configure ESLint and formatting.
Configure Docker Compose.
Set up PostgreSQL.

Deliverable: Running development environment.

Day 4: Database foundation

Tasks:

Configure Prisma.
Create initial migrations.
Implement organization models.
Implement users and memberships.
Implement role and permission models.
Add constraints and indexes.

Deliverable: Initial database schema.

Day 5: Authentication

Tasks:

Implement login.
Implement registration for demo organizations.
Implement password hashing.
Implement session handling.
Implement protected endpoints.
Add authentication tests.

Deliverable: Working authentication system.

Day 6: Authorization

Tasks:

Implement permission definitions.
Implement role checks.
Implement organization context.
Protect API endpoints.
Add authorization tests.

Deliverable: Working RBAC and tenant isolation foundation.

Day 7: Web foundation

Tasks:

Build application shell.
Implement navigation.
Build login interface.
Build dashboard layout.
Add loading and error states.

Deliverable: Initial web application.

WEEK 2 — Business Records and Mobile

Day 8: Organization and warehouse management

Tasks:

Organization profile.
Warehouse CRUD.
Warehouse search.
Warehouse permissions.

Deliverable: Working warehouse management.

Day 9: Product management

Tasks:

Product CRUD.
SKU validation.
Barcode field.
Product search.
Product filters.

Deliverable: Working product catalog.

Day 10: Supplier and purchase orders

Tasks:

Supplier CRUD.
Purchase order creation.
Purchase order line items.
Expected delivery dates.
Purchase order status handling.

Deliverable: Working purchase order management.

Day 11: Import engine

Tasks:

CSV parsing.
Column mapping.
Row validation.
Duplicate detection.
Import result reporting.
Failed row handling.

Deliverable: Functional CSV import.

Excel support can be added once CSV processing is reliable.

Day 12: Mobile foundation

Tasks:

Configure Expo.
Configure navigation.
Implement login.
Configure API client.
Implement secure session storage.
Build mobile home screen.

Deliverable: Authenticated mobile application.

Day 13: Receiving interface

Tasks:

Purchase order search.
Purchase order detail screen.
Product list.
Quantity entry.
Receiving draft creation.

Deliverable: Mobile receiving interface.

Day 14: Barcode and evidence

Tasks:

Camera permissions.
Barcode scanning.
Product lookup.
Image capture.
Image preview.
Upload interface.

Deliverable: Basic mobile receiving workflow.

WEEK 3 — Core Business Logic

Day 15: Receiving backend

Tasks:

Receiving DTOs.
Receiving service.
Receiving database transactions.
Quantity validation.
Receiving status management.

Deliverable: Working receiving API.

Day 16: Reconciliation engine

Tasks:

Aggregate submitted receiving quantities.
Calculate outstanding quantities.
Calculate accepted quantities.
Detect quantity discrepancies.
Implement repeatable processing.

Deliverable: Deterministic discrepancy engine.

Day 17: Exception management

Tasks:

Exception generation.
Severity calculation.
Exception numbering.
Duplicate prevention.
Exception listing and detail APIs.

Deliverable: Automated exception generation.

Day 18: Inventory inspection

Tasks:

Inspection creation.
Recorded quantity retrieval.
Physical quantity entry.
Variance calculation.
Inspection submission.

Deliverable: Working inspection module.

Day 19: Investigation workflow

Tasks:

Assignment.
Comments.
Status transitions.
Investigation notes.
Resolution records.

Deliverable: Complete investigation workflow.

Day 20: Audit logging

Tasks:

Audit event service.
User action logging.
Exception history.
Receiving history.
Audit viewer.

Deliverable: Traceable business activity history.

Day 21: Web and mobile integration

Tasks:

Connect receiving submissions to backend.
Display generated exceptions in web.
Connect assignment workflow.
Display task updates in mobile.

Deliverable: End-to-end web and mobile workflow.

WEEK 4 — Advanced Features and Completion

Day 22: Offline storage

Tasks:

Configure SQLite.
Create local receiving schema.
Store offline drafts.
Implement synchronization queue.

Deliverable: Local offline record creation.

Day 23: Synchronization

Tasks:

Idempotency keys.
Submission retries.
Synchronization status.
Duplicate prevention.
Failed synchronization handling.

Deliverable: Basic reliable synchronization.

Day 24: Analytics

Tasks:

Dashboard API.
Exception counts.
Warehouse statistics.
Supplier statistics.
Exception aging.

Deliverable: Database-driven dashboard.

Day 25: AI integration

Tasks:

Configure Gemini API.
Implement optional investigation summaries.
Implement CSV column mapping suggestions.
Validate AI output.
Add AI failure handling.

Deliverable: Optional AI assistance.

Day 26: Automated testing

Tasks:

Unit tests.
Service tests.
API integration tests.
Authorization tests.
Reconciliation tests.

Deliverable: Critical business workflows tested.

Day 27: Mobile testing

Tasks:

Receiving workflow tests.
Barcode tests.
Offline tests.
Synchronization tests.
Permission handling.

Deliverable: Tested mobile workflows.

Day 28: Deployment

Tasks:

Production environment configuration.
Docker images.
Database migrations.
API deployment.
Web deployment.
Storage configuration.
Backup configuration.

Deliverable: Deployed web application and backend.

Day 29: Documentation

Tasks:

README.
Architecture documentation.
ERD.
API documentation.
Installation instructions.
Environment variable documentation.
Test instructions.

Deliverable: Professional technical documentation.

Day 30: Final demonstration

Tasks:

Populate demonstration data.
Verify major workflows.
Fix critical bugs.
Record demonstration.
Capture screenshots.
Finalize GitHub repository.
Prepare resume project description.

Deliverable: Complete portfolio-ready MVP.

PART XII — SCOPE MANAGEMENT
17. Priority Classification

The most dangerous risk is trying to complete too many features simultaneously.

Use the following priorities.

P0 — Absolutely required
Authentication.
Organization isolation.
User roles.
Products.
Warehouses.
Purchase orders.
Goods receiving.
Reconciliation engine.
Exception generation.
Investigation workflow.
Audit trail.
Web and mobile integration.
Deployment.
P1 — Important enhancements
Barcode scanning.
Photograph uploads.
Inventory inspections.
CSV import.
Dashboard analytics.
Automated integration tests.
P2 — Advanced enhancements
Offline synchronization.
Push notifications.
Excel import.
PDF reporting.
Gemini integration.
Advanced analytics.

If the schedule becomes tight, complete all P0 features before attempting P2.

A working system with a smaller feature set is better than a large application full of unfinished screens.

PART XIII — SYNTHETIC DEMONSTRATION ENVIRONMENT
18. Create a Fictional Company

Since this is a personal portfolio project, the application will use fictional business data.

Create a demonstration organization:

Northstar Distribution Corporation

Company profile:

Industry: Wholesale distribution.
Employees: 12 demonstration users.
Warehouses: 3.
Suppliers: 20.
Products: 150.
Purchase orders: 100.
Receiving records: 80.
Demonstration discrepancies: 25.

All records must be clearly identified as synthetic demonstration data.

Suggested demonstration scenarios

Scenario 1: Incomplete delivery

Ordered: 100.

Received: 92.

Expected result: Quantity discrepancy.

Scenario 2: Partial delivery

Ordered: 100.

First delivery: 40.

Second delivery: 30.

Third delivery: 30.

Expected result: Fully received purchase order.

Scenario 3: Damaged products

Received: 100.

Damaged: 5.

Accepted: 95.

Expected result: Damaged goods recorded and handled separately.

Scenario 4: Inventory mismatch

Recorded: 50.

Physical: 43.

Expected result: Inventory variance of -7.

Scenario 5: Duplicate submission

Submit the same receiving request twice with the same idempotency key.

Expected result: One business transaction, not two.

Scenario 6: Unauthorized access

A user belonging to Organization A attempts to access Organization B's exception.

Expected result: Access denied.

Scenario 7: Offline receiving

Create a receiving record without connectivity and reconnect.

Expected result: Record synchronizes once and is not duplicated.

Scenario 8: Investigation resolution

Create an exception, assign an employee, submit findings, and resolve it.

Expected result: Complete audit history.

PART XIV — PORTFOLIO PRESENTATION
19. GitHub Repository

The repository should look professional.

Suggested repository name:

opstrace

Recommended README structure:

Project introduction.
Problem statement.
Product objectives.
Application screenshots.
Architecture diagram.
Technology stack.
Feature list.
Database architecture.
API documentation.
Installation instructions.
Environment configuration.
Testing instructions.
Demo credentials, if publicly shared.
Known limitations.
Future improvements.

Never commit secrets, real credentials, private company data, or production environment files.

20. Required Documentation

Create these files:

text
docs/
│
├── PRODUCT_REQUIREMENTS.md
├── SYSTEM_ARCHITECTURE.md
├── DATABASE_DESIGN.md
├── API_SPECIFICATION.md
├── SECURITY_MODEL.md
├── RECONCILIATION_RULES.md
├── TESTING_STRATEGY.md
├── DEPLOYMENT_GUIDE.md
└── ARCHITECTURAL_DECISIONS.md


The architectural decision records should explain important choices.

Examples:

Why modular monolith instead of microservices?
Why PostgreSQL?
Why use transactions for receiving submissions?
Why use idempotency keys?
Why use SQLite for offline mobile records?
Why keep AI outside authoritative business logic?

These explanations are valuable during technical interviews.

21. Demonstration Video

Target duration: 3–5 minutes.

Suggested sequence:

00:00–00:30 — Introduction

Explain the problem and what OpsTrace does.

00:30–01:15 — Mobile application

Show receiving a purchase order, recording quantities, scanning a barcode, and attaching evidence.

01:15–02:00 — Backend behavior

Explain how the receiving record is validated and how the reconciliation engine identifies discrepancies.

02:00–02:45 — Web application

Show the generated exception, investigation assignment, and resolution.

02:45–03:30 — Engineering architecture

Show the database, API, and test results.

03:30–04:00 — Conclusion

Explain the technology choices and engineering challenges.

Do not rely on slides alone. Demonstrate actual working software.

PART XV — RESUME STRATEGY
22. How to Present OpsTrace

Project classification:

Independent Software Engineering Project

Do not claim it is a company deployment or a commercially validated product.

Suggested resume entry:

OpsTrace — Operational Discrepancy & Evidence Management Platform

Independent Software Engineering Project | 2026

Designed and developed a full-stack operational management platform featuring a Next.js web application, React Native mobile application, and NestJS REST API.
Implemented organization-scoped data management and role-based access control using PostgreSQL and Prisma.
Developed a deterministic reconciliation engine for identifying purchase order, goods receiving, and inventory discrepancies.
Built mobile workflows for barcode-based product identification, warehouse receiving, and physical inventory inspections.
Implemented an investigation management system with assignments, supporting evidence, status transitions, and audit logging.
Developed automated tests for critical business workflows, authorization, and data integrity.

Technology Stack: TypeScript, Next.js, React Native, Expo, NestJS, PostgreSQL, Prisma, Redis, Docker.

Only retain claims corresponding to completed and tested features.

Interview talking points

Prepare to explain:

Why you selected a modular monolith.
How your organization-level data isolation works.
How you prevent duplicate receiving submissions.
How partial deliveries are handled.
How the reconciliation engine works.
How database transactions protect business records.
How offline synchronization works.
How authorization is enforced.
How audit logs are generated.
What you would improve with another month of development.

The goal is to understand the engineering decisions, not memorize descriptions.

PART XVI — DEFINITION OF DONE
23. Final Acceptance Checklist

The project is not complete simply because the interface looks finished.

Web application
Authentication works.
Organization management works.
User roles work.
Product management works.
Warehouse management works.
Supplier management works.
Purchase order management works.
Exception management works.
Investigation workflow works.
Audit history is visible.
Dashboard uses actual data.
Mobile application
Authentication works.
Purchase orders can be viewed.
Goods receiving works.
Barcode scanning works.
Photo evidence can be attached.
Inventory inspection works.
Submission status is visible.
Offline draft creation works, if included in the delivered scope.
Synchronization is tested, if included in the delivered scope.
Backend
API validation works.
Authentication is secure.
Authorization is enforced.
Organization isolation works.
Database transactions are implemented.
Reconciliation rules work.
Duplicate submissions are handled.
Audit events are recorded.
File uploads are validated.
Error handling is consistent.
Engineering
Git repository is organized.
Database migrations are included.
Unit tests are available.
Integration tests are available.
End-to-end workflow is tested.
Docker configuration works.
Environment variables are documented.
Application is deployed.
README is complete.
Architecture diagram is available.
Portfolio
Screenshots are available.
Demo data is available.
Demonstration video is recorded.
Technical documentation is complete.
Resume description is prepared.
Known limitations are documented.
PART XVII — POST-MVP EXTENSIONS
24. Optional Advanced Engineering Features

These should only be attempted after the core product is complete.

Extension 1: Advanced synchronization
Conflict resolution strategies.
Sync batching.
Incremental synchronization.
Failed-operation recovery.
Synchronization observability.
Extension 2: Background processing
Large import processing.
Scheduled reconciliation.
Report generation.
Notification dispatch.
Retry and dead-letter handling.
Extension 3: Advanced analytics
Supplier performance trends.
Warehouse discrepancy trends.
Resolution performance.
Repeated discrepancy patterns.
Operational anomaly summaries.
Extension 4: AI-assisted investigations
Investigation summaries.
Suggested investigation questions.
CSV column mapping suggestions.
Natural-language report filters.
Extension 5: External integrations
Accounting software integration.
ERP data imports.
Webhook support.
External inventory synchronization.
Extension 6: Advanced reliability
Structured logging.
Request tracing.
Monitoring.
Health checks.
Database backup testing.
Load testing.
PART XVIII — PROJECT SUCCESS CRITERIA
25. What Makes This Project Successful?

OpsTrace will be considered a successful portfolio project if it achieves the following:

Technical success

The web application, mobile application, and backend operate as one cohesive system.

Functional success

A complete receiving-to-investigation workflow works without manual database manipulation.

Security success

Organization-level access controls prevent unauthorized data access.

Engineering success

Critical business logic is tested and documented.

Presentation success

The application can be demonstrated using a realistic synthetic business environment.

Employment success

The developer can confidently explain the architecture, implementation, technical challenges, and trade-offs during interviews.

Commercial success is not part of the initial acceptance criteria.

The project does not require customers, paying users, or business revenue to qualify as a legitimate independent portfolio project.

FINAL DEVELOPMENT PRINCIPLE

Build OpsTrace as if an actual medium-sized company might eventually use it, but be honest that it is an independently developed portfolio project.

Prioritize working business logic over decorative interfaces.

Prioritize data integrity over unnecessary AI features.

Prioritize security over convenience.

Prioritize automated testing over unverified assumptions.

Prioritize understanding your code over generating more code.

The ultimate objective is to build a product that you can open during an interview, demonstrate from beginning to end, and confidently defend at the engineering level.

OpsTrace — Every operation accounted for.