/**
 * Authenticated workspace layout: a persistent sidebar and a content region.
 * There is no desktop top navigation bar; below the large breakpoint the
 * sidebar provides its own minimal menu trigger.
 */
export function WorkspaceShell({ sidebar, children }) {
  return (
    <div className="flex min-h-svh flex-col lg:flex-row">
      {sidebar}
      <main id="workspace-content" className="min-w-0 flex-1 px-5 py-8 sm:px-8 lg:px-12">
        <div className="mx-auto w-full max-w-3xl">{children}</div>
      </main>
    </div>
  );
}
