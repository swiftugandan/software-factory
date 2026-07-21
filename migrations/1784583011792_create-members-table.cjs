/**
 * T004 (AC-2) — `members` table: the identity backing email/password + OAuth sign-in.
 *
 * Conventions per ADR-0005 (schema conventions):
 *  - `id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY` (internal id, never exposed).
 *  - snake_case table/columns.
 *  - `created_at timestamptz NOT NULL DEFAULT now()` (UTC, AC-22).
 *  - `members.email` UNIQUE; `members.password_hash` NULLABLE (Ledger #19, ADR-0009: OAuth-only
 *    members and future self-service registration both fit without a later migration).
 *  - No `deleted_at` here: ADR-0005/ADR-0012 scope soft delete to `links` only; there is no
 *    member-delete capability this release (PRD non-goal).
 *
 * Gap/assumption (logged to docs/assumptions.md, owner build-database): the PRD/ADRs leave the
 * case-sensitivity of `email` uniqueness unspecified ("email citext/varchar unique" per task).
 * We use `citext` so two members cannot register the same address differing only by case,
 * matching Ledger #14's no-enumeration intent and common practice for email uniqueness.
 * Reversibility: cheap — `citext` can be swapped for `varchar` with a follow-up
 * `ALTER COLUMN ... TYPE varchar` migration; no application code depends on the type beyond
 * equality comparisons.
 */

/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
exports.up = (pgm) => {
  // citext gives case-insensitive uniqueness for email (build-database assumption, see header).
  pgm.createExtension('citext', { ifNotExists: true });

  pgm.createTable('members', {
    id: {
      type: 'bigint',
      primaryKey: true,
      notNull: true,
      sequenceGenerated: {
        precedence: 'ALWAYS',
      },
    },
    email: {
      type: 'citext',
      notNull: true,
    },
    password_hash: {
      // Nullable per Ledger #19: OAuth-only members have no password; scrypt-encoded
      // hash+salt+params (ADR-0009) stored as text when present.
      type: 'text',
      notNull: false,
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  });

  pgm.addConstraint('members', 'members_email_key', {
    unique: ['email'],
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
exports.down = (pgm) => {
  pgm.dropTable('members');
  // The citext extension is left installed: other tables/migrations may depend on it and
  // dropping a database-wide extension from a single table's down migration is unsafe.
};
