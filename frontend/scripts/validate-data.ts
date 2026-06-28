import { validateAllData, printValidationResult } from '../lib/validate';

const errors = validateAllData();
const hasErrors = printValidationResult(errors);
if (hasErrors) {
  process.exit(1);
}
