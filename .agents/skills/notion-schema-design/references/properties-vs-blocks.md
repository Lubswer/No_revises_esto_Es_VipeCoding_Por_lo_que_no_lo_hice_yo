# Properties vs. Page Body Blocks

A common design mistake: cramming long-form content (explanations, extracted notes, summaries) into a `rich_text` property because it's easier to write via `pages.create()` in one call.

## Use properties for
- Short, structured, filterable/sortable data: status, category, date, a one-line summary, relations to other pages.
- Anything you'll want to query, filter, or sort on later via `databases.query`.

## Use page body blocks for
- The actual explanation/content of a concept — paragraphs, bullet lists, code blocks, headings.
- Anything long-form that a human will actually read on the page, not just scan in a table view.

## Why it matters for an integration

- Reading: `pages.retrieve()` only returns properties. To get body content you need a **separate call**, `blocks.children.list(page_id)`, and it's paginated and recursive (nested blocks, e.g. a bullet with sub-bullets, need their own `blocks.children.list` call).
- Writing: body content is added via `blocks.children.append(page_id, { children: [...] })` — a different call from `pages.create()`, which only sets properties (though `pages.create` does accept an initial `children` array for body content at creation time).
- If a pipeline only ever calls `pages.create()`/`pages.update()` and never touches `blocks`, it will silently produce pages with correct properties but **empty bodies** — a common bug when someone designs the schema without accounting for this split.

## Rule of thumb

If the user describes wanting to store "the explanation of the concept," "notes," or anything they'd expect to read as prose on the page — steer that into body blocks, not a rich_text property, and make sure the write pipeline calls `blocks.children.append` (or passes `children` at creation) accordingly.
