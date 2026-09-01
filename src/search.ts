import type {
  ContextChunk,
  ContextResponse,
  DocChunk,
  FullChunk,
  GetChunksResponse,
  Intent,
  Namespace,
  Pagination,
  RoutedNamespace,
  SearchResult,
} from "./types.js";
import { excerpt, tokenize } from "./text.js";
import { CHARACTER_LIMIT, DEFAULT_MAX_CHUNKS, MAX_CHUNKS_CAP } from "./constants.js";

const ROUTING_KEYWORDS: Record<RoutedNamespace, string[]> = {
  "getting-started": [
    "sign up",
    "signup",
    "onboard",
    "onboarding",
    "open an account",
    "create an account",
    "get started",
    "getting started",
    "quickstart",
    "kyb",
    "know your business",
    "beneficial owner",
    "control person",
    "ein",
    "application",
    "approved",
    "verify",
    "debit card",
    "first",
  ],
  guides: [
    "deposit bonus",
    "bonus",
    "interest",
    "apy",
    "loan",
    "fixed fee",
    "draw",
    "lending",
    "mso",
    "mso-pc",
    "cpom",
    "corporate practice of medicine",
    "compliance",
    "guardrail",
    "physician",
    "sweep",
    "cash sweep",
    "entity",
    "entities",
    "multiple",
    "collaborat",
    "invite",
    "share",
    "partner",
    "team",
    "permission",
    "role",
  ],
  "product-updates": [
    "changelog",
    "release",
    "new feature",
    "what's new",
    "whats new",
    "update",
    "roadmap",
    "coming soon",
    "planned",
    "not supported",
    "support yet",
    "workaround",
    "zelle",
    "credit card",
    "cashback",
    "when will",
  ],
};

export interface ContextRequest {
  query: string;
  namespace?: Namespace;
  intent?: Intent;
  maxChunks?: number;
  offset?: number;
  /** Override for tests; defaults to CHARACTER_LIMIT. */
  characterLimit?: number;
}

export function buildContextResponse(chunks: DocChunk[], request: ContextRequest): ContextResponse {
  const namespace = request.namespace ?? "auto";
  const intent = request.intent ?? "answer";
  const maxChunks = clamp(request.maxChunks ?? DEFAULT_MAX_CHUNKS, 1, MAX_CHUNKS_CAP);
  const offset = Math.max(0, Math.floor(request.offset ?? 0));
  const characterLimit = request.characterLimit ?? CHARACTER_LIMIT;

  const routed = namespace === "auto" ? routeQuery(request.query) : namespace;
  const candidates = chunks.filter((chunk) => chunk.namespace === routed);
  const results = search(candidates, request.query);
  const page = results.slice(offset, offset + maxChunks);

  const response: ContextResponse = {
    query: request.query,
    namespace: routed,
    intent,
    guidance: guidanceFor(routed, intent, page.length, results.length),
    chunks: page.map(toContextChunk),
    pagination: paginate(results.length, page.length, offset),
    follow_ups: followUpsFor(routed, request.query),
    stats: {
      indexed_chunks: chunks.length,
      returned_chunks: page.length,
    },
  };

  return enforceContextCharacterLimit(response, characterLimit);
}

export interface GetRequest {
  ids?: string[];
  path?: string;
  /** Override for tests; defaults to CHARACTER_LIMIT. */
  characterLimit?: number;
}

export function buildGetResponse(chunks: DocChunk[], request: GetRequest): GetChunksResponse {
  const characterLimit = request.characterLimit ?? CHARACTER_LIMIT;
  const byId = new Map(chunks.map((chunk) => [chunk.id, chunk]));
  const found: DocChunk[] = [];
  const missing: string[] = [];
  const seen = new Set<string>();

  for (const id of request.ids ?? []) {
    const hit = byId.get(id);
    if (!hit) {
      missing.push(id);
      continue;
    }
    if (!seen.has(hit.id)) {
      seen.add(hit.id);
      found.push(hit);
    }
  }

  if (request.path) {
    const normalized = normalizePath(request.path);
    const pathHits = chunks.filter((chunk) => normalizePath(chunk.relativePath) === normalized);
    if (!pathHits.length) {
      missing.push(request.path);
    }
    for (const hit of pathHits) {
      if (!seen.has(hit.id)) {
        seen.add(hit.id);
        found.push(hit);
      }
    }
  }

  const response: GetChunksResponse = {
    found: found.map(toFullChunk),
    missing,
  };

  return enforceGetCharacterLimit(response, characterLimit);
}

export function routeQuery(query: string): RoutedNamespace {
  const haystack = query.toLowerCase();
  const scores = Object.entries(ROUTING_KEYWORDS).map(([namespace, keywords]) => ({
    namespace: namespace as RoutedNamespace,
    score: keywords.reduce((sum, keyword) => sum + (haystack.includes(keyword) ? 1 : 0), 0),
  }));
  scores.sort((a, b) => b.score - a.score);
  return scores[0]?.score ? scores[0].namespace : "guides";
}

export function search(chunks: DocChunk[], query: string): SearchResult[] {
  const queryTokens = tokenize(query);
  const querySet = new Set(queryTokens);
  const rawQuery = query.toLowerCase();

  return chunks
    .map((chunk) => scoreChunk(chunk, queryTokens, querySet, rawQuery))
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score);
}

function scoreChunk(
  chunk: DocChunk,
  queryTokens: string[],
  querySet: Set<string>,
  rawQuery: string,
): SearchResult {
  let score = 0;
  const reasons: string[] = [];
  const tokenCounts = new Map<string, number>();
  for (const token of chunk.tokens) tokenCounts.set(token, (tokenCounts.get(token) ?? 0) + 1);

  for (const token of queryTokens) {
    const count = tokenCounts.get(token) ?? 0;
    if (count > 0) {
      score += 2 + Math.min(count, 8) * 0.4;
      reasons.push(token);
    }
  }

  const pathText = `${chunk.relativePath} ${chunk.heading} ${chunk.title}`.toLowerCase();
  for (const token of querySet) {
    if (pathText.includes(token)) score += 2.5;
  }

  // "What's new" / availability questions should prefer changelog + roadmap
  // pages when routed there.
  if (/\b(changelog|roadmap|release|new|coming|planned|support)\b/i.test(rawQuery) && chunk.namespace === "product-updates") {
    score += 1.5;
  }

  return { chunk, score, reasons };
}

function toContextChunk(result: SearchResult): ContextChunk {
  return {
    id: result.chunk.id,
    score: Number(result.score.toFixed(2)),
    namespace: result.chunk.namespace,
    source_type: result.chunk.sourceType,
    path: result.chunk.relativePath,
    heading: result.chunk.heading,
    excerpt: excerpt(result.chunk.text),
    metadata: result.chunk.metadata,
  };
}

function toFullChunk(chunk: DocChunk): FullChunk {
  return {
    id: chunk.id,
    namespace: chunk.namespace,
    source_type: chunk.sourceType,
    path: chunk.relativePath,
    heading: chunk.heading,
    text: chunk.text,
    metadata: chunk.metadata,
  };
}

function paginate(totalMatches: number, count: number, offset: number): Pagination {
  const hasMore = offset + count < totalMatches;
  return {
    total_matches: totalMatches,
    count,
    offset,
    has_more: hasMore,
    ...(hasMore ? { next_offset: offset + count } : {}),
  };
}

function withChunkCount(response: ContextResponse, keep: number): ContextResponse {
  const chunks = response.chunks.slice(0, keep);
  return {
    ...response,
    chunks,
    pagination: paginate(response.pagination.total_matches, chunks.length, response.pagination.offset),
    stats: { ...response.stats, returned_chunks: chunks.length },
  };
}

function enforceContextCharacterLimit(response: ContextResponse, limit: number): ContextResponse {
  const requested = response.chunks.length;
  let current = response;
  let shrank = false;

  while (JSON.stringify(current).length > limit && current.chunks.length > 1) {
    current = withChunkCount(current, current.chunks.length - 1);
    shrank = true;
  }

  if (JSON.stringify(current).length > limit && current.chunks.length === 1) {
    const only = current.chunks[0];
    const overhead = JSON.stringify({ ...current, chunks: [{ ...only, excerpt: "" }] }).length;
    const room = Math.max(200, limit - overhead - 3);
    current = {
      ...current,
      chunks: [{ ...only, excerpt: `${only.excerpt.slice(0, room)}...` }],
    };
    shrank = true;
  }

  if (!shrank) return current;

  const nextOffset = current.pagination.next_offset;
  return {
    ...current,
    truncated: true,
    truncation_message: [
      `Returned ${current.chunks.length} of ${requested} requested chunks to stay under ${limit} characters.`,
      nextOffset !== undefined
        ? `Continue with offset=${nextOffset}, or fetch specific chunks by id with lemma_docs_get.`
        : `Fetch specific chunks by id with lemma_docs_get for full text.`,
    ].join(" "),
  };
}

function enforceGetCharacterLimit(response: GetChunksResponse, limit: number): GetChunksResponse {
  const requested = response.found.length;
  let current = response;
  let shrank = false;

  while (JSON.stringify(current).length > limit && current.found.length > 1) {
    current = { ...current, found: current.found.slice(0, -1) };
    shrank = true;
  }

  if (JSON.stringify(current).length > limit && current.found.length === 1) {
    const only = current.found[0];
    const overhead = JSON.stringify({ ...current, found: [{ ...only, text: "" }] }).length;
    const room = Math.max(500, limit - overhead);
    if (only.text.length > room) {
      const omitted = only.text.length - room;
      current = {
        ...current,
        found: [{ ...only, text: `${only.text.slice(0, room)}\n…[truncated — ${omitted} more characters in ${only.path}]` }],
      };
      shrank = true;
    }
  }

  if (!shrank) return current;

  return {
    ...current,
    truncated: true,
    truncation_message:
      `Returned ${current.found.length} of ${requested} matched chunks in full to stay under ${limit} characters. ` +
      `Request the remaining ids in a follow-up lemma_docs_get call.`,
  };
}

function guidanceFor(
  namespace: RoutedNamespace,
  intent: Intent,
  returned: number,
  totalMatches: number,
): string {
  if (!returned) {
    if (totalMatches > 0) {
      return `The offset is past the last of ${totalMatches} matches. Retry with a smaller offset.`;
    }
    return `No strong ${namespace} matches found. Try a more specific Lemma term (entity, onboarding, deposit bonus, fixed fee loan, cash sweep, MSO-PC, collaboration), or note that the local corpus covers only the 8 pages Lemma exposes as markdown — banking-operations, insurance/lockbox, invoicing, team-management, and API reference pages are NOT in this index (see NOTICE.md).`;
  }

  const base =
    intent === "source_map"
      ? `Use these ${namespace} sources as the initial map. Load exact paths if a downstream agent needs more detail.`
      : intent === "build_context"
        ? `Use these ${namespace} chunks as coding context. They are excerpts, not full documents; fetch full chunks with lemma_docs_get before implementing risky behavior.`
        : `Routed to ${namespace}. The selected excerpts should answer the question or identify the next source to inspect.`;

  return totalMatches > returned
    ? `${base} ${totalMatches} chunks matched in total; page with offset for more.`
    : base;
}

function followUpsFor(namespace: RoutedNamespace, query: string): string[] {
  const lower = query.toLowerCase();
  const followUps = [
    `Load more ${namespace} context for this exact task.`,
    "Show source paths only.",
  ];

  if (lower.includes("mso") || lower.includes("cpom") || lower.includes("compliance")) {
    followUps.push("Explain the MSO-PC guardrails Lemma configures (physician on file, sweeps, visibility).");
  }
  if (lower.includes("loan") || lower.includes("credit") || lower.includes("lending")) {
    followUps.push("Compare fixed fee loans with what the roadmap lists as planned lending expansion.");
  }
  if (lower.includes("bonus") || lower.includes("interest") || lower.includes("apy")) {
    followUps.push("Check how the deposit bonus accrues and when it is paid.");
  }
  if (lower.includes("entity") || lower.includes("entities") || lower.includes("onboard")) {
    followUps.push("Route to the multiple-entities and collaboration guides for shared onboarding.");
  }

  return followUps;
}

function normalizePath(input: string): string {
  return input.replaceAll("\\", "/").replace(/^\.\//, "");
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.floor(value)));
}
