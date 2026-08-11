---
name: notion-schema-design
description: Design or review Notion database schemas that will be read and written by an API integration (not just used manually in the Notion UI). Use this whenever the user is planning a Notion database for an automated pipeline, an AI agent, a Mem0/MCP integration, or any script that needs to create/update pages programmatically — especially when they mention property types, relations, what Notion "can do", or ask you to design/review a database structure. Make sure to trigger this even if the user just says things like "help me design my Notion base" or "what properties should I use", since schema choices made in the UI directly determine how hard the API code will be later.
---

# Notion Schema Design (for API-driven integrations)

Notion databases are easy to design casually in the UI, but every property type has a **different JSON shape** on the API side, and some UI-friendly choices (rollups, formulas, some relation setups) are read-only or awkward to write to. This skill exists to catch that mismatch *before* the schema is built, not after the write code breaks.

## When to use this

Use this skill any time the schema will be touched by code — not just typed into manually. Signs this applies:
- The user is building an agent/script/automation that writes to Notion (this includes Mem0-style memory pipelines, MCP-based agents, CSV/JSON import scripts).
- The user asks "what properties should I use" or "help me design my database" for something that isn't purely manual note-taking.
- The user is debugging why a write via the API isn't behaving as expected in the UI.

If the user just wants a normal, manually-maintained Notion page/database with no automation involved, this skill is overkill — just help them directly.

## Step 1 — Clarify the write pattern first

Before proposing any properties, find out:
1. **Who writes what.** Will the integration only create new pages, or also update/relate existing ones? (This determines whether you need a reliable lookup key.)
2. **What lives in properties vs. in the page body.** Properties are for short, structured, filterable/sortable data (status, date, category, relation). Long-form content (explanations, notes, extracted text) belongs in the page body as blocks, not crammed into a rich_text property — see `references/properties-vs-blocks.md`.
3. **How duplicates are detected.** If the integration will decide "update this vs. create new", the schema needs a field to search against reliably (usually the Title property, since `databases.query` can filter on it, or a dedicated unique key field).

## Step 2 — Pick property types deliberately, not by default

Every property type maps to a different JSON structure when reading and writing via the API. Load `references/property-types.md` for the full read/write shape of each type before finalizing the schema — this prevents the most common integration bug: assuming a property is a plain string when it's actually a nested object (e.g. `select` needs `{ select: { name: "..." } }`, not a string).

Quick rules of thumb when designing:
- **Relation properties** require the related page's `page_id`, never a name/string. If the agent will "relate this concept to existing ones," the pipeline must look up the target page's ID first (via search/query) — the schema alone doesn't solve this.
- **Rollups and formulas are read-only from the API.** Never design a field the integration needs to *write* as a rollup/formula — compute it in your code and write to a plain property instead.
- **Select/multi-select options must exist before (or be created on) write.** If the agent will invent new category names dynamically, use multi-select (which can auto-create new options on write) rather than select if strict validation isn't needed — otherwise the write can fail on an unrecognized option.
- **Status vs. Select**: Status properties have a fixed set of groups (To-do/In progress/Complete) defined at the database level and can't have arbitrary values added on the fly by the API — use plain Select if the integration needs to introduce new values freely.
- **Title is mandatory and singular.** Every database has exactly one Title property; it's what shows in search results and is the anchor for most lookups — don't bury the natural "name" of a record in a different property.

## Step 3 — Design for lookups, not just display

An integration schema needs at least one property that supports **reliable retrieval before write** (to check "does this already exist"). Recommend:
- A clean, consistent Title (the most searchable field).
- Optionally, a hidden/plain-text key property if titles alone aren't unique enough (e.g. slugs, external IDs).

Flag to the user if their proposed schema has no reliable way to look up an existing record before deciding to create vs. update — this is the single most common design gap that causes duplicate pages later.

## Step 4 — Sanity-check against API limits

Mention these constraints if relevant to the user's plan (full detail in `references/api-limits.md`):
- Rate limit ~3 requests/second average — schemas with heavy per-page relation lookups multiply request count fast.
- `databases.query` returns max 100 results per page — pagination via cursor is required for larger bases.
- Rich text properties have a length ceiling; long content belongs in page body blocks, not properties.

## Step 5 — Produce the final schema as a table

Always end by presenting the finished schema as a table (Property name | Type | Purpose | Written by integration? Y/N | Notes on write shape), so the user has something concrete to create in the Notion UI and something you (or their code) can reference when writing the API calls later. Don't just describe it in prose.

## Reference files

- `references/property-types.md` — full list of Notion property types with their exact read/write JSON shape, loaded when finalizing property choices.
- `references/properties-vs-blocks.md` — guidance on what belongs in a property vs. in page body content.
- `references/api-limits.md` — rate limits, pagination, and size constraints relevant to schema decisions.
