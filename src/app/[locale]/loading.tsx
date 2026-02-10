export default function Loading() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8 animate-pulse">
      <div className="h-10 bg-card-border rounded w-64 mx-auto mb-4" />
      <div className="h-4 bg-card-border rounded w-96 mx-auto mb-12" />
      <div className="space-y-8">
        {[1, 2, 3].map((i) => (
          <div key={i} className="border border-card-border rounded-xl p-6">
            <div className="h-6 bg-card-border rounded w-48 mb-4" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((j) => (
                <div key={j}>
                  <div className="h-3 bg-card-border rounded w-20 mb-2" />
                  <div className="h-8 bg-card-border rounded w-16" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
