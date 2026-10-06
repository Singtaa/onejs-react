// Character escape mapping for Tailwind/USS compatibility.
// USS class names only support [\w-], so special characters must be escaped.
//
// onejs-unity's Tailwind generator escapes the same way when it writes the
// selectors (src/tailwind/generator.mjs and src/postcss/uss-transform.mjs), and
// a class only matches when both sides produce the same name. The container's
// Tools/class-escape test runs the same class names through every copy.
const CLASS_ESCAPE_MAP: [string, string][] = [
    [":", "_c_"],   // Pseudo-classes and breakpoints (hover:, sm:)
    ["/", "_s_"],   // Fractions (w-1/2)
    [".", "_d_"],   // Decimals (p-2.5)
    ["[", "_lb_"],  // Arbitrary values ([100px])
    ["]", "_rb_"],
    ["(", "_lp_"],  // Functions (calc())
    [")", "_rp_"],
    ["#", "_n_"],   // Hex colors
    ["%", "_p_"],   // Percentages
    [",", "_cm_"],  // Multiple values
    ["&", "_amp_"],
    [">", "_gt_"],
    ["<", "_lt_"],
    ["*", "_ast_"],
    ["'", "_sq_"],
]

/**
 * Escape special characters in a class name for USS compatibility.
 * Tailwind class names like "hover:bg-red-500" become "hover_c_bg-red-500".
 * A USS class cannot start with a digit, so "2xl:p-4" becomes "_2xl_c_p-4".
 * Results are cached since the same class names are used repeatedly across renders.
 */
const _escapeCache = new Map<string, string>()
export function escapeClassName(name: string): string {
    const cached = _escapeCache.get(name)
    if (cached !== undefined) return cached
    let escaped = /^[0-9]/.test(name) ? "_" + name : name
    for (const [char, replacement] of CLASS_ESCAPE_MAP) {
        if (escaped.includes(char)) {
            escaped = escaped.split(char).join(replacement)
        }
    }
    _escapeCache.set(name, escaped)
    return escaped
}
