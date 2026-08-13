// Load .env.local for local dev (tsx doesn't auto-load Next.js env files)
// NOTE: Must be loaded BEFORE any imports below compute module-level constants
// like API_BASE in lib/api.ts. This file uses dynamic import for validate.ts
// to ensure process.loadEnvFile runs first.
try { process.loadEnvFile('.env.local'); } catch {}

(async () => {
  const { validateAllData, printValidationResult } = await import('../lib/validate');
  const errors = await validateAllData();
  const hasErrors = printValidationResult(errors);
  if (hasErrors) {
    process.exit(1);
  }
})();