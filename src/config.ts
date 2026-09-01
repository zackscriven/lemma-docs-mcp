import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { CorpusConfig } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function resolveConfig(): CorpusConfig {
  const serverRoot = path.resolve(__dirname, "..");
  // MCP_Servers/ is a sibling of PPC/ under the Extreme SSD root, so two
  // levels up from serverRoot lands on the drive root; step into PPC
  // explicitly rather than assuming nesting (same convention as
  // whop_docs_mcp and stedi_docs_mcp).
  const defaultCorpusRoot = path.resolve(
    serverRoot,
    "..",
    "..",
    "PPC",
    "Product",
    "PracticeOS",
    "Lemma",
    "docs",
  );
  const corpusRoot = process.env.LEMMA_DOCS_CORPUS_ROOT ?? defaultCorpusRoot;

  return { corpusRoot };
}

/**
 * Fails fast with an actionable message when the corpus root is missing,
 * instead of silently serving an empty index.
 */
export function assertCorpusRoot(config: CorpusConfig): void {
  let isDirectory = false;
  try {
    isDirectory = fs.statSync(config.corpusRoot).isDirectory();
  } catch {
    isDirectory = false;
  }

  if (!isDirectory) {
    throw new Error(
      `Lemma docs corpus root not found at "${config.corpusRoot}". ` +
        `Set the LEMMA_DOCS_CORPUS_ROOT environment variable to the absolute path of the folder ` +
        `containing the lemma-docs-*.md files (default: PPC/Product/PracticeOS/Lemma/docs) ` +
        `and restart the server.`,
    );
  }
}
