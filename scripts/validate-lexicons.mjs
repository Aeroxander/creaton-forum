// Validates Creaton forum lexicons: JSON parse, structure, id/path match,
// and that every $ref / ref points at a known def. Run with: node scripts/validate-lexicons.mjs
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const LEXICON_DIR = new URL("../packages/forum-core/lexicons/", import.meta.url).pathname;

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

// Built-in defs we reference that live outside this repo (atproto core).
const EXTERNAL_REFS = new Set([
  "com.atproto.repo.strongRef",
]);

function collectLocalDefs() {
  const files = readdirSync(LEXICON_DIR, { withFileTypes: true });
  const defs = new Map(); // defId -> filePath
  function walk(dir, prefix) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full, `${prefix}.${entry.name}`);
      } else if (entry.name.endsWith(".json")) {
        const name = entry.name.replace(/\.json$/, "");
        const nsid = `${prefix}.${name}`.replace(/^\./, "");
        const lex = readJson(full);
        if (lex.id !== nsid) {
          throw new Error(`${relative(".", full)}: lexicon "id" (${lex.id}) does not match path-derived NSID (${nsid}).`);
        }
        for (const defName of Object.keys(lex.defs ?? {})) {
          defs.set(defName === "main" ? nsid : `${nsid}#${defName}`, full);
        }
      }
    }
  }
  walk(LEXICON_DIR, "");
  return defs;
}

function findRefs(node, found) {
  if (node === null || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node) findRefs(item, found);
    return;
  }
  for (const [key, value] of Object.entries(node)) {
    if (key === "ref" && typeof value === "string") {
      found.push(value);
    } else if (key === "refs" && Array.isArray(value)) {
      found.push(...value.filter((v) => typeof v === "string"));
    } else {
      findRefs(value, found);
    }
  }
}

function validateLexicon(lex, path, localDefs) {
  const errors = [];
  if (typeof lex.lexicon !== "number" || lex.lexicon !== 1) {
    errors.push(`"lexicon" must be the number 1 (found ${JSON.stringify(lex.lexicon)}).`);
  }
  if (typeof lex.id !== "string" || !/^[\w.-]+(\.[\w-]+)+$/.test(lex.id)) {
    errors.push(`"id" must be a valid NSID string.`);
  }
  if (!lex.defs || typeof lex.defs !== "object") {
    errors.push(`"defs" object is required.`);
    return errors;
  }

  for (const [defName, def] of Object.entries(lex.defs)) {
    const defLabel = defName === "main" ? "main" : `#${defName}`;
    if (!def.type || typeof def.type !== "string") {
      errors.push(`defs.${defLabel}: missing "type".`);
      continue;
    }
    if (def.type === "record") {
      if (!def.record || def.record.type !== "object") {
        errors.push(`defs.${defLabel}: record def must have record.type "object".`);
      }
      if (!def.key || !["tid", "cid", "any", "list"].includes(def.key)) {
        errors.push(`defs.${defLabel}: invalid or missing record "key" strategy (got ${JSON.stringify(def.key)}).`);
      }
    }
    // Resolve all refs against local defs + the external allowlist.
    const refs = [];
    findRefs(def, refs);
    for (const ref of refs) {
      if (EXTERNAL_REFS.has(ref)) continue;
      if (!localDefs.has(ref) && !localDefs.has(ref.replace(/#.+$/, ""))) {
        errors.push(`defs.${defLabel}: unresolved ref "${ref}".`);
      }
    }
  }
  return errors;
}

function main() {
  let exitCode = 0;
  const localDefs = collectLocalDefs();
  const files = [];
  function list(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) list(join(dir, entry.name));
      else if (entry.name.endsWith(".json")) files.push(join(dir, entry.name));
    }
  }
  list(LEXICON_DIR);

  let total = 0;
  for (const file of files) {
    total += 1;
    const rel = relative(".", file);
    let lex;
    try {
      lex = readJson(file);
    } catch (err) {
      console.log(`FAIL  ${rel} — invalid JSON: ${err.message}`);
      exitCode = 1;
      continue;
    }
    const errors = validateLexicon(lex, file, localDefs);
    if (errors.length === 0) {
      console.log(`OK    ${rel}  [${lex.id}]`);
    } else {
      console.log(`FAIL  ${rel}  [${lex.id ?? "?"}]`);
      for (const err of errors) console.log(`        - ${err}`);
      exitCode = 1;
    }
  }
  console.log(`\nValidated ${total} lexicon file(s), ${localDefs.size} local def(s), ${EXTERNAL_REFS.size} external ref allowlist(s).`);
  process.exit(exitCode);
}

main();
