export function App() {
  return (
    <main className="flex h-dvh w-dvw">
      <section aria-label="Map" className="grid flex-1 place-items-center bg-stone-100 text-stone-400">
        The map arrives with the next pull request
      </section>
      <aside className="w-80 border-stone-300 border-l bg-white p-4">
        <p className="text-stone-600 text-sm">Click on the map to start a chat</p>
      </aside>
    </main>
  );
}
