import path from "node:path";
import { EXCERPT_LENGTH } from "./constants.js";

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "contain",
  "contains",
  "for",
  "from",
  "how",
  "in",
  "into",
  "is",
  "it",
  "of",
  "on",
  "or",
  "the",
  "to",
  "which",
  "with",
  "lemma",
]);

export function tokenize(input: string): string[] {
  const baseTokens = input
    .toLowerCase()
    .replace(/[^a-z0-9_./-]+/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));

  const expanded = new Set<string>();
  for (const token of baseTokens) {
    expanded.add(token);
    if (token.length > 3 && token.endsWith("s")) expanded.add(token.slice(0, -1));
    // Domain synonym expansions for Lemma's healthcare-banking vocabulary.
    if (token === "interest" || token === "apy" || token === "yield") {
      expanded.add("deposit");
      expanded.add("bonus");
      expanded.add("bonuses");
    }
    if (token === "loan" || token === "loans" || token === "lending" || token === "credit") {
      expanded.add("fixed");
      expanded.add("fee");
      expanded.add("draw");
    }
    if (token === "cpom" || token === "compliance" || token === "compliant") {
      expanded.add("mso");
      expanded.add("mso-pc");
      expanded.add("guardrails");
    }
    if (token === "mso" || token === "pc" || token === "pllc") {
      expanded.add("mso-pc");
      expanded.add("compliance");
    }
    if (token === "sweep" || token === "sweeps") {
      expanded.add("cash");
      expanded.add("transfer");
    }
    if (token === "onboarding" || token === "onboard" || token === "signup" || token === "sign-up") {
      expanded.add("quickstart");
      expanded.add("account");
      expanded.add("entity");
    }
    if (token === "organization" || token === "organizations" || token === "practice" || token === "practices") {
      expanded.add("entity");
      expanded.add("entities");
    }
    if (token === "invite" || token === "share" || token === "partner") {
      expanded.add("collaboration");
      expanded.add("collaborator");
    }
  }

  return [...expanded];
}

export function excerpt(input: string, maxLength = EXCERPT_LENGTH): string {
  const normalized = input.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 3).trim()}...`;
}

export function stableId(relativePath: string, suffix: string): string {
  return `${relativePath.replaceAll(path.sep, "/")}#${suffix}`
    .replace(/[^a-zA-Z0-9_./#:-]+/g, "-")
    .replace(/-+/g, "-");
}

export function titleFromPath(filePath: string): string {
  return path
    .basename(filePath)
    .replace(/\.md$/i, "")
    .replace(/^lemma-docs-/, "")
    .replace(/^docs-/, "");
}
