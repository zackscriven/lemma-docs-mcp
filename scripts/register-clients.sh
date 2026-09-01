#!/bin/bash
# Registers lemma-docs + whop-docs + plaud-docs in Claude Code AND Claude Desktop/Cowork.
# Idempotent — safe to re-run. Backs up claude_desktop_config.json first.
set -e

NODE="/Users/zackscriven/.nvm/versions/node/v25.9.0/bin/node"
MCP="/Volumes/Extreme SSD/MCP_Servers"

# Locate the claude CLI (not on PATH inside bash scripts).
CLAUDE=""
for c in \
  "$(command -v claude 2>/dev/null)" \
  "$HOME/.claude/local/claude" \
  "$HOME/.local/bin/claude" \
  "/Users/zackscriven/.nvm/versions/node/v25.9.0/bin/claude" \
  "/opt/homebrew/bin/claude" \
  "/usr/local/bin/claude"; do
  if [ -n "$c" ] && [ -x "$c" ]; then CLAUDE="$c"; break; fi
done

echo "== 1) Claude Code (CLI + VS Code extension) =="
if [ -n "$CLAUDE" ]; then
  "$CLAUDE" mcp add --scope user lemma-docs -- "$NODE" "$MCP/lemma_docs_mcp/dist/index.js" || true
  "$CLAUDE" mcp add --scope user whop-docs  -- "$NODE" "$MCP/whop_docs_mcp/dist/index.js"  || true
  "$CLAUDE" mcp add --scope user plaud-docs -- "$NODE" "$MCP/plaud_docs_mcp/dist/index.js" || true
else
  echo "claude CLI not found — skipping Claude Code registration."
fi

echo "== 2) Claude Desktop / Cowork =="
python3 - <<'EOF'
import json, pathlib, shutil
p = pathlib.Path.home()/"Library/Application Support/Claude/claude_desktop_config.json"
shutil.copy(p, p.with_name(p.name + ".bak"))
cfg = json.loads(p.read_text())
node = "/Users/zackscriven/.nvm/versions/node/v25.9.0/bin/node"
mcp = "/Volumes/Extreme SSD/MCP_Servers"
for name, folder in [("lemma-docs", "lemma_docs_mcp"), ("whop-docs", "whop_docs_mcp"), ("plaud-docs", "plaud_docs_mcp")]:
    cfg.setdefault("mcpServers", {})[name] = {
        "command": node,
        "args": [f"{mcp}/{folder}/dist/index.js"],
    }
p.write_text(json.dumps(cfg, indent=2))
print("lemma-docs + whop-docs + plaud-docs added to claude_desktop_config.json (backup: .bak).")
EOF

echo "== 3) Verify =="
if [ -n "$CLAUDE" ]; then "$CLAUDE" mcp list; fi
echo
echo "Done. Fully restart Claude Desktop (Cmd+Q, reopen) to pick up the new servers."
