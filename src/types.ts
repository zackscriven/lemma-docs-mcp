export type Namespace = "auto" | "getting-started" | "guides" | "product-updates";

export type RoutedNamespace = Exclude<Namespace, "auto">;

export type Intent = "answer" | "build_context" | "source_map";

export type ResponseFormat = "markdown" | "json";

export interface CorpusConfig {
  corpusRoot: string;
}

export interface DocChunk {
  id: string;
  namespace: RoutedNamespace;
  sourceType: "markdown";
  filePath: string;
  relativePath: string;
  title: string;
  heading: string;
  text: string;
  tokens: string[];
  metadata: Record<string, string>;
}

export interface SearchResult {
  chunk: DocChunk;
  score: number;
  reasons: string[];
}

/** Compact chunk representation returned by lemma_docs_context. */
export interface ContextChunk {
  id: string;
  score: number;
  namespace: RoutedNamespace;
  source_type: DocChunk["sourceType"];
  path: string;
  heading: string;
  excerpt: string;
  metadata: Record<string, string>;
}

export interface Pagination {
  total_matches: number;
  count: number;
  offset: number;
  has_more: boolean;
  next_offset?: number;
}

/** Type alias (not interface) so it satisfies the SDK's structuredContent index signature. */
export type ContextResponse = {
  query: string;
  namespace: RoutedNamespace;
  intent: Intent;
  guidance: string;
  chunks: ContextChunk[];
  pagination: Pagination;
  follow_ups: string[];
  truncated?: boolean;
  truncation_message?: string;
  stats: {
    indexed_chunks: number;
    returned_chunks: number;
  };
};

/** Full-text chunk representation returned by lemma_docs_get. */
export interface FullChunk {
  id: string;
  namespace: RoutedNamespace;
  source_type: DocChunk["sourceType"];
  path: string;
  heading: string;
  text: string;
  metadata: Record<string, string>;
}

/** Type alias (not interface) so it satisfies the SDK's structuredContent index signature. */
export type GetChunksResponse = {
  found: FullChunk[];
  missing: string[];
  truncated?: boolean;
  truncation_message?: string;
};
