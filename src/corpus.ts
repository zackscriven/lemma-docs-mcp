import fs from "node:fs/promises";
import path from "node:path";
import type { CorpusConfig, DocChunk, RoutedNamespace } from "./types.js";
import { stableId, titleFromPath, tokenize } from "./text.js";

const MAX_MARKDOWN_CHARS = 5000;

const EXCLUDED_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".cache",
  ".turbo",
]);

const SECRET_PATTERNS = [
  /\.env$/i,
  /\.pem$/i,
  /\.key$/i,
  /secret/i,
  /credential/i,
];

export async function buildIndex(config: CorpusConfig): Promise<DocChunk[]> {
  const files = await listFiles(config.corpusRoot);
  const chunks: DocChunk[] = [];

  for (const filePath of files) {
    if (shouldExcludeFile(filePath)) continue;
    const relativePath = path.relative(config.corpusRoot, filePath);
    chunks.push(...(await chunksFromMarkdown(filePath, relativePath, routeNamespace(relativePath))));
  }

  return chunks;
}

/**
 * The Lemma corpus is a flat directory of files named
 * `lemma-docs-<section>-<page>.md` (mirroring getlemma.com/docs paths), so
 * namespace routing keys off the filename prefix rather than subdirectories.
 *
 *   quickstart            -> getting-started
 *   changelog / roadmap   -> product-updates
 *   guides-*  (and rest)  -> guides
 */
export function routeNamespace(relativePath: string): RoutedNamespace {
  const base = path
    .basename(relativePath)
    .toLowerCase()
    .replace(/^lemma-docs-/, "")
    .replace(/^docs-/, "");

  if (base.startsWith("quickstart") || base.startsWith("getting-started")) {
    return "getting-started";
  }
  if (base.startsWith("changelog") || base.startsWith("roadmap")) {
    return "product-updates";
  }
  // Product guides: collaboration, own-multiple-entities, deposit-bonuses,
  // fixed-fee-loans, mso-pc-compliance, and any future guide pages.
  return "guides";
}

async function listFiles(root: string): Promise<string[]> {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith("._")) continue;
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      files.push(...(await listFiles(fullPath)));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }

  return files;
}

function shouldExcludeFile(filePath: string): boolean {
  const base = path.basename(filePath);
  if (base.startsWith("._")) return true;
  if (!filePath.endsWith(".md")) return true;
  return SECRET_PATTERNS.some((pattern) => pattern.test(base));
}

async function chunksFromMarkdown(
  filePath: string,
  relativePath: string,
  namespace: RoutedNamespace,
): Promise<DocChunk[]> {
  const content = await fs.readFile(filePath, "utf8");
  const sections = splitMarkdownByHeading(content);
  const chunks: DocChunk[] = [];

  for (let i = 0; i < sections.length; i += 1) {
    const section = sections[i];
    const pieces = splitLongText(section.text, MAX_MARKDOWN_CHARS);
    for (let j = 0; j < pieces.length; j += 1) {
      const heading = pieces.length > 1 ? `${section.heading} (${j + 1}/${pieces.length})` : section.heading;
      const text = pieces[j];
      chunks.push({
        id: stableId(relativePath, `md-${i}-${j}`),
        namespace,
        sourceType: "markdown",
        filePath,
        relativePath,
        title: titleFromPath(filePath),
        heading,
        text,
        tokens: tokenize(`${relativePath} ${heading} ${text}`),
        metadata: {},
      });
    }
  }

  return chunks;
}

function splitMarkdownByHeading(content: string): Array<{ heading: string; text: string }> {
  const lines = content.split(/\r?\n/);
  const sections: Array<{ heading: string; lines: string[] }> = [];
  let current = { heading: "Overview", lines: [] as string[] };

  for (const line of lines) {
    const headingMatch = /^(#{1,6})\s+(.+)$/.exec(line);
    if (headingMatch && current.lines.join("\n").trim()) {
      sections.push(current);
      current = { heading: headingMatch[2].trim(), lines: [line] };
    } else {
      if (headingMatch) current.heading = headingMatch[2].trim();
      current.lines.push(line);
    }
  }

  if (current.lines.join("\n").trim()) sections.push(current);
  return sections.map((section) => ({ heading: section.heading, text: section.lines.join("\n").trim() }));
}

function splitLongText(input: string, maxChars: number): string[] {
  if (input.length <= maxChars) return [input];
  const paragraphs = input.split(/\n{2,}/);
  const chunks: string[] = [];
  let current = "";

  for (const paragraph of paragraphs) {
    if (`${current}\n\n${paragraph}`.length > maxChars && current.trim()) {
      chunks.push(current.trim());
      current = paragraph;
    } else {
      current = current ? `${current}\n\n${paragraph}` : paragraph;
    }
  }

  if (current.trim()) chunks.push(current.trim());
  return chunks.flatMap((chunk) => {
    if (chunk.length <= maxChars) return [chunk];
    const pieces: string[] = [];
    for (let i = 0; i < chunk.length; i += maxChars) {
      pieces.push(chunk.slice(i, i + maxChars));
    }
    return pieces;
  });
}
