/**
 * <Image src> resolves a bare name against OneJS's convention unless a host
 * has said where the app's files are. A cart at a Unity project's root is such
 * a host (Specs/ROOT_CARTS.md 5.4a in the OneJS container): its build calls
 * setImageBase before the cart runs. With no base set, nothing moves.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { resolveAssetPath, setImageBase } from "../image-cache"

const app = () => (globalThis as any).CS.UnityEngine.Application

describe("resolveAssetPath and a host-set base", () => {
    let editor: boolean
    let streaming: string

    beforeEach(() => {
        editor = app().isEditor
        streaming = app().streamingAssetsPath
        ;(globalThis as any).__workingDir = "/project/App"
    })

    afterEach(() => {
        setImageBase(null)
        app().isEditor = editor
        app().streamingAssetsPath = streaming
    })

    it("resolves into the working directory's assets/ in the editor when no base is set", () => {
        expect(resolveAssetPath("logo.png")).toBe("/project/App/assets/logo.png")
    })

    it("resolves into StreamingAssets/onejs/assets in a player when no base is set", () => {
        app().isEditor = false
        app().streamingAssetsPath = "https://game.example/StreamingAssets"
        expect(resolveAssetPath("logo.png")).toBe("https://game.example/StreamingAssets/onejs/assets/logo.png")
    })

    it("reads a cart's own files where they sit, and a used cart's from its used carts folder", () => {
        setImageBase("/project/Lightning/", { usedCarts: ".oj/carts" })
        expect(resolveAssetPath("glow.png")).toBe("/project/Lightning/glow.png")
        expect(resolveAssetPath("./art/bg.png")).toBe("/project/Lightning/art/bg.png")
        expect(resolveAssetPath("@singtaa/bolt@1.2.0/spark.png")).toBe("/project/Lightning/.oj/carts/@singtaa/bolt@1.2.0/spark.png")
    })

    it("puts a used cart's files straight under the base when no folder is named, as a player has them", () => {
        setImageBase("https://game.example/StreamingAssets/onejs/carts/Lightning")
        expect(resolveAssetPath("@singtaa/bolt@1.2.0/spark.png")).toBe("https://game.example/StreamingAssets/onejs/carts/Lightning/@singtaa/bolt@1.2.0/spark.png")
    })

    it("leaves URLs and rooted paths alone, and goes back to the convention on null", () => {
        setImageBase("/project/Lightning")
        expect(resolveAssetPath("https://example.com/a.png")).toBe("https://example.com/a.png")
        expect(resolveAssetPath("/tmp/a.png")).toBe("/tmp/a.png")
        setImageBase(null)
        expect(resolveAssetPath("logo.png")).toBe("/project/App/assets/logo.png")
    })
})
