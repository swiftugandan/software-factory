// Startup only: builds the app (src/backend/http/app.js) and listens. No app-assembly logic
// lives here so the app stays importable (and listen-free) for tests (ADR-0006, ADR-0007).
import createApp from './http/app.js';
import config from '../../config/app.js';

const app = createApp();

app.listen(config.port, () => {
  console.log(`tinylink listening on port ${config.port}`);
});
