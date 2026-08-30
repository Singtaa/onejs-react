import js from "@eslint/js"
import globals from "globals"
import reactHooks from "eslint-plugin-react-hooks"
import tseslint from "typescript-eslint"

// Flat config, shared shape across the OneJS JS packages. Correctness rules
// only: formatting is the codebase's own convention (double quotes, no
// semicolons, 4 spaces) and is left to review rather than a formatter pass
// that would rewrite history in every file at once.
export default tseslint.config(
    {
        // fixtures/ is scanner input for the Tailwind tests, not code.
        ignores: ["node_modules/", "**/*.d.ts", "**/fixtures/"],
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    // Only the two classic hooks rules. The v7 preset also ships the React
    // Compiler-era set (refs-in-render, set-state-in-effect, ...) which
    // demands refactors this codebase has not decided to make; adopting
    // those is a deliberate migration, not a lint stand-up. exhaustive-deps
    // stays a warning: the existing misses need individual review, and a
    // blanket inline-disable at each site would just be a lie that gates.
    {
        plugins: { "react-hooks": reactHooks },
        rules: {
            "react-hooks/rules-of-hooks": "error",
            "react-hooks/exhaustive-deps": "warn",
        },
    },
    {
        // The .mjs files are esbuild/PostCSS build tooling and run in Node.
        files: ["**/*.mjs"],
        languageOptions: { globals: globals.node },
    },
    {
        rules: {
            // The interop boundary is C#: values cross as handles and JSON,
            // and `any` at that boundary is the honest type. The useful
            // typing lives behind it. The same goes for `Function`, which is
            // what a JS function assigned to a C# delegate really is, and
            // for `{}` in the prop-type surface, where an empty interface is
            // a named extension point rather than a mistake.
            "@typescript-eslint/no-explicit-any": "off",
            "@typescript-eslint/no-unsafe-function-type": "off",
            "@typescript-eslint/no-empty-object-type": "off",

            // `declare global { namespace JSX ... }` is the only way to type
            // JSX intrinsics; only non-declaration namespaces are archaic.
            "@typescript-eslint/no-namespace": ["error", { allowDeclarations: true }],

            // Empty catch is the codebase's deliberate best-effort idiom
            // (teardown paths that must not throw). Empty non-catch blocks
            // still flag.
            "no-empty": ["error", { allowEmptyCatch: true }],

            // `let x = null` before a try block that assigns x, reads it
            // after, is the idiom the fx/gpu hooks use so a throwing build
            // still runs its finally. The rule calls the initializer dead;
            // removing it trips TypeScript's definite-assignment instead.
            "no-useless-assignment": "off",

            // `_` prefix is the codebase's own convention for deliberately
            // unused values (mirrors the C# `_camelCase` fields).
            "@typescript-eslint/no-unused-vars": ["error", {
                argsIgnorePattern: "^_",
                varsIgnorePattern: "^_",
                caughtErrors: "none",
            }],

            // Package internals are not API. The exports map in package.json
            // is the contract; a deep import breaks the day a file moves.
            "no-restricted-imports": ["error", {
                patterns: [{
                    group: [
                        "onejs-react/src/*",
                        "onejs-ui/src/*",
                        "onejs-unity/src/*",
                        "onejs-play/src/*",
                    ],
                    message: "Import from the package's exported entry points, not its src internals.",
                }],
            }],

            // An assembled class name is invisible to the Tailwind scanner
            // (it harvests string literals), so the class emits no rule and
            // the element silently renders unstyled. Whole class names per
            // branch are scanned; truly dynamic names belong in the safelist.
            "no-restricted-syntax": ["error", {
                selector: "CallExpression[callee.name='useKeyDown']",
                message: "Deprecated: useKeyDown fires every frame while held, not once on the press. Use useKeyHeld (held) or useKeyPress (edge).",
            }, {
                selector: "JSXAttribute[name.name='className'] > JSXExpressionContainer > BinaryExpression[operator='+']",
                message: "Assembled class names are invisible to the Tailwind scanner. Use whole class names in each branch, or add the assembled names to the safelist.",
            }],
        },
    },
)
