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
        Vector3: new (x: number, y: number, z: number) => any;
        FontStyle: Record<string, number>;
        UIElements: {
            Length: new (value: number, unit?: number) => CSLength;
            LengthUnit: { Pixel: number; Percent: number };
            StyleKeyword: { Auto: number; None: number; Initial: number; Null: number };
            StyleMaterialDefinition: new (v: unknown) => unknown;
            Angle: { Degrees: (v: number) => any; Radians: (v: number) => any; Turns: (v: number) => any; Gradians: (v: number) => any };
            Translate: new (x: any, y: any) => any;
            Rotate: new (angle: any) => any;
            Scale: new (v: any) => any;
            TransformOrigin: new (x: any, y: any) => any;
            StyleTranslate: new (v: any) => any;
            StyleRotate: new (v: any) => any;
            StyleScale: new (v: any) => any;
            StyleTransformOrigin: new (v: any) => any;
            // Enums for style properties
            FlexDirection: Record<string, number>;
            Wrap: Record<string, number>;
            Align: Record<string, number>;
            Justify: Record<string, number>;
            Position: Record<string, number>;
            Overflow: Record<string, number>;
            DisplayStyle: Record<string, number>;
            Visibility: Record<string, number>;
            WhiteSpace: Record<string, number>;
            TextAnchor: Record<string, number>;
            TextOverflow: Record<string, number>;
            TextOverflowPosition: Record<string, number>;
            OverflowClipBox: Record<string, number>;
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
    "borderRadius", "borderTopLeftRadius", "borderTopRightRadius", "borderBottomLeftRadius", "borderBottomRightRadius",
    "fontSize",
    "letterSpacing", "wordSpacing", "unityParagraphSpacing",
])

// Style properties that expect color values
const COLOR_PROPERTIES = new Set([
    "color", "backgroundColor",
    "borderColor", "borderTopColor", "borderRightColor", "borderBottomColor", "borderLeftColor",
    "unityTextOutlineColor", "unityBackgroundImageTintColor",
])

// Style properties that are plain numbers (no Length wrapper needed)
const NUMBER_PROPERTIES = new Set([
    "flexGrow", "flexShrink", "opacity",
    "unitySliceTop", "unitySliceRight", "unitySliceBottom", "unitySliceLeft", "unitySliceScale",
    "borderWidth", "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth",
    "unityTextOutlineWidth",
])

// Enum property mappings: React style value -> Unity enum value
// Keys are camelCase (React/CSS style), values map to Unity enum member names
const ENUM_MAPPINGS: Record<string, { enum: () => Record<string, number>, values: Record<string, string> }> = {
    flexDirection: {
        enum: () => CS.UnityEngine.UIElements.FlexDirection,
        values: {
            "row": "Row",
            "row-reverse": "RowReverse",
            "column": "Column",
            "column-reverse": "ColumnReverse",
        }
    },
    flexWrap: {
        enum: () => CS.UnityEngine.UIElements.Wrap,
        values: {
            "nowrap": "NoWrap",
            "wrap": "Wrap",
            "wrap-reverse": "WrapReverse",
        }
    },
    alignItems: {
        enum: () => CS.UnityEngine.UIElements.Align,
        values: {
            "auto": "Auto",
            "flex-start": "FlexStart",
            "flex-end": "FlexEnd",
            "center": "Center",
            "stretch": "Stretch",
        }
    },
    alignSelf: {
        enum: () => CS.UnityEngine.UIElements.Align,
        values: {
            "auto": "Auto",
            "flex-start": "FlexStart",
            "flex-end": "FlexEnd",
            "center": "Center",
            "stretch": "Stretch",
        }
    },
    alignContent: {
        enum: () => CS.UnityEngine.UIElements.Align,
        values: {
            "auto": "Auto",
            "flex-start": "FlexStart",
            "flex-end": "FlexEnd",
            "center": "Center",
            "stretch": "Stretch",
        }
    },
    justifyContent: {
        enum: () => CS.UnityEngine.UIElements.Justify,
        values: {
            "flex-start": "FlexStart",
            "flex-end": "FlexEnd",
            "center": "Center",
            "space-between": "SpaceBetween",
            "space-around": "SpaceAround",
        }
    },
    position: {
        enum: () => CS.UnityEngine.UIElements.Position,
        values: {
            "relative": "Relative",
            "absolute": "Absolute",
        }
    },
    overflow: {
        enum: () => CS.UnityEngine.UIElements.Overflow,
        values: {
            "visible": "Visible",
            "hidden": "Hidden",
        }
    },
    display: {
        enum: () => CS.UnityEngine.UIElements.DisplayStyle,
        values: {
            "flex": "Flex",
            "none": "None",
        }
    },
    visibility: {
        enum: () => CS.UnityEngine.UIElements.Visibility,
        values: {
            "visible": "Visible",
            "hidden": "Hidden",
        }
    },
    whiteSpace: {
        enum: () => CS.UnityEngine.UIElements.WhiteSpace,
        values: {
            "normal": "Normal",
            "nowrap": "NoWrap",
        }
    },
    unityFontStyleAndWeight: {
        enum: () => CS.UnityEngine.FontStyle,
        values: {
            "normal": "Normal",
            "bold": "Bold",
            "italic": "Italic",
            "bold-and-italic": "BoldAndItalic",
        }
    },
    textOverflow: {
        enum: () => CS.UnityEngine.UIElements.TextOverflow,
        values: {
            "clip": "Clip",
            "ellipsis": "Ellipsis",
        }
    },
    unityTextOverflowPosition: {
        enum: () => CS.UnityEngine.UIElements.TextOverflowPosition,
        values: {
            "end": "End",
            "start": "Start",
            "middle": "Middle",
        }
    },
    unityOverflowClipBox: {
        enum: () => CS.UnityEngine.UIElements.OverflowClipBox,
        values: {
            "padding-box": "PaddingBox",
            "content-box": "ContentBox",
        }
    },
}

/**
 * Parse an enum style value
 * @param key - Style property name
 * @param value - String value from React style (e.g., "row", "flex-start")
 * @returns Unity enum value or null if not found
 */
function parseEnumValue(key: string, value: string): number | null {
    const mapping = ENUM_MAPPINGS[key]
    if (!mapping) return null

    const unityEnumName = mapping.values[value]
    if (!unityEnumName) return null

    const enumType = mapping.enum()
    return enumType[unityEnumName] ?? null
}

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
 * Clamp a number to [0, 1] range
 */
function clamp01(n: number): number {
    return n < 0 ? 0 : n > 1 ? 1 : n
}

/**
 * Create a Unity Color with clamped values
 */
function createColor(r: number, g: number, b: number, a: number): CSColor {
    return new CS.UnityEngine.Color(clamp01(r), clamp01(g), clamp01(b), clamp01(a))
}

/**
 * Parse hex color string into RGBA components
 * Supports: #rgb, #rgba, #rrggbb, #rrggbbaa
 */
function parseHexColor(hex: string): CSColor | null {
    const len = hex.length
    const isShort = len === 3 || len === 4
    const isLong = len === 6 || len === 8
    if (!isShort && !isLong) return null

    const step = isShort ? 1 : 2
    const parse = (i: number): number => {
        const slice = hex.slice(i * step, i * step + step)
        const expanded = isShort ? slice + slice : slice
        return parseInt(expanded, 16) / 255
    }

    const r = parse(0), g = parse(1), b = parse(2)
    const a = (len === 4 || len === 8) ? parse(3) : 1
    return createColor(r, g, b, a)
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

    // Hex colors
    if (trimmed.startsWith("#")) {
        return parseHexColor(trimmed.slice(1))
    }

    // rgb(r, g, b) or rgba(r, g, b, a) - supports both integer and percentage values
    const rgbMatch = trimmed.match(/^rgba?\s*\(\s*([\d.]+)(%?)\s*,\s*([\d.]+)(%?)\s*,\s*([\d.]+)(%?)\s*(?:,\s*([\d.]+))?\s*\)$/)
    if (rgbMatch) {
        const isPercent = rgbMatch[2] === "%"
        const divisor = isPercent ? 100 : 255
        const r = parseFloat(rgbMatch[1]) / divisor
        const g = parseFloat(rgbMatch[3]) / divisor
        const b = parseFloat(rgbMatch[5]) / divisor
        const a = rgbMatch[7] !== undefined ? parseFloat(rgbMatch[7]) : 1
        return createColor(r, g, b, a)
    }

    return null
}

/**
 * Parse a length value for transform properties (no keyword support)
 * number → Length(n, Pixel), "50%" → Length(50, Percent), "10px" → Length(10, Pixel)
 */
function parseLengthForTransform(value: number | string): CSLength | null {
    if (typeof value === "number") {
        return new CS.UnityEngine.UIElements.Length(value, CS.UnityEngine.UIElements.LengthUnit.Pixel)
    }
    if (typeof value === "string") {
        const match = value.trim().match(/^(-?[\d.]+)(px|%)?$/)
        if (match) {
            const num = parseFloat(match[1])
            if (isNaN(num)) return null
            const unit = match[2] === "%"
                ? CS.UnityEngine.UIElements.LengthUnit.Percent
                : CS.UnityEngine.UIElements.LengthUnit.Pixel
            return new CS.UnityEngine.UIElements.Length(num, unit)
        }
    }
    return null
}

/**
 * Parse an angle value
 * number → Angle.Degrees(n), string → parse unit suffix (deg|rad|turn|grad)
 */
function parseAngle(value: number | string): any | null {
    const Angle = CS.UnityEngine.UIElements.Angle
    if (typeof value === "number") {
        return Angle.Degrees(value)
    }
    if (typeof value === "string") {
        const match = value.trim().match(/^(-?[\d.]+)(deg|rad|turn|grad)?$/)
        if (match) {
            const num = parseFloat(match[1])
            if (isNaN(num)) return null
            const unit = match[2] || "deg"
            if (unit === "rad") return Angle.Radians(num)
            if (unit === "turn") return Angle.Turns(num)
            if (unit === "grad") return Angle.Gradians(num)
            return Angle.Degrees(num)
        }
    }
    return null
}

/**
 * Parse translate style: [x, y] array or C# Translate pass-through
 */
function parseTranslateStyle(value: unknown): unknown {
    if (Array.isArray(value)) {
        const x = parseLengthForTransform(value[0])
        const y = parseLengthForTransform(value[1])
        if (x !== null && y !== null) {
            return new CS.UnityEngine.UIElements.StyleTranslate(
                new CS.UnityEngine.UIElements.Translate(x, y)
            )
        }
    }
    if (typeof value === "object" && value !== null) {
        try { return new CS.UnityEngine.UIElements.StyleTranslate(value) } catch { return value }
    }
    return value
}

/**
 * Parse rotate style: number (degrees), string with unit, or C# Rotate pass-through
 */
function parseRotateStyle(value: unknown): unknown {
    if (typeof value === "number" || typeof value === "string") {
        const angle = parseAngle(value)
        if (angle !== null) {
            return new CS.UnityEngine.UIElements.StyleRotate(
                new CS.UnityEngine.UIElements.Rotate(angle)
            )
        }
    }
    if (typeof value === "object" && value !== null) {
        try { return new CS.UnityEngine.UIElements.StyleRotate(value) } catch { return value }
    }
    return value
}

/**
 * Parse scale style: number (uniform), [x, y] array, or C# Scale pass-through
 */
function parseScaleStyle(value: unknown): unknown {
    if (typeof value === "number") {
        return new CS.UnityEngine.UIElements.StyleScale(
            new CS.UnityEngine.UIElements.Scale(new CS.UnityEngine.Vector3(value, value, 1))
        )
    }
    if (Array.isArray(value)) {
        const x = typeof value[0] === "number" ? value[0] : 1
        const y = typeof value[1] === "number" ? value[1] : 1
        return new CS.UnityEngine.UIElements.StyleScale(
            new CS.UnityEngine.UIElements.Scale(new CS.UnityEngine.Vector3(x, y, 1))
        )
    }
    if (typeof value === "object" && value !== null) {
        try { return new CS.UnityEngine.UIElements.StyleScale(value) } catch { return value }
    }
    return value
}

/**
 * Parse transformOrigin style: [x, y] array or C# TransformOrigin pass-through
 */
function parseTransformOriginStyle(value: unknown): unknown {
    if (Array.isArray(value)) {
        const x = parseLengthForTransform(value[0])
        const y = parseLengthForTransform(value[1])
        if (x !== null && y !== null) {
            return new CS.UnityEngine.UIElements.StyleTransformOrigin(
                new CS.UnityEngine.UIElements.TransformOrigin(x, y)
            )
        }
    }
    if (typeof value === "object" && value !== null) {
        try { return new CS.UnityEngine.UIElements.StyleTransformOrigin(value) } catch { return value }
    }
    return value
}

/**
 * Parse a style value based on the property name
 * @param key - Style property name (e.g., "width", "backgroundColor")
 * @param value - Raw value from React style object
 * @returns Parsed value suitable for Unity UI Toolkit
 */
export function parseStyleValue(key: string, value: unknown): unknown {
    // `unityMaterial` is special: it can legitimately be `null` (meaning
    // "reset to the panel default") so we can't short-circuit like the
    // length/color paths below. Wrap in StyleMaterialDefinition either way.
    if (key === "unityMaterial") {
        if (value === undefined) return undefined
        const SMD = CS.UnityEngine.UIElements.StyleMaterialDefinition
        if (value === null) {
            return new SMD(CS.UnityEngine.UIElements.StyleKeyword.Null)
        }
        return new SMD(value as any)
    }

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

    // Enum properties - convert string to Unity enum value
    if (key in ENUM_MAPPINGS && typeof value === "string") {
        const parsed = parseEnumValue(key, value)
        if (parsed !== null) return parsed
        // Fall through if parsing failed
    }

    // Transform properties
    if (key === "translate") return parseTranslateStyle(value)
    if (key === "rotate") return parseRotateStyle(value)
    if (key === "scale") return parseScaleStyle(value)
    if (key === "transformOrigin") return parseTransformOriginStyle(value)

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
