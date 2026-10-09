/**
 * A OneJS from before StyleBridge.ClearsNull reads a style sent as null as an
 * error, so onejs-react clears a removed key the way it did before: through the
 * style proxy. host-config caches the check, so this file imports a fresh copy
 * with the flag gone.
 */
import { describe, it, expect, vi } from "vitest";
import type { Instance } from "../host-config";

describe("style removal on an older runtime", () => {
    it("clears a removed key through element.style, not as null to StyleBridge", async () => {
        const bridge = (globalThis as any).CS.OneJS.StyleBridge;
        const flag = bridge.ClearsNull;
        delete bridge.ClearsNull;
        vi.resetModules();
        try {
            const { hostConfig } = await import("../host-config");
            const before = { style: { width: 100, height: 50 } };
            const instance: Instance = hostConfig.createInstance("ojs-view", before as any, {} as any, null as any, null);
            const apply = vi.spyOn(bridge, "ApplyStyles");

            (hostConfig.commitUpdate as any)(instance, "ojs-view", before, { style: { width: 100 } }, null);

            expect(apply).not.toHaveBeenCalled();
            expect("height" in instance.element.style).toBe(true);
            expect(instance.element.style.height).toBeUndefined();
            apply.mockRestore();
        } finally {
            bridge.ClearsNull = flag;
            vi.resetModules();
        }
    });
});
