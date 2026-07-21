/**
 * T005 (AC-2) — `oauth_identities` table: links a `members` row to a provider account.
 *
 * Conventions per ADR-0005: bigint identity PK, snake_case, `member_id` fk named
 * `<referenced>_id`, `created_at timestamptz` UTC default now(), `ON DELETE RESTRICT`
 * (soft delete is the only removal path; hard delete of a member is not part of this
 * release). `provider`/`provider_subject` are provider-agnostic text columns (Ledger #18)
 * so a second OAuth provider is a config change, not a schema change (ADR-0009).
 * `UNIQUE (provider, provider_subject)` is the collision guard against re-provisioning the
 * same external account (ADR-0005, Ledger #18).
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
  pgm.createTable('oauth_identities', {
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
    provider: {
      type: 'text',
      notNull: true,
    },
    provider_subject: {
      type: 'text',
      notNull: true,
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  });

  pgm.addConstraint('oauth_identities', 'oauth_identities_provider_provider_subject_key', {
    unique: ['provider', 'provider_subject'],
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
exports.down = (pgm) => {
  pgm.dropTable('oauth_identities');
};
