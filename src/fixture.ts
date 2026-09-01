import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { CorpusConfig } from "./types.js";

export interface FixtureHandle {
  config: CorpusConfig;
  cleanup: () => void;
}

/**
 * Builds a synthetic, self-contained corpus in a temp directory that mirrors
 * the real Lemma docs layout (a flat folder of lemma-docs-*.md files). Used
 * by `npm run test:fixture` and `npm run smoke` so the full
 * indexing/search/exclusion behavior can be verified on any machine, without
 * the real (non-redistributable) Lemma corpus present.
 */
export function buildFixtureCorpus(): FixtureHandle {
  const corpusRoot = fs.mkdtempSync(path.join(os.tmpdir(), "lemma-docs-fixture-"));

  const write = (name: string, content: string): void => {
    fs.writeFileSync(path.join(corpusRoot, name), content, "utf8");
  };

  // getting-started namespace.
  write(
    "lemma-docs-docs-quickstart.md",
    [
      "# Quickstart",
      "",
      "Open an account for your entity on Lemma in less than 5 minutes.",
      "",
      "## Sign up",
      "",
      "Create an account with your email address, then confirm the email before logging in.",
      "",
      "## Fill out the onboarding form",
      "",
      "Provide the business legal name, EIN, state of incorporation, a control person, and beneficial owners with more than 25% ownership. This is required for Know Your Business compliance.",
      "",
      "## Submit your application",
      "",
      "Most entities are approved within a few hours. Order debit cards once approved.",
    ].join("\n"),
  );

  // guides namespace: one long guide that must split into multiple chunks.
  const longSections: string[] = [
    "# MSO-PC compliance (fixture guide)",
    "",
    "How Lemma supports MSO-PC structures with banking guardrails aligned with the corporate practice of medicine doctrine.",
  ];
  for (let section = 1; section <= 4; section += 1) {
    longSections.push("", `## Guardrail ${section}`, "");
    for (let paragraph = 0; paragraph < 24; paragraph += 1) {
      longSections.push(
        `Paragraph ${section}.${paragraph}: the physician on file keeps control of the practice entity, cash sweeps move the management fee to the MSO, and the practice can always see and stop the sweep. `.repeat(3),
        "",
      );
    }
  }
  write("lemma-docs-docs-guides-mso-pc-compliance.md", longSections.join("\n"));

  write(
    "lemma-docs-docs-guides-deposit-bonuses.md",
    [
      "# Deposit bonuses",
      "",
      "Lemma is not a bank; it pays a deposit bonus rather than interest.",
      "",
      "## How the deposit bonus accrues",
      "",
      "The deposit bonus accrues daily at an annual rate based on the end-of-day balance.",
      "",
      "## When the deposit bonus is paid",
      "",
      "The accrued bonus is paid to the account monthly.",
    ].join("\n"),
  );
  write(
    "lemma-docs-docs-guides-fixed-fee-loans.md",
    [
      "# Fixed fee loans",
      "",
      "Draw a loan against your practice's approved limit for a flat, upfront fee. No interest and no recurring payments.",
      "",
      "## How a draw works",
      "",
      "Owners can draw from an approved limit at any time from the Loans page.",
      "",
      "## Repayment",
      "",
      "Repayment is collected from incoming deposits until the draw plus the fee is repaid.",
    ].join("\n"),
  );
  write(
    "lemma-docs-docs-guides-collaboration.md",
    [
      "# Collaboration",
      "",
      "Share the onboarding application with a business partner so they can fill out their own details.",
      "",
      "## Invite a collaborator",
      "",
      "Send an invite link; the partner enters beneficial owner information directly without emailing sensitive data.",
    ].join("\n"),
  );
  write(
    "lemma-docs-docs-guides-own-multiple-entities.md",
    [
      "# Own multiple entities",
      "",
      "Manage multiple organizations from one login, each entity with its own accounts.",
      "",
      "## Switching entities",
      "",
      "Use the entity switcher to move between organizations; cash sweeps can move funds between entities.",
    ].join("\n"),
  );

  // product-updates namespace.
  write(
    "lemma-docs-docs-changelog.md",
    [
      "# Changelog",
      "",
      "Lemma launches new features every week.",
      "",
      "## Monthly cash sweeps",
      "",
      "Cash sweeps can now run monthly, useful for recurring MSO management fees.",
      "",
      "## Charge a virtual card yourself",
      "",
      "Charge payer virtual cards from Move money > Charge a card.",
    ].join("\n"),
  );
  write(
    "lemma-docs-docs-roadmap.md",
    [
      "# Roadmap",
      "",
      "Features we don't support yet, and what to do in the meantime.",
      "",
      "## Zelle",
      "",
      "Zelle is not supported yet; use ACH, wire, RTP, FedNow, or checks as the workaround.",
      "",
      "## Credit cards with cashback",
      "",
      "Business credit cards with cashback are planned; Lemma issues debit cards today.",
    ].join("\n"),
  );

  // Files that must be EXCLUDED from the index.
  write("._ghost.md", "# AppleDouble sidecar\n\nMust never be indexed.\n");
  write("api-secret.md", "# Secret file\n\nMust never be indexed (secret pattern).\n");
  write("notes.txt", "Plain text files are not indexed.\n");
  const gitDir = path.join(corpusRoot, ".git");
  fs.mkdirSync(gitDir, { recursive: true });
  fs.writeFileSync(path.join(gitDir, "internals.md"), "# Git internals\n\nMust never be indexed.\n", "utf8");

  return {
    config: { corpusRoot },
    cleanup: () => fs.rmSync(corpusRoot, { recursive: true, force: true }),
  };
}
