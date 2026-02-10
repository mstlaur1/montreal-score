"use client";

export default function Error({ reset }: { reset: () => void }) {
  return (
    <div className="max-w-2xl mx-auto px-4 py-16 text-center">
      <h1 className="text-2xl font-bold mb-4">Something went wrong</h1>
      <p className="text-muted mb-6">
        The data could not be loaded. Please try again.
      </p>
      <button
        onClick={reset}
        className="px-4 py-2 bg-accent text-white rounded-lg hover:opacity-90 transition-opacity"
      >
        Try again
      </button>
    </div>
  );
}
