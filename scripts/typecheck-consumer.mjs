#!/usr/bin/env node
/**
 * Type-checks src the way a consumer compiles it, which is not the way
 * tsconfig.json checks it.
 *
 * This package ships raw TypeScript. Nothing here is ever built, so the only
 * compiler that reads these sources in anger belongs to somebody else, and it
 * is configured by them. PlaySite's scripts/gen-oj-types.mjs is the one that
 * matters today: it passes onejs-react/src/index.ts to tsc as a file root to
 * emit declarations for the editor, and a deploy runs it.
 *
 * Two things about that invocation differ from `npm run typecheck`, and the
 * gap between them is the whole reason this file exists:
 *
 *   1. It names files on the command line, so tsc ignores every tsconfig.json
 *      and every compiler option falls back to its default. `strict` is a
 *      default of false. Ours is true.
 *   2. It emits declarations, so declaration-only errors (the TS4xxx family,
 *      "cannot be named", "is using private name") are reported. `--noEmit`
 *      never reaches that phase.
 *
 * Both directions bite. Strictness is the surprising one, because it is
 * normally the laxer setting that finds less: without strictNullChecks an
 * optional property loses its `undefined`, which makes assignability and the
 * TS2352 comparability check reject casts that strict mode waves through. That
 * is exactly how 0.1.56 shipped a ListView cast requiring a prop its own value
 * no longer had. The 328 tests passed, `tsc --noEmit` passed, and PlaySite
 * could not generate types, so the site could not deploy.
 *
 * So the flags below are copied from gen-oj-types.mjs on purpose, and the
 * absent ones are load-bearing:
 *
 *   - No `-p tsconfig.json` and no `--strict`. Adding either makes this script
 *     agree with `npm run typecheck` about everything and catch nothing. If a
 *     future reader finds the missing project reference suspicious, this
 *     paragraph is the answer: it is not an oversight.
 *   - src/index.ts is the only root from this package, so the module graph
 *     checked is the public one a consumer actually pulls in. __tests__ is
 *     unreachable from it and stays out, which is correct; the tests are
 *     checked by `npm run typecheck` under the strict config they are written
 *     against.
 *   - ../unity-types/index.d.ts comes along because the CS namespace has to
 *     resolve, the same reason gen-oj-types.mjs includes it. CI checks that
 *     repo out as a sibling, which is also the layout inside the container.
 *
 * Output goes to a temp directory and is deleted. Nothing here is a build.
 */

import { execFileSync } from "node:child_process"
import { createRequire } from "node:module"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

const ROOT = path.resolve(import.meta.dirname, "..")
const UNITY_TYPES = path.resolve(ROOT, "../unity-types/index.d.ts")

if (!fs.existsSync(UNITY_TYPES)) {
    console.error(`No unity-types beside this checkout (looked in ${path.dirname(UNITY_TYPES)}).`)
    console.error("Check out Singtaa/unity-types as a sibling directory, the way ci.yml and the container do.")
    process.exit(1)
}

// Resolved through node rather than node_modules/.bin, which is a shell shim
// on Windows and a symlink elsewhere; spawning the JS entry point directly
// behaves the same on both.
const tsc = createRequire(import.meta.url).resolve("typescript/bin/tsc")
const out = fs.mkdtempSync(path.join(os.tmpdir(), "onejs-react-dts-"))

try {
    execFileSync(process.execPath, [
        tsc,
        "--declaration", "--emitDeclarationOnly", "--outDir", out, "--skipLibCheck",
        "--jsx", "react-jsx", "--moduleResolution", "bundler", "--module", "esnext",
        "--target", "es2020", "src/index.ts", UNITY_TYPES,
    ], { cwd: ROOT, stdio: ["ignore", "inherit", "inherit"] })
} catch {
    console.error("\nsrc does not compile the way a consumer compiles it. See the header of scripts/typecheck-consumer.mjs.")
    process.exit(1)
} finally {
    fs.rmSync(out, { recursive: true, force: true })
}

console.log("Consumer-shaped declaration build is clean.")
