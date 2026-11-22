<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

- Keep the three-screen introduction in a separate presentation component before mounting the existing constructor; this preserves the order workflow and its saved state.
- Use a shared DocumentCard with descriptions from a browser-safe catalog module wherever individual documents appear; this keeps flip behavior and fixed-size internal scrolling consistent without affecting purchase or download actions.
- Scope responsive controls to app-shell, use zero-minimum content tracks and container queries for document layouts; nested documents must fit their available width rather than the viewport alone.
- Personal cabinet: login (email one-time code) gates / before Onboarding; per-user form and purchases live in the cabinets table, localStorage is only a per-user cache — so documents can be re-downloaded on any device.
- Frontend demo requires both the Preview build flag and this project's verified hostname after hydration; lazy demo imports are eliminated by the Yandex build's false flag so production cannot load mock users or purchases.
- Production form defaults are empty and must never import Preview fixtures; user/server values alone populate real forms to prevent synthetic data being saved to YDB.
- Universal Yandex releases use bundler dependency metadata, literal API/Gateway inventory, full Function config read-back, pinned version tags and exact-artifact compatibility evidence before activation; this prevents silent omissions or immediate $latest activation.
- Persist pending releases and checksummed recovery snapshots before cloud writes; locally rehearsed recovery restores static files, the pinned Function/Gateway and the previous manifest, while uncertain YDB changes stop automated code rollback.
- Apply only separately approved, preflighted single-statement idempotent additive YDB migrations with complete schema postconditions; destructive DDL stays blocked until an external recovery workflow is implemented and rehearsed.
