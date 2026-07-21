// Shared `pg` Pool (ADR-0004: pg driver, parameterized SQL, no ORM). Reads `DATABASE_URL`
// from config/app.js (ADR-0013) — never `process.env` directly. Constructing a `Pool` opens
// no connection eagerly (pg connects lazily on first query), so importing this module stays
// side-effect-free enough for tests to import repositories without a live DB (ADR-0006).
import pg from 'pg';
import config from '../../../config/app.js';

const { Pool } = pg;

const pool = new Pool({ connectionString: config.databaseUrl });

export default pool;
