/**
 * Style value parsing utilities for OneJS React
 *
 * Converts friendly style values (numbers, strings like "100px", "#ff0000")
 * into Unity UI Toolkit compatible values.
 */

// Unity UIElements types accessed via CS global
declare const CS: {
    UnityEngine: {
        Color: new (r: number, g: number, b: number, a: number) => CSColor;
        UIElements: {
            Length: new (value: number, unit?: number) => CSLength;
            LengthUnit: { Pixel: number; Percent: number };
            StyleKeyword: { Auto: number; None: number; Initial: number };
        };
    };
};

interface CSColor {
    r: number;
    g: number;
    b: number;
    a: number;
}

interface CSLength {
    value: number;
    unit: number;
}

// Named CSS colors (common subset)
const NAMED_COLORS: Record<string, [number, number, number, number]> = {
    transparent: [0, 0, 0, 0],
    black: [0, 0, 0, 1],
    white: [1, 1, 1, 1],
    red: [1, 0, 0, 1],
    green: [0, 0.502, 0, 1],  // CSS green is #008000
    blue: [0, 0, 1, 1],
    yellow: [1, 1, 0, 1],
    cyan: [0, 1, 1, 1],
    magenta: [1, 0, 1, 1],
    orange: [1, 0.647, 0, 1],
    purple: [0.502, 0, 0.502, 1],
    pink: [1, 0.753, 0.796, 1],
    brown: [0.647, 0.165, 0.165, 1],
    gray: [0.502, 0.502, 0.502, 1],
    grey: [0.502, 0.502, 0.502, 1],
    silver: [0.753, 0.753, 0.753, 1],
    gold: [1, 0.843, 0, 1],
    navy: [0, 0, 0.502, 1],
    teal: [0, 0.502, 0.502, 1],
    olive: [0.502, 0.502, 0, 1],
    maroon: [0.502, 0, 0, 1],
    aqua: [0, 1, 1, 1],
    lime: [0, 1, 0, 1],
    fuchsia: [1, 0, 1, 1],
}

// Style properties that expect length values
const LENGTH_PROPERTIES = new Set([
    "width", "height", "minWidth", "minHeight", "maxWidth", "maxHeight",
    "top", "right", "bottom", "left",
    "margin", "marginTop", "marginRight", "marginBottom", "marginLeft",
    "padding", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
    "flexBasis",
    "borderWidth", "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth",
    "borderRadius", "borderTopLeftRadius", "borderTopRightRadius", "borderBottomLeftRadius", "borderBottomRightRadius",
    "fontSize",
])

// Style properties that expect color values
const COLOR_PROPERTIES = new Set([
    "color", "backgroundColor",
    "borderColor", "borderTopColor", "borderRightColor", "borderBottomColor", "borderLeftColor",
])

// Style properties that are plain numbers (no Length wrapper needed)
const NUMBER_PROPERTIES = new Set([
    "flexGrow", "flexShrink", "opacity",
])

// Enum properties - these get passed through as-is (C# handles conversion)
const ENUM_PROPERTIES = new Set([
    "flexDirection", "flexWrap", "alignItems", "alignSelf", "alignContent", "justifyContent",
    "position", "overflow", "display", "visibility", "whiteSpace",
    "unityTextAlign", "fontStyle",
])

/**
 * Parse a length value from various formats
 * @param value - number, "100", "100px", "50%", "auto"
 * @returns Unity Length struct or StyleKeyword
 */
export function parseLength(value: number | string): CSLength | number | null {
    if (typeof value === "number") {
        return new CS.UnityEngine.UIElements.Length(value, CS.UnityEngine.UIElements.LengthUnit.Pixel)
    }

    if (typeof value !== "string") return null

    const trimmed = value.trim().toLowerCase()

    // Handle keywords
    if (trimmed === "auto") {
        return CS.UnityEngine.UIElements.StyleKeyword.Auto
    }
    if (trimmed === "none") {
        return CS.UnityEngine.UIElements.StyleKeyword.None
    }
    if (trimmed === "initial") {
        return CS.UnityEngine.UIElements.StyleKeyword.Initial
    }

    // Parse numeric values with units
    const match = trimmed.match(/^(-?[\d.]+)(px|%)?$/)
    if (match) {
        const num = parseFloat(match[1])
        if (isNaN(num)) return null

        const unitStr = match[2]
        const unit = unitStr === "%"
            ? CS.UnityEngine.UIElements.LengthUnit.Percent
            : CS.UnityEngine.UIElements.LengthUnit.Pixel

        return new CS.UnityEngine.UIElements.Length(num, unit)
    }

    return null
}

/**
 * Parse a hex color component (1 or 2 characters)
 */
function parseHexComponent(hex: string): number {
    if (hex.length === 1) {
        hex = hex + hex  // Expand shorthand: "f" -> "ff"
    }
    return parseInt(hex, 16) / 255
}

/**
 * Parse a color value from various formats
 * @param value - "#fff", "#ffffff", "#ffffffff", "rgb(255,0,0)", "rgba(255,0,0,0.5)", "red"
 * @returns Unity Color struct or null if invalid
 */
export function parseColor(value: string): CSColor | null {
    if (typeof value !== "string") return null

    const trimmed = value.trim().toLowerCase()

    // Named colors
    if (NAMED_COLORS[trimmed]) {
        const [r, g, b, a] = NAMED_COLORS[trimmed]
        return new CS.UnityEngine.Color(r, g, b, a)
    }

    // Hex colors: #rgb, #rgba, #rrggbb, #rrggbbaa
    if (trimmed.startsWith("#")) {
        const hex = trimmed.slice(1)

        if (hex.length === 3) {
            // #rgb
            const r = parseHexComponent(hex[0])
            const g = parseHexComponent(hex[1])
            const b = parseHexComponent(hex[2])
            return new CS.UnityEngine.Color(r, g, b, 1)
        }

        if (hex.length === 4) {
            // #rgba
            const r = parseHexComponent(hex[0])
            const g = parseHexComponent(hex[1])
            const b = parseHexComponent(hex[2])
            const a = parseHexComponent(hex[3])
            return new CS.UnityEngine.Color(r, g, b, a)
        }

        if (hex.length === 6) {
            // #rrggbb
            const r = parseHexComponent(hex.slice(0, 2))
            const g = parseHexComponent(hex.slice(2, 4))
            const b = parseHexComponent(hex.slice(4, 6))
            return new CS.UnityEngine.Color(r, g, b, 1)
        }

        if (hex.length === 8) {
            // #rrggbbaa
            const r = parseHexComponent(hex.slice(0, 2))
            const g = parseHexComponent(hex.slice(2, 4))
            const b = parseHexComponent(hex.slice(4, 6))
            const a = parseHexComponent(hex.slice(6, 8))
            return new CS.UnityEngine.Color(r, g, b, a)
        }

        return null
    }

    // rgb(r, g, b) or rgba(r, g, b, a)
    const rgbMatch = trimmed.match(/^rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)$/)
    if (rgbMatch) {
        const r = parseInt(rgbMatch[1]) / 255
        const g = parseInt(rgbMatch[2]) / 255
        const b = parseInt(rgbMatch[3]) / 255
        const a = rgbMatch[4] !== undefined ? parseFloat(rgbMatch[4]) : 1
        return new CS.UnityEngine.Color(
            Math.min(1, Math.max(0, r)),
            Math.min(1, Math.max(0, g)),
            Math.min(1, Math.max(0, b)),
            Math.min(1, Math.max(0, a))
        )
    }

    // rgb with percentages: rgb(100%, 0%, 0%)
    const rgbPercentMatch = trimmed.match(/^rgba?\s*\(\s*([\d.]+)%\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*(?:,\s*([\d.]+))?\s*\)$/)
    if (rgbPercentMatch) {
        const r = parseFloat(rgbPercentMatch[1]) / 100
        const g = parseFloat(rgbPercentMatch[2]) / 100
        const b = parseFloat(rgbPercentMatch[3]) / 100
        const a = rgbPercentMatch[4] !== undefined ? parseFloat(rgbPercentMatch[4]) : 1
        return new CS.UnityEngine.Color(
            Math.min(1, Math.max(0, r)),
            Math.min(1, Math.max(0, g)),
            Math.min(1, Math.max(0, b)),
            Math.min(1, Math.max(0, a))
        )
    }

    return null
}

/**
 * Parse a style value based on the property name
 * @param key - Style property name (e.g., "width", "backgroundColor")
 * @param value - Raw value from React style object
 * @returns Parsed value suitable for Unity UI Toolkit
 */
export function parseStyleValue(key: string, value: unknown): unknown {
    if (value === undefined || value === null) return value

    // Length properties
    if (LENGTH_PROPERTIES.has(key)) {
        if (typeof value === "number") {
            return new CS.UnityEngine.UIElements.Length(value, CS.UnityEngine.UIElements.LengthUnit.Pixel)
        }
        if (typeof value === "string") {
            const parsed = parseLength(value)
            if (parsed !== null) return parsed
        }
        // Fall through to return original value
    }

    // Color properties
    if (COLOR_PROPERTIES.has(key)) {
        if (typeof value === "string") {
            const parsed = parseColor(value)
            if (parsed !== null) return parsed
        }
        // Could already be a Color object, pass through
    }

    // Plain number properties - pass through as-is
    if (NUMBER_PROPERTIES.has(key)) {
        return value
    }

    // Enum properties - pass through as-is (C# handles string -> enum)
    if (ENUM_PROPERTIES.has(key)) {
        return value
    }

    // Unknown property - pass through unchanged
    return value
}

/**
 * Check if a property is a length property
 */
export function isLengthProperty(key: string): boolean {
    return LENGTH_PROPERTIES.has(key)
}

/**
 * Check if a property is a color property
 */
export function isColorProperty(key: string): boolean {
    return COLOR_PROPERTIES.has(key)
}
