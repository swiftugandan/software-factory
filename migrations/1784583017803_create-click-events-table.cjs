/**
 * T008 (AC-13, AC-14, AC-22, AC-24) — `click_events` table: one row per successful redirect
 * (ADR-0011). Append-only — no `deleted_at` (ADR-0005 scopes soft delete to `links`); no
 * counter column on `links` — totals are derived via `COUNT(*)` grouped by `link_id`
 * (ADR-0011), avoiding the read-modify-write race a denormalized counter would create.
 *
 * `link_id` fk `ON DELETE RESTRICT` per ADR-0005 (soft delete is the only removal path for
 * `links`; a click row's parent link is never hard-deleted out from under it). Index on
 * `link_id` for the count aggregation (AC-14, ADR-0005).
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
  pgm.createTable('click_events', {
    id: {
      type: 'bigint',
      primaryKey: true,
      notNull: true,
      sequenceGenerated: {
        precedence: 'ALWAYS',
      },
    },
    link_id: {
      type: 'bigint',
      notNull: true,
      references: 'links',
      onDelete: 'RESTRICT',
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  });

  pgm.createIndex('click_events', 'link_id', {
    name: 'click_events_link_id_idx',
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
exports.down = (pgm) => {
  pgm.dropTable('click_events');
};
