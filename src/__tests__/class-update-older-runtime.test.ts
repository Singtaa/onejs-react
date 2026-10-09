/**
 * A OneJS from before StyleBridge.UpdatesClasses has no UpdateClasses, so
 * onejs-react updates a className the way it did before: a call per class.
 * host-config caches the check, so this file imports a fresh copy with the flag
 * gone.
 */
import { describe, it, expect, vi } from "vitest"
import type { Instance } from "../host-config"

describe("className update on an older runtime", () => {
    it("adds and removes each class on the element, not through UpdateClasses", async () => {
        const bridge = (globalThis as any).CS.OneJS.StyleBridge
        const flag = bridge.UpdatesClasses
        delete bridge.UpdatesClasses
        vi.resetModules()
        try {
            const { hostConfig } = await import("../host-config")
            const before = { className: "a b" }
            const instance: Instance = hostConfig.createInstance("ojs-view", before as any, {} as any, null as any, null)
            const update = vi.spyOn(bridge, "UpdateClasses")

            ;(hostConfig.commitUpdate as any)(instance, "ojs-view", before, { className: "a c" }, null)

            expect(update).not.toHaveBeenCalled()
            const el = instance.element as any
            expect([el.ClassListContains("a"), el.ClassListContains("b"), el.ClassListContains("c")]).toEqual([true, false, true])
            update.mockRestore()
        } finally {
            bridge.UpdatesClasses = flag
            vi.resetModules()
        }
    })
})
