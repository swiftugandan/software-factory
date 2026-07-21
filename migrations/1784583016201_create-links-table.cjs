/**
 * T007 (AC-4, AC-6, AC-22, AC-23, AC-24) — `links` table: the short-link aggregate.
 *
 * Conventions per ADR-0005: bigint identity PK (internal, never exposed — `code` is the
 * external business key per ADR-0010), snake_case, `member_id` fk `ON DELETE RESTRICT`,
 * `created_at timestamptz` UTC default now() (AC-22), `deleted_at timestamptz NULL`
 * (null = active) per ADR-0012's soft-delete decision (AC-23) — `links` is the only
 * user-owned table that gets it. `code` is `varchar(7) UNIQUE` — the concurrency source of
 * truth for collision-free code generation (AC-6, ADR-0010) — and `long_url varchar(2048)`
 * matches the max length enforced by the URL validator (T013).
 *
 * Index: `links (member_id, created_at DESC)` for owner-scoped newest-first listing
 * (AC-17/AC-18/AC-19, ADR-0005).
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
  pgm.createTable('links', {
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
    code: {
      type: 'varchar(7)',
      notNull: true,
    },
    long_url: {
      type: 'varchar(2048)',
      notNull: true,
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
    deleted_at: {
      // NULL = active (ADR-0012). No user-facing delete this release; the column and read
      // filter exist so deletion can be turned on later without a migration.
      type: 'timestamptz',
      notNull: false,
    },
  });

  pgm.addConstraint('links', 'links_code_key', {
    unique: ['code'],
  });

  pgm.createIndex('links', ['member_id', { name: 'created_at', sort: 'DESC' }], {
    name: 'links_member_id_created_at_idx',
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
exports.down = (pgm) => {
  pgm.dropTable('links');
};
