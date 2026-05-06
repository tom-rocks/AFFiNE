#!/usr/bin/env node
/**
 * Twine rebrand pass over the AFFiNE source tree.
 *
 * Designed to be re-run after each upstream merge from toeverything/AFFiNE.
 * It is idempotent: running twice produces the same result.
 *
 * Scope: ONLY user-visible surfaces.
 * - i18n JSON resource values (keys are stable identifiers, never touched)
 * - PWA manifest
 * - Electron app metadata (productName + description, not the npm package name)
 *
 * Out of scope (intentionally):
 * - `@affine/*` npm package names (import identifiers across the monorepo)
 * - Env var names like AFFINE_SERVER_HTTPS (deploy contract)
 * - Source code class/file names
 * - URLs to https://affine.pro (link rewriting is a separate concern)
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(fileURLToPath(import.meta.url), "..", "..");

/**
 * Replacement rules in priority order. Earlier rules run first; later rules
 * see the output of earlier ones, so be careful with overlapping patterns.
 *
 * "AFFiNE Cloud" must come before "AFFiNE" so we can drop the misleading
 * "Cloud" wording entirely instead of producing "Twine Cloud".
 */
const TEXT_RULES = [
  // SelfHost-flavoured brand strings — repoint to the company name.
  { from: /\bAFFiNE\s+SelfHost(?:ed)?(?:\s+Cloud)?\b/g, to: "Lyon Partners Self Hosted" },
  { from: /\bAffine\s+Selfhost(?:ed)?(?:\s+Cloud)?\b/g, to: "Lyon Partners Self Hosted" },
  { from: /\bAFFINE\s+SELFHOST(?:ED)?(?:\s+CLOUD)?\b/g, to: "LYON PARTNERS SELF HOSTED" },

  // "Cloud"-suffixed brand strings — drop "Cloud" so it doesn't lie about
  // what the runtime actually is on a self-host install.
  { from: /\bAFFiNE\s+Cloud\b/g, to: "Twine" },
  { from: /\bAFFINE\s+Cloud\b/g, to: "Twine" },
  { from: /\bAffine\s+Cloud\b/g, to: "Twine" },
  { from: /\bAFFINE\s+CLOUD\b/g, to: "TWINE" },

  // Other product brand-name strings.
  { from: /\bAFFiNE\s+AI\b/g, to: "Twine AI" },
  { from: /\bAFFiNE\s+Pro\b/g, to: "Twine" },
  { from: /\bAFFiNE\b/g, to: "Twine" },
  { from: /\bAFFINE\b/g, to: "TWINE" },
];

/**
 * Per-key overrides for i18n values that the brand rules can't catch
 * (e.g. messages that don't mention "AFFiNE" but are misleading on a
 * self-host install). Applied AFTER brand rules. Add entries here as
 * we find more warts during the spike.
 */
const I18N_KEY_OVERRIDES = {
  "com.affine.banner.local-warning":
    "This workspace lives only in your browser. Sign in to sync it to your Twine server.",
};

/** Apply text rules to a string. */
function rewrite(str) {
  let out = str;
  for (const { from, to } of TEXT_RULES) out = out.replace(from, to);
  return out;
}

/** Walk a directory recursively, calling fn(absolutePath) for every file. */
function walk(dir, fn) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, fn);
    else fn(p);
  }
}

let touched = 0;
const log = (path, label) => {
  const rel = relative(REPO_ROOT, path).replaceAll("\\", "/");
  console.log(`  ${label}  ${rel}`);
  touched++;
};

/* ------------------------------------------------------------------ */
/* 1. i18n JSON files — rewrite values only, never keys.              */
/* ------------------------------------------------------------------ */
const I18N_DIR = join(REPO_ROOT, "packages", "frontend", "i18n", "src", "resources");

walk(I18N_DIR, (path) => {
  if (!path.endsWith(".json")) return;
  const raw = readFileSync(path, "utf8");
  const tree = JSON.parse(raw);
  let changed = false;

  const visit = (node) => {
    if (typeof node !== "object" || node === null) return;
    for (const k of Object.keys(node)) {
      const v = node[k];
      if (typeof v === "string") {
        const override = I18N_KEY_OVERRIDES[k];
        const next = override !== undefined ? override : rewrite(v);
        if (next !== v) {
          node[k] = next;
          changed = true;
        }
      } else if (typeof v === "object") {
        visit(v);
      }
    }
  };
  visit(tree);

  if (changed) {
    writeFileSync(path, JSON.stringify(tree, null, 2) + "\n", "utf8");
    log(path, "i18n  ");
  }
});

/* ------------------------------------------------------------------ */
/* 2. PWA manifest — name, short_name, description.                   */
/* ------------------------------------------------------------------ */
const MANIFEST = join(REPO_ROOT, "packages", "frontend", "core", "public", "manifest.json");
{
  const raw = readFileSync(MANIFEST, "utf8");
  const tree = JSON.parse(raw);
  const before = JSON.stringify(tree);

  tree.name = "Twine";
  tree.short_name = "Twine";
  tree.description =
    "Twine is a workspace with fully merged docs, whiteboards and databases.";

  if (JSON.stringify(tree) !== before) {
    writeFileSync(MANIFEST, JSON.stringify(tree, null, 2) + "\n", "utf8");
    log(MANIFEST, "pwa   ");
  }
}

/* ------------------------------------------------------------------ */
/* 3. Electron app metadata — productName / description only.         */
/*    NOT the npm `name` field (that is an internal import id).       */
/* ------------------------------------------------------------------ */
const ELECTRON_PKG = join(REPO_ROOT, "packages", "frontend", "apps", "electron", "package.json");
{
  const raw = readFileSync(ELECTRON_PKG, "utf8");
  const tree = JSON.parse(raw);
  const before = JSON.stringify(tree);

  if (typeof tree.description === "string") {
    tree.description = rewrite(tree.description);
  }
  if (tree.build && typeof tree.build === "object") {
    if (tree.build.productName) tree.build.productName = "Twine";
    if (tree.build.appId) tree.build.appId = tree.build.appId; // leave appId stable
  }

  if (JSON.stringify(tree) !== before) {
    writeFileSync(ELECTRON_PKG, JSON.stringify(tree, null, 2) + "\n", "utf8");
    log(ELECTRON_PKG, "elect ");
  }
}

console.log(`\nDone. ${touched} file(s) updated.`);
