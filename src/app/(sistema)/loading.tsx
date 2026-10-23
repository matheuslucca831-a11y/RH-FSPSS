/** Aparece na hora do clique, enquanto a próxima tela carrega */
export default function Carregando() {
  return (
    <div className="w-full animate-pulse" role="status" aria-label="Carregando">
      <div className="h-7 w-56 rounded bg-linha/70" />
      <div className="mt-2 h-4 w-96 max-w-full rounded bg-linha/50" />
      <div className="mt-8 flex gap-2">
        <div className="h-9 w-64 rounded-md bg-linha/60" />
        <div className="h-9 w-36 rounded-md bg-linha/50" />
      </div>
      <div className="mt-4 overflow-hidden rounded-lg border border-linha bg-white">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex gap-4 border-b border-linha/70 px-4 py-3 last:border-0">
            <div className="h-4 w-1/3 rounded bg-linha/60" />
            <div className="h-4 w-1/6 rounded bg-linha/50" />
            <div className="h-4 w-1/4 rounded bg-linha/40" />
          </div>
        ))}
      </div>
      <span className="sr-only">Carregando…</span>
    </div>
  );
}
