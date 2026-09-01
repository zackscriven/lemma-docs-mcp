import path from "node:path";
import { buildIndex } from "./corpus.js";
import { assertCorpusRoot, resolveConfig } from "./config.js";
import { buildContextResponse, buildGetResponse } from "./search.js";
import { contextToMarkdown, getToMarkdown } from "./format.js";
import { buildFixtureCorpus } from "./fixture.js";
import type { DocChunk } from "./types.js";

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);

  if (command === "test" && rest.includes("--fixture")) {
    await runFixtureTests();
    return;
  }

  const config = resolveConfig();
  assertCorpusRoot(config);
  const chunks = await buildIndex(config);

  if (command === "dry-run") {
    const stats = summarize(chunks);
    console.log(JSON.stringify(stats, null, 2));
    return;
  }

  if (command === "query") {
    const query = rest.join(" ").trim();
    if (!query) throw new Error('Usage: npm run query -- "your query"');
    console.log(JSON.stringify(buildContextResponse(chunks, { query }), null, 2));
    return;
  }

  if (command === "test") {
    runCorpusAssertions(chunks);
    const queries = [
      "How does the deposit bonus accrue?",
      "Open an account for a new PLLC entity",
      "Does Lemma support Zelle yet?",
      "MSO-PC compliance guardrails for a practice",
      "Share the onboarding application with a partner",
    ];
    for (const query of queries) {
      const response = buildContextResponse(chunks, { query });
      console.log(`${query} -> ${response.namespace} (${response.chunks.length} chunks)`);
    }
    console.log("All local checks passed.");
    return;
  }

  throw new Error("Usage: node dist/cli.js <dry-run|query|test> [--fixture]");
}

function summarize(chunks: DocChunk[]) {
  const byNamespace: Record<string, number> = {};
  const documents = new Set<string>();
  for (const chunk of chunks) {
    byNamespace[chunk.namespace] = (byNamespace[chunk.namespace] ?? 0) + 1;
    documents.add(chunk.relativePath);
  }

  return {
    corpusRoot: resolveConfig().corpusRoot,
    documents: documents.size,
    chunks: chunks.length,
    byNamespace,
  };
}

/** Assertions that require the real Lemma corpus (8 markdown pages). */
function runCorpusAssertions(chunks: DocChunk[]): void {
  assertNoExcludedArtifacts(chunks);

  const documents = new Set(chunks.map((chunk) => chunk.relativePath));
  if (documents.size < 8) {
    throw new Error(`Expected at least 8 corpus documents, found ${documents.size}.`);
  }
  if (!chunks.some((chunk) => chunk.relativePath.includes("quickstart"))) {
    throw new Error("Missing chunks for the quickstart page.");
  }
  if (!chunks.some((chunk) => chunk.namespace === "getting-started")) {
    throw new Error("No getting-started chunks indexed.");
  }
  if (!chunks.some((chunk) => chunk.namespace === "guides")) {
    throw new Error("No guides chunks indexed.");
  }
  if (!chunks.some((chunk) => chunk.namespace === "product-updates")) {
    throw new Error("No product-updates chunks indexed.");
  }
}

function assertNoExcludedArtifacts(chunks: DocChunk[]): void {
  if (chunks.some((chunk) => path.basename(chunk.filePath).startsWith("._"))) {
    throw new Error("Index contains AppleDouble sidecar files.");
  }
  if (chunks.some((chunk) => chunk.filePath.includes(`${path.sep}.git${path.sep}`))) {
    throw new Error("Index contains .git internals.");
  }
}

/** Full behavior suite against the synthetic fixture corpus — runs anywhere. */
async function runFixtureTests(): Promise<void> {
  const { config, cleanup } = buildFixtureCorpus();
  let passed = 0;
  const check = (condition: boolean, label: string): void => {
    if (!condition) throw new Error(`Fixture check failed: ${label}`);
    passed += 1;
  };

  try {
    assertCorpusRoot(config);
    const chunks = await buildIndex(config);

    // --- Exclusions ---
    assertNoExcludedArtifacts(chunks);
    passed += 1;
    check(!chunks.some((c) => c.relativePath.endsWith("api-secret.md")), "secret-pattern file excluded");
    check(!chunks.some((c) => c.relativePath.endsWith("notes.txt")), "non-md file excluded");
    check(!chunks.some((c) => c.relativePath.includes(".git")), ".git contents excluded");

    // --- Corpus-root validation ---
    let corpusError = "";
    try {
      assertCorpusRoot({ corpusRoot: path.join(config.corpusRoot, "does-not-exist") });
    } catch (error) {
      corpusError = error instanceof Error ? error.message : String(error);
    }
    check(corpusError.includes("LEMMA_DOCS_CORPUS_ROOT"), "missing corpus root error is actionable");

    // --- Chunking ---
    const bigDoc = chunks.filter((c) => c.relativePath.includes("mso-pc-compliance"));
    check(bigDoc.length >= 4, `large markdown splits into multiple chunks (got ${bigDoc.length})`);
    check(bigDoc.some((c) => c.heading.includes("(1/")), "oversized section carries (1/n) heading");

    // --- Namespace routing (by filename prefix) ---
    check(
      chunks.every((c) => (c.relativePath.includes("quickstart") ? c.namespace === "getting-started" : true)),
      "quickstart routes to getting-started",
    );
    check(
      chunks.some((c) => c.relativePath.includes("changelog") && c.namespace === "product-updates"),
      "changelog routes to product-updates",
    );
    check(
      chunks.some((c) => c.relativePath.includes("roadmap") && c.namespace === "product-updates"),
      "roadmap routes to product-updates",
    );
    check(
      chunks.some((c) => c.relativePath.includes("guides-deposit-bonuses") && c.namespace === "guides"),
      "guides pages route to guides",
    );

    // --- Query routing ---
    const startResponse = buildContextResponse(chunks, { query: "sign up and onboard a new entity with beneficial owners" });
    check(startResponse.namespace === "getting-started", "onboarding query routes to getting-started");
    const guideResponse = buildContextResponse(chunks, { query: "how does the deposit bonus accrue" });
    check(guideResponse.namespace === "guides", "deposit bonus query routes to guides");
    const updatesResponse = buildContextResponse(chunks, { query: "is Zelle supported yet or on the roadmap" });
    check(updatesResponse.namespace === "product-updates", "Zelle/roadmap query routes to product-updates");
    const forced = buildContextResponse(chunks, { query: "cards", namespace: "product-updates" });
    check(forced.namespace === "product-updates", "explicit namespace is honored");

    // --- Search relevance ---
    check(
      guideResponse.chunks[0]?.path.includes("deposit-bonuses"),
      "deposit bonus query surfaces the matching guide first",
    );
    const synonym = buildContextResponse(chunks, { query: "interest rate on my balance", namespace: "guides" });
    check(
      synonym.chunks.some((c) => c.path.includes("deposit-bonuses")),
      "interest query matches deposit-bonus docs via synonym expansion",
    );

    // --- Pagination ---
    const pageOne = buildContextResponse(chunks, { query: "physician cash sweep mso practice", namespace: "guides", maxChunks: 2 });
    check(pageOne.pagination.count === 2, "max_chunks respected");
    check(pageOne.pagination.has_more, "has_more set when more matches exist");
    check(pageOne.pagination.next_offset === 2, "next_offset advances by page size");
    const pageTwo = buildContextResponse(chunks, {
      query: "physician cash sweep mso practice",
      namespace: "guides",
      maxChunks: 2,
      offset: pageOne.pagination.next_offset,
    });
    check(pageTwo.chunks[0]?.id !== pageOne.chunks[0]?.id, "offset returns the next page");
    const pastEnd = buildContextResponse(chunks, { query: "physician cash sweep mso practice", namespace: "guides", offset: 9999 });
    check(pastEnd.pagination.count === 0 && !pastEnd.pagination.has_more, "offset past end returns empty page");
    check(pastEnd.guidance.includes("offset"), "past-end guidance mentions offset");

    // --- Character-limit truncation ---
    const truncated = buildContextResponse(chunks, {
      query: "physician cash sweep mso practice",
      namespace: "guides",
      maxChunks: 12,
      characterLimit: 2_600,
    });
    check(truncated.truncated === true, "tiny character limit triggers truncation");
    check(JSON.stringify(truncated).length <= 2_600, "truncated response respects the limit");
    check(
      Boolean(truncated.truncation_message?.includes("lemma_docs_get")),
      "truncation message points at lemma_docs_get",
    );

    // --- Get by id / path ---
    const targetId = guideResponse.chunks[0]?.id ?? "";
    const byId = buildGetResponse(chunks, { ids: [targetId, "bogus#id"] });
    check(byId.found.length === 1 && byId.found[0].id === targetId, "get by id returns the chunk");
    check(byId.found[0].text.length > 0, "get by id returns full text");
    check(byId.missing.includes("bogus#id"), "unknown id lands in missing");
    const byPath = buildGetResponse(chunks, {
      path: "lemma-docs-docs-quickstart.md",
    });
    check(byPath.found.length >= 3, "get by path returns every chunk of the document");
    const getTruncated = buildGetResponse(chunks, {
      path: "lemma-docs-docs-guides-mso-pc-compliance.md",
      characterLimit: 2_000,
    });
    check(getTruncated.truncated === true, "get response truncates under a tiny limit");
    check(JSON.stringify(getTruncated).length <= 2_000, "truncated get response respects the limit");

    // --- Formatting ---
    const markdown = contextToMarkdown(guideResponse);
    check(markdown.includes(guideResponse.chunks[0].path), "markdown rendering includes source paths");
    const getMarkdown = getToMarkdown(byId);
    check(getMarkdown.includes("Not found"), "get markdown lists missing ids");
    check(Boolean(JSON.parse(JSON.stringify(guideResponse))), "response is JSON-serializable");

    console.log(`Fixture checks passed (${passed} assertions).`);
  } finally {
    cleanup();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
