import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="text-center py-20">
      <h1 className="text-4xl font-bold mb-4">404</h1>
      <Link href="/" className="text-blue-600 hover:underline">Back to Home</Link>
    </div>
  );
}
