# Notion API Limits Relevant to Schema Design

- **Rate limit**: ~3 requests/second average (bursts tolerated, sustained overuse gets throttled with 429s). Schemas that require resolving multiple relations per write (looking up several related page IDs before creating one page) multiply request count — worth batching/caching lookups rather than querying per relation.
- **Pagination**: `databases.query` and `blocks.children.list` return a max of 100 results per call. Always loop with `start_cursor`/`has_more` for anything beyond that.
- **Rich text length**: individual rich_text property values and block content have a length ceiling (low thousands of characters per block/property). Long content should be split across multiple blocks/paragraphs rather than a single huge property value.
- **Relation property**: no hard documented cap on number of related pages, but very large fan-out (hundreds of relations on one page) will slow down both reads and the UI — consider whether a tagging/category approach scales better than a relation for high-fan-out cases.
- **Select/multi-select/status option lists**: grow unbounded if the integration keeps inventing new values — worth periodically reviewing and consolidating options so the database stays usable in the Notion UI, not just for the API.
