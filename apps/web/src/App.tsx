export function App() {
  return (
    <main className="flex h-dvh w-dvw bg-ground text-ink">
      <section aria-label="Map" className="grid flex-1 place-items-center text-ink/50">
        The map arrives with the next pull request
      </section>
      <aside className="w-80 border-rule border-l p-4">
        <p className="text-ink/70 text-sm">Click on the map to start a chat</p>
      </aside>
    </main>
  );
}
