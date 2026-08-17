export function SectionPage({ titulo, descripcion }: { titulo: string; descripcion?: string }) {
  return (
    <div className="mx-auto max-w-[86rem]">
      <h1 className="font-display text-2xl font-semibold">{titulo}</h1>
      {descripcion && <p className="mt-2 text-sm text-muted-foreground">{descripcion}</p>}
    </div>
  );
}
