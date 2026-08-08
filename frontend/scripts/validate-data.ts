// Load .env.local for local dev (tsx doesn't auto-load Next.js env files)
try { process.loadEnvFile('.env.local'); } catch {}
import { validateAllData, printValidationResult } from '../lib/validate';

(async () => {
  const errors = await validateAllData();
  const hasErrors = printValidationResult(errors);
  if (hasErrors) {
    process.exit(1);
  }
})();