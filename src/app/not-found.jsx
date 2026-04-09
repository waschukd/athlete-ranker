import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-6">
      <div className="text-center max-w-md">
        <div className="text-7xl font-bold text-[#1A6BFF] mb-4">404</div>
        <h2 className="text-xl font-bold text-white mb-3">Page not found</h2>
        <p className="text-gray-400 text-sm mb-8 leading-relaxed">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <Link
          href="/"
          className="inline-flex px-6 py-3 bg-gradient-to-r from-[#1A6BFF] to-[#4D8FFF] text-white rounded-xl font-semibold text-sm hover:shadow-lg transition-shadow"
        >
          Back to Home
        </Link>
      </div>
    </div>
  );
}
