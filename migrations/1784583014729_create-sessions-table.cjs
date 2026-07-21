/**
 * T006 (AC-2) — `sessions` table: server-side session tracking (ADR-0009).
 *
 * Conventions per ADR-0005: bigint identity PK, snake_case, `member_id` fk `ON DELETE
 * RESTRICT`, `created_at`/`expires_at` both `timestamptz` UTC. Append-only/operational table
 * — no `deleted_at` (ADR-0005 scopes soft delete to `links`); expiry is handled by
 * `expires_at`, not deletion.
 *
 * Gap/assumption (logged to docs/assumptions.md, owner build-database): ADR-0009 wants the
 * session cookie to carry "an opaque ... random session id (>=128 bits from
 * crypto.randomBytes)", but ADR-0005's convention makes every table's `id` a sequential
 * bigint identity column — sequential ids are guessable and unsuitable as the cookie's bearer
 * token. T006's column list (as scoped here) is exactly `id, member_id, created_at,
 * expires_at`; this migration implements that literally and leaves generation of the
 * opaque/random session token to T009 (build-backend), which is out of this migration's
 * scope. Reversibility: cheap — a follow-up migration can add a dedicated random token column
 * (e.g. `session_token text UNIQUE`) without touching existing rows if T009 needs one instead
 * of reusing `id`.
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
  pgm.createTable('sessions', {
    id: {
      type: 'bigint',
      primaryKey: true,
      notNull: true,
      sequenceGenerated: {
        precedence: 'ALWAYS',
      },
    },
    member_id: {
      type: 'bigint',
      notNull: true,
      references: 'members',
      onDelete: 'RESTRICT',
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
    expires_at: {
      type: 'timestamptz',
      notNull: true,
    },
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
exports.down = (pgm) => {
  pgm.dropTable('sessions');
};
