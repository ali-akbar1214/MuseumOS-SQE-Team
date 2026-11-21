# MuseumOS Test Scope

## Baseline

- Repository: https://github.com/akolit/MuseumOS
- License: GNU Affero General Public License v3.0
- Baseline commit: `0ef7004ebef1c59130101fa0a56c95a50ca31900`
- Stack: React 19, NestJS 11, Prisma 6, PostgreSQL 16
- Test environment: Windows 11, Node.js 26.5.0, pnpm 10.33.2, Docker 29.8.1

## Workflows

### W1 - Catalogue an exhibit

Starting condition: an authenticated curator has access to the exhibit catalogue and at least one category exists.

User action: open Add Exhibit, enter a name, select a category, optional year and price, save.

Expected outcome: a record is created once, receives a generated display ID, is assigned to the current user, and can be read back from `/api/exhibits/:id`.

Shared record: the exhibit ID, name, category ID, year, price, `validated`, and `published` fields.

### W2 - Validate and publish an exhibit

Starting condition: a persisted draft exhibit exists.

User action: a senior curator or admin sets `validated=true`, then `published=true`.

Expected outcome: the exhibit moves draft -> validated -> published. Publishing an unvalidated, unnamed, or uncategorized exhibit is rejected. A published exhibit cannot return to draft or validated.

Shared record: the same exhibit record changed by W1 and read by W2.

## Functional requirements

| ID | Workflow | Requirement |
|---|---|---|
| FR-01 | W1 | An exhibit name is required and may contain at most 500 characters |
| FR-02 | W1 | A category UUID is required |
| FR-03 | W1 | Acquisition year is null or an integer from 1800 through 2100 |
| FR-04 | W1 | Collectible price is null or non-negative |
| FR-05 | W1 | Creation auto-fills acquisition date and generates display ID |
| FR-06 | W2 | Only validated exhibits may be published |
| FR-07 | W2 | Publishing requires a non-empty name and category |
| FR-08 | W2 | A published exhibit cannot move back to draft or validated |

## Business rules

1. **Boundary rule:** acquisition year must be null or between 1800 and 2100 inclusive.
2. **Boundary rule:** collectible price must be null or greater than or equal to zero.
3. **Boolean decision:** an exhibit is publishable only if it is validated AND (name is non-empty AND category exists).
4. **State rule:** a published exhibit cannot transition to draft or validated.

## Roles

- Viewer: read exhibits, but cannot create or change lifecycle fields.
- Curator: read/write exhibits, but must not publish or validate.
- Senior curator/admin: read/write/validate; senior curator also can delete. Admin has every permission.
