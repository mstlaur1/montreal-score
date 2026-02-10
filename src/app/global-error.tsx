"use client";

export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <html lang="fr">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: "4rem 1rem", textAlign: "center" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: "bold", marginBottom: "1rem" }}>
          Une erreur est survenue / An error occurred
        </h1>
        <p style={{ color: "#666", marginBottom: "1.5rem" }}>
          Veuillez réessayer. / Please try again.
        </p>
        <button
          onClick={reset}
          style={{
            padding: "0.5rem 1rem",
            background: "#2563eb",
            color: "#fff",
            border: "none",
            borderRadius: "0.5rem",
            cursor: "pointer",
          }}
        >
          Réessayer / Try again
        </button>
      </body>
    </html>
  );
}
