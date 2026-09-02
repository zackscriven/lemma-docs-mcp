# lemma_docs_mcp

_Part of [PracticeOS](https://privatepracticeos.app) — the operating layer for therapy practice owners, by Private Practice Collective._

Read-only MCP (Model Context Protocol) server for semantic search over a locally supplied copy of **Lemma's documentation** (getlemma.com — healthcare-practice banking: entity accounts, deposit bonuses, fixed fee loans, cash sweeps, MSO-PC compliant banking). Same architecture as its siblings in this folder (`whop_docs_mcp`, `stedi_docs_mcp`, `ghl_docs_mcp`, …): stdio transport, TypeScript, two read-only tools, in-memory index built lazily on first call. It **never calls live Lemma or banking APIs**.

Open `overview.html` for the branded one-page summary.

## Corpus

- Default root: `PPC/Product/PracticeOS/Lemma/docs/` (sibling `PPC/` of `MCP_Servers/` on the drive). Override with `LEMMA_DOCS_CORPUS_ROOT`.
- Flat folder of `lemma-docs-*.md` files. As of 2026-08-26: **8 documents → 61 chunks** — the full set of pages Lemma exposes via its markdown export endpoint.
- **Not covered** (exists on getlemma.com but has no `.md` export): banking operations (accounts, cards, transactions, move money), insurance & billing (lockbox, EOB, reconciliation), invoicing, team management, API reference. The tools say so rather than guessing.
- Namespace routing keys off filename prefix: `quickstart` → `getting-started`; `changelog` / `roadmap` → `product-updates`; everything else (the `guides-*` pages) → `guides`.

## Tools

| Tool | Purpose |
| --- | --- |
| `lemma_docs_context` | Ranked excerpt search for a question/task. Auto-routes to a namespace, returns compact chunks with ids, source paths, pagination, follow-ups. |
| `lemma_docs_get` | Full text of specific chunks by id, or a whole document by relative path. The expansion step after search. |

Both declare `readOnlyHint`, `idempotentHint`, `openWorldHint:false`, and attach structured content alongside markdown.

## Build & verify

```bash
npm install
npm run build
npm run dry-run          # index stats (8 docs → 61 chunks)
npm run query -- "how does the deposit bonus accrue"
npm run test             # assertions against the real corpus
npm run test:fixture     # 35-assertion behavior suite, runs anywhere
npm run smoke            # end-to-end MCP wire-protocol test (17 checks)
```

## Register in Claude Desktop / Cowork

`~/Library/Application Support/Claude/claude_desktop_config.json` → `mcpServers`:

```json
"lemma-docs": {
  "command": "/absolute/path/to/node",
  "args": ["/absolute/path/to/lemma_docs_mcp/dist/index.js"]
}
```

No env needed — the corpus root default resolves relative to this folder. Restart Claude Desktop after editing. For Codex, add the equivalent `[mcp_servers.lemma-docs]` TOML table (see `MCP_Servers/CLAUDE.md`).

## Licensing

Code is MIT; the Lemma documentation content is © Lemma, supplied locally, never redistributed. See `NOTICE.md` before publishing anything from this folder.
