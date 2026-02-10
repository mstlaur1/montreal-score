import { Link } from "@/i18n/navigation";

export default function NotFound() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-16 text-center">
      <h1 className="text-4xl font-bold mb-4">404</h1>
      <p className="text-muted mb-6">This page does not exist.</p>
      <Link
        href="/"
        className="px-4 py-2 bg-accent text-white rounded-lg hover:opacity-90 transition-opacity inline-block"
      >
        Go home
      </Link>
    </div>
  );
}
