# Notion Property Types — Read/Write Shapes

For each type: what it's good for, and the JSON shape the API expects when writing (`pages.create` / `pages.update`) vs. what you get back when reading (`pages.retrieve` / `databases.query`).

## title
- One per database, mandatory.
- Write: `{ "Nombre de la propiedad": { title: [{ text: { content: "..." } }] } }`
- Read: `page.properties["Nombre"].title[0].plain_text`

## rich_text
- Short-to-medium free text, filterable.
- Write: `{ rich_text: [{ text: { content: "..." } }] }`
- Read: join `plain_text` of each item in the array — text can be split across multiple items.
- Don't use for long-form content; use page body blocks instead (see properties-vs-blocks.md).

## select
- Single choice from a fixed list.
- Write: `{ select: { name: "Opción" } }`
- If "Opción" doesn't exist yet as a database option, the API can auto-create it depending on integration capabilities — don't rely on this for strict validation.
- Read: `properties["Campo"].select?.name`

## multi_select
- Multiple choices from a list; more forgiving for agent-generated categories since new options are added more permissively than select.
- Write: `{ multi_select: [{ name: "A" }, { name: "B" }] }`
- Read: `properties["Campo"].multi_select.map(o => o.name)`

## status
- Similar to select but with fixed groups (To-do / In progress / Complete) configured at the database level.
- Write: `{ status: { name: "En progreso" } }` — the name must already exist as a status option; can't be freely invented by the integration.
- Read: `properties["Campo"].status?.name`

## date
- Write: `{ date: { start: "2026-08-10", end: null } }` (ISO 8601; `end` optional for ranges)
- Read: `properties["Campo"].date?.start`

## relation
- Links to page(s) in another (or the same) database.
- Write: `{ relation: [{ id: "page_id_of_target" }] }` — **requires the target page's ID**, never a name. The integration must search/query first to resolve a name to an ID before writing a relation.
- Read: `properties["Campo"].relation.map(r => r.id)` — note this only returns IDs, not titles; a second lookup is needed to display the related page's name.
- Two-way relations update both sides automatically when written from either side.

## people
- Write: `{ people: [{ id: "user_id" }] }`
- Rarely relevant for personal knowledge-base use cases.

## checkbox
- Write: `{ checkbox: true }`

## number
- Write: `{ number: 42 }`

## url / email / phone_number
- Write: `{ url: "https://..." }` (same pattern for email/phone_number)

## files
- Write: only external URLs can be attached via the API (not native file uploads in most integration setups) — `{ files: [{ name: "...", external: { url: "https://..." } }] }`

## rollup / formula
- **Read-only from the API.** These are computed from related data or other properties inside Notion itself.
- If your pipeline "needs" a rollup-like value (e.g. count of related concepts), compute it in your own code and write the result to a plain `number` or `rich_text` property instead — don't design a rollup expecting to write to it.

## Common mistake to flag

Writing a plain string where the API expects a nested object is the #1 integration bug — e.g. sending `"En progreso"` instead of `{ select: { name: "En progreso" } }`. Always show the full nested shape, not just the value, when giving code examples.
