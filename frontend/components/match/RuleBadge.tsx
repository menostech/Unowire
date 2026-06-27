export function RuleBadge({ passed, required, skipped }: { passed: boolean; required: boolean; skipped: boolean }) {
  if (skipped) {
    return <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-xs rounded">N/A</span>;
  }
  if (passed) {
    return (
      <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded">
        ✓ {required ? 'Required' : 'Optional'}
      </span>
    );
  }
  return (
    <span className={`px-2 py-0.5 text-xs rounded ${required ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
      ✗ {required ? 'Required' : 'Optional'}
    </span>
  );
}
