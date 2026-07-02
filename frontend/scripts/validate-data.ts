import { validateAllData, printValidationResult } from '../lib/validate';

(async () => {
  const errors = await validateAllData();
  const hasErrors = printValidationResult(errors);
  if (hasErrors) {
    process.exit(1);
  }
})();