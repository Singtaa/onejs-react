/**
 * The <Image> component's asset loading and cache.
 *
 * `<Image src>` resolves the path, decodes the file once into a Texture2D (or
 * a VectorImage for .svg) and shares it between every Image showing that src.
 * On platforms where StreamingAssets is a URL (Android APK, WebGL) the load
 * is asynchronous, through UnityWebRequest.
 */

declare const CS: any
declare const console: { error: (...args: unknown[]) => void }
declare function useExtensions(typeRef: any): void
// Provided by the OneJS bootstrap (Network.cs) on native, by the browser on WebGL
declare function fetch(url: string): Promise<{ ok: boolean; status: number; text(): Promise<string> }>

// Register ImageConversion extension methods so tex.LoadImage(bytes) works.
// useExtensions is OneJS's C# extension-method registrar, not a React hook;
// module level is exactly where it belongs (it mirrors a C# using).
// eslint-disable-next-line react-hooks/rules-of-hooks
useExtensions(CS.UnityEngine.ImageConversion)

// Module-level image cache shared across all Image instances: src -> the
// Texture2D or VectorImage made from it. This module created every one of
// them, so it destroys them on teardown (releaseImageCache).
const _imageCache = new Map<string, any>()
// In-flight async loads keyed by src, so simultaneous mounts share one request
const _imagePending = new Map<string, Promise<any>>()
// Bumped by releaseImageCache, so a download that lands afterwards knows the
// cache it was meant for is gone
let _generation = 0

// On Android, streamingAssetsPath is a jar:file://...apk!/assets URL; on WebGL
// it's http(s). System.IO.File can't read those: they need UnityWebRequest.
export function isUrlPath(path: string): boolean {
    return path.includes("://")
}

export function resolveAssetPath(src: string): string {
    // URLs bypass resolution entirely. Without this a src of
    // "https://example.com/a.png" is mangled into
    // "{streamingAssets}/onejs/assets/https://example.com/a.png", which the
    // loaders downstream can never fetch, and the only symptom is an image that
    // does not appear. onejs-unity's own resolver has always had this check;
    // this copy of it did not.
    if (isUrlPath(src)) {
        return src
    }
    const Path = CS.System.IO.Path
    // Absolute paths bypass asset resolution entirely
    if (Path.IsPathRooted(src)) {
        return src
    }
    if (CS.UnityEngine.Application.isEditor) {
        const workingDir = typeof (globalThis as any).__workingDir === "string"
            ? (globalThis as any).__workingDir
            : Path.Combine(Path.GetDirectoryName(CS.UnityEngine.Application.dataPath), "App")
        return Path.Combine(workingDir, "assets", src)
    }
    const streamingAssets = CS.UnityEngine.Application.streamingAssetsPath
    if (isUrlPath(streamingAssets)) {
        return `${streamingAssets}/onejs/assets/${src}`
    }
    return Path.Combine(streamingAssets, "onejs", "assets", src)
}

export function loadImageAsset(src: string): any | null {
    const cached = _imageCache.get(src)
    if (cached) return cached

    const fullPath = resolveAssetPath(src)
    // URL paths (Android APK, WebGL) can't be read synchronously; the Image
    // component falls back to loadImageAssetAsync for these.
    if (isUrlPath(fullPath)) return null
    if (!CS.System.IO.File.Exists(fullPath)) {
        console.error(`Image src not found: ${src} (resolved to ${fullPath})`)
        return null
    }

    let result: any
    if (src.toLowerCase().endsWith(".svg")) {
        const svgText = CS.System.IO.File.ReadAllText(fullPath)
        result = CS.OneJS.SVGUtils.LoadFromString(svgText)
    } else {
        const bytes = CS.System.IO.File.ReadAllBytes(fullPath)
        const tex = new CS.UnityEngine.Texture2D(2, 2)
        tex.LoadImage(bytes)
        tex.filterMode = CS.UnityEngine.FilterMode.Bilinear
        // Clamp, not Unity's default Repeat. With Repeat a bilinear tap at the
        // top edge of a scaled element reaches past it and wraps to the bottom
        // row, so an image with a dark top and a light bottom grows a bright
        // line that CHANGES as the element scales. Measured through the real
        // UITK renderer: the top row reads 3.6x brighter under Repeat than
        // Clamp and swings by 0.074 across an animation's size range, against
        // 0.002 for Clamp. A synthetic Graphics.Blit does not show it, because
        // it samples strictly inside [0,1] and never asks what lies past the edge.
        tex.wrapMode = CS.UnityEngine.TextureWrapMode.Clamp
        result = tex
    }

    _imageCache.set(src, result)
    return result
}

export function loadImageAssetAsync(src: string, url: string): Promise<any> {
    const existing = _imagePending.get(src)
    if (existing) return existing

    const generation = _generation
    const promise = (async (): Promise<any> => {
        try {
            let result: any
            if (src.toLowerCase().endsWith(".svg")) {
                const res = await fetch(url)
                if (!res.ok) {
                    console.error(`Image src not found: ${src} (resolved to ${url})`)
                    return null
                }
                const svgText = await res.text()
                result = CS.OneJS.SVGUtils.LoadFromString(svgText)
            } else {
                const tex = await CS.OneJS.Network.LoadTextureFromUrl(url)
                if (!tex) {
                    // Not "not found". A null here means the request failed OR
                    // the bytes arrived and would not decode, and this side
                    // cannot tell which; the C# logs the difference. Claiming
                    // "not found" for a file that returns 200 sends the author
                    // to check the path, which is the one thing that will not
                    // help them.
                    console.error(`Image src loaded nothing: ${src} (resolved to ${url}). `
                        + `Either the request failed or the format is one Unity does not decode; the preceding [Network] warning says which.`)
                    return null
                }
                tex.filterMode = CS.UnityEngine.FilterMode.Bilinear
                // Clamp, not Unity's default Repeat. With Repeat a bilinear tap at the
                // top edge of a scaled element reaches past it and wraps to the bottom
                // row, so an image with a dark top and a light bottom grows a bright
                // line that CHANGES as the element scales. Measured through the real
                // UITK renderer: the top row reads 3.6x brighter under Repeat than
                // Clamp and swings by 0.074 across an animation's size range, against
                // 0.002 for Clamp. A synthetic Graphics.Blit does not show it, because
                // it samples strictly inside [0,1] and never asks what lies past the edge.
                tex.wrapMode = CS.UnityEngine.TextureWrapMode.Clamp
                result = tex
            }
            if (generation !== _generation) {
                // Torn down while this was in flight: nothing will show it
                // and nothing will release it later
                destroyAsset(result)
                return null
            }
            _imageCache.set(src, result)
            return result
        } catch (e) {
            console.error(`Image src failed to load: ${src} (resolved to ${url}): ${e}`)
            return null
        }
    })()

    _imagePending.set(src, promise)
    promise.then(() => {
        if (_imagePending.get(src) === promise) _imagePending.delete(src)
    })
    return promise
}

/**
 * Clear the Image component's image cache.
 * Call this if you need to force-reload images (e.g., after replacing files on disk).
 *
 * The cached textures are not destroyed: an `<Image>` still on screen may be
 * showing one. They are destroyed on teardown (hot reload, stop), after the
 * tree has unmounted.
 */
export function clearImageCache(): void {
    _imageCache.clear()
    _imagePending.clear()
}

/**
 * Destroy every Texture2D and VectorImage the cache made, then empty it.
 *
 * Internal: the renderer's teardown hook calls this after unmounting every
 * root, so no element of this context still shows one. Loads still in flight
 * destroy their result when it lands. Edit mode needs DestroyImmediate:
 * Destroy refuses to run outside play mode.
 */
export function releaseImageCache(): void {
    _generation++
    for (const asset of _imageCache.values()) destroyAsset(asset)
    _imageCache.clear()
    _imagePending.clear()
}

function destroyAsset(asset: unknown): void {
    if (!asset) return
    try {
        if (CS.UnityEngine.Application.isPlaying) CS.UnityEngine.Object.Destroy(asset)
        else CS.UnityEngine.Object.DestroyImmediate(asset)
    } catch (e) {
        console.error(`Image cache: could not destroy a cached image: ${e}`)
    }
}
