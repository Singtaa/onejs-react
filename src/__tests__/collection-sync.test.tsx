/**
 * End-to-end tests for collection state sync patterns.
 *
 * Simulates the real-world use case of syncing dynamic C# game state
 * (inventories, quest logs, NPC lists) to React components using
 * useFrameSync selector mode + toArray.
 *
 * Tests the parent/child pattern:
 * - Parent watches list structure (Count) via selector
 * - Child components each watch their own item properties via selector
 * - When an item property changes, only that child re-renders
 * - When items are added/removed, the parent re-renders
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import React from "react"
import { useFrameSync, toArray } from "../hooks"
import { render, unmount } from "../renderer"
import { createMockContainer, flushMicrotasks } from "./mocks"

// ---------------------------------------------------------------------------
// RAF mock
// ---------------------------------------------------------------------------

type RafCallback = (time: number) => void

let rafQueue: Array<{ id: number; callback: RafCallback }> = []
let nextRafId = 0

function flushRaf() {
    const queue = [...rafQueue]
    rafQueue = []
    const now = Date.now()
    for (const { callback } of queue) {
        callback(now)
    }
}

async function advanceFrame() {
    flushRaf()
    await flushMicrotasks()
}

beforeEach(() => {
    rafQueue = []
    nextRafId = 0
    ;(globalThis as any).requestAnimationFrame = vi.fn((cb: RafCallback) => {
        const id = ++nextRafId
        rafQueue.push({ id, callback: cb })
        return id
    })
    ;(globalThis as any).cancelAnimationFrame = vi.fn((id: number) => {
        rafQueue = rafQueue.filter((e) => e.id !== id)
    })
})

afterEach(() => {
    delete (globalThis as any).requestAnimationFrame
    delete (globalThis as any).cancelAnimationFrame
})

// ---------------------------------------------------------------------------
// Mock C# proxy objects — simulates proxy caching behavior
//
// In real OneJS, accessing a C# object from JS always returns the same
// proxy reference (cached by handle). Properties read through to C# on
// each access, so mutations are visible through the same reference.
// ---------------------------------------------------------------------------

interface MockItem {
    Id: number
    Name: string
    Durability: number
    StackCount: number
    Version: number
}

interface MockInventory {
    Items: { Count: number; [index: number]: MockItem }
}

function createMockInventory(items: MockItem[]): MockInventory {
    // Simulates a C# List<Item> — same proxy object, Count and indexer
    // read live values (mutating the items array is visible immediately)
    const proxy: any = {
        get Count() { return items.length },
    }
    // Numeric indexer — proxy reads live from the array
    return {
        Items: new Proxy(proxy, {
            get(target, prop) {
                if (prop === "Count") return items.length
                const idx = Number(prop)
                if (!isNaN(idx) && idx >= 0 && idx < items.length) {
                    return items[idx]
                }
                return target[prop]
            }
        })
    }
}

function createMockItem(id: number, name: string, durability: number): MockItem {
    return { Id: id, Name: name, Durability: durability, StackCount: 1, Version: 1 }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("collection sync: parent/child pattern", () => {
    let container: ReturnType<typeof createMockContainer>

    beforeEach(() => {
        container = createMockContainer()
    })

    afterEach(() => {
        unmount(container as any)
    })

    it("parent re-renders when items are added, children render per item", async () => {
        const items: MockItem[] = [
            createMockItem(1, "Sword", 100),
            createMockItem(2, "Shield", 80),
        ]
        const inventory = createMockInventory(items)

        let parentRenders = 0
        const childRenders: Record<number, number> = {}

        function ItemView({ item }: { item: MockItem }) {
            const data = useFrameSync(
                () => item,
                (i) => [i.Name, i.Durability, i.StackCount]
            )
            childRenders[data.Id] = (childRenders[data.Id] || 0) + 1
            return null
        }

        function InventoryList() {
            const inv = useFrameSync(
                () => inventory,
                (i) => [i.Items.Count]
            )
            parentRenders++
            return (
                <>
                    {toArray<MockItem>(inv.Items).map(item => (
                        <ItemView key={item.Id} item={item} />
                    ))}
                </>
            )
        }

        render(<InventoryList />, container as any)
        await flushMicrotasks()
        await advanceFrame()

        expect(parentRenders).toBeGreaterThanOrEqual(1)
        expect(childRenders[1]).toBeGreaterThanOrEqual(1)
        expect(childRenders[2]).toBeGreaterThanOrEqual(1)

        const parentRendersAfterInit = parentRenders
        const child1RendersAfterInit = childRenders[1]
        const child2RendersAfterInit = childRenders[2]

        // Add a new item
        items.push(createMockItem(3, "Potion", 1))
        await advanceFrame()

        // Parent should re-render (Count changed from 2 to 3)
        expect(parentRenders).toBeGreaterThan(parentRendersAfterInit)
        // New child should have rendered
        expect(childRenders[3]).toBeGreaterThanOrEqual(1)
    })

    it("only the affected child re-renders when an item property changes", async () => {
        const items: MockItem[] = [
            createMockItem(1, "Sword", 100),
            createMockItem(2, "Shield", 80),
            createMockItem(3, "Potion", 1),
        ]
        const inventory = createMockInventory(items)

        let parentRenders = 0
        const childRenders: Record<number, number> = {}

        function ItemView({ item }: { item: MockItem }) {
            const data = useFrameSync(
                () => item,
                (i) => [i.Name, i.Durability, i.StackCount]
            )
            childRenders[data.Id] = (childRenders[data.Id] || 0) + 1
            return null
        }

        function InventoryList() {
            const inv = useFrameSync(
                () => inventory,
                (i) => [i.Items.Count]
            )
            parentRenders++
            return (
                <>
                    {toArray<MockItem>(inv.Items).map(item => (
                        <ItemView key={item.Id} item={item} />
                    ))}
                </>
            )
        }

        render(<InventoryList />, container as any)
        await flushMicrotasks()
        await advanceFrame()

        const parentRendersAfterInit = parentRenders
        const child1After = childRenders[1]
        const child2After = childRenders[2]
        const child3After = childRenders[3]

        // Change only Sword's durability (simulates using the item)
        items[0].Durability = 90
        await advanceFrame()

        // Parent should NOT re-render (Count unchanged)
        expect(parentRenders).toBe(parentRendersAfterInit)
        // Only Sword's child should re-render
        expect(childRenders[1]).toBeGreaterThan(child1After)
        // Shield and Potion should NOT re-render
        expect(childRenders[2]).toBe(child2After)
        expect(childRenders[3]).toBe(child3After)
    })

    it("version stamp on items catches any property change", async () => {
        const items: MockItem[] = [
            createMockItem(1, "Sword", 100),
            createMockItem(2, "Shield", 80),
        ]
        const inventory = createMockInventory(items)

        const childRenders: Record<number, number> = {}

        function ItemView({ item }: { item: MockItem }) {
            // Watch only Version — catches all changes without listing every property
            const data = useFrameSync(
                () => item,
                (i) => [i.Version]
            )
            childRenders[data.Id] = (childRenders[data.Id] || 0) + 1
            return null
        }

        function InventoryList() {
            const inv = useFrameSync(
                () => inventory,
                (i) => [i.Items.Count]
            )
            return (
                <>
                    {toArray<MockItem>(inv.Items).map(item => (
                        <ItemView key={item.Id} item={item} />
                    ))}
                </>
            )
        }

        render(<InventoryList />, container as any)
        await flushMicrotasks()
        await advanceFrame()

        const child1After = childRenders[1]
        const child2After = childRenders[2]

        // Change Sword's durability AND bump its version (simulates Fody)
        items[0].Durability = 90
        items[0].Version = 2
        await advanceFrame()

        // Sword re-renders (version changed)
        expect(childRenders[1]).toBeGreaterThan(child1After)
        // Shield does NOT re-render (version unchanged)
        expect(childRenders[2]).toBe(child2After)
    })

    it("handles item removal correctly", async () => {
        const items: MockItem[] = [
            createMockItem(1, "Sword", 100),
            createMockItem(2, "Shield", 80),
            createMockItem(3, "Potion", 1),
        ]
        const inventory = createMockInventory(items)

        let parentRenders = 0
        const childRenders: Record<number, number> = {}

        function ItemView({ item }: { item: MockItem }) {
            const data = useFrameSync(
                () => item,
                (i) => [i.Name, i.Durability]
            )
            childRenders[data.Id] = (childRenders[data.Id] || 0) + 1
            return null
        }

        function InventoryList() {
            const inv = useFrameSync(
                () => inventory,
                (i) => [i.Items.Count]
            )
            parentRenders++
            return (
                <>
                    {toArray<MockItem>(inv.Items).map(item => (
                        <ItemView key={item.Id} item={item} />
                    ))}
                </>
            )
        }

        render(<InventoryList />, container as any)
        await flushMicrotasks()
        await advanceFrame()

        const parentRendersAfterInit = parentRenders
        expect(childRenders[1]).toBeGreaterThanOrEqual(1)
        expect(childRenders[2]).toBeGreaterThanOrEqual(1)
        expect(childRenders[3]).toBeGreaterThanOrEqual(1)

        // Remove Shield (index 1)
        items.splice(1, 1)
        await advanceFrame()

        // Parent should re-render (Count changed from 3 to 2)
        expect(parentRenders).toBeGreaterThan(parentRendersAfterInit)
    })

    it("nullable parent with optional chaining works end-to-end", async () => {
        let currentPlace: { Name: string; NPCs: { Count: number; [i: number]: { Name: string; Dialogue: string } } } | null = {
            Name: "Tavern",
            NPCs: {
                Count: 2,
                0: { Name: "Barkeep", Dialogue: "Welcome!" },
                1: { Name: "Bard", Dialogue: "La la la~" },
            },
        }

        let parentRenders = 0
        const npcRenders: Record<string, number> = {}

        function NPCView({ npc }: { npc: { Name: string; Dialogue: string } }) {
            const data = useFrameSync(
                () => npc,
                (n) => [n.Name, n.Dialogue]
            )
            npcRenders[data.Name] = (npcRenders[data.Name] || 0) + 1
            return null
        }

        function PlaceUI() {
            const place = useFrameSync(
                () => currentPlace,
                (p) => [p?.Name, p?.NPCs?.Count]
            )
            parentRenders++

            if (!place) return null

            return (
                <>
                    {toArray<{ Name: string; Dialogue: string }>(place.NPCs).map((npc, i) => (
                        <NPCView key={npc.Name} npc={npc} />
                    ))}
                </>
            )
        }

        render(<PlaceUI />, container as any)
        await flushMicrotasks()
        await advanceFrame()

        expect(parentRenders).toBeGreaterThanOrEqual(1)
        expect(npcRenders["Barkeep"]).toBeGreaterThanOrEqual(1)
        expect(npcRenders["Bard"]).toBeGreaterThanOrEqual(1)

        const parentAfterInit = parentRenders
        const barkeepAfter = npcRenders["Barkeep"]

        // Change Barkeep's dialogue (NPC property change)
        currentPlace!.NPCs[0].Dialogue = "What'll ya have?"
        await advanceFrame()

        // Parent should NOT re-render (Name and NPC Count unchanged)
        expect(parentRenders).toBe(parentAfterInit)
        // Only Barkeep should re-render
        expect(npcRenders["Barkeep"]).toBeGreaterThan(barkeepAfter)

        const parentAfterDialogue = parentRenders

        // Player leaves the tavern (set to null)
        currentPlace = null
        await advanceFrame()

        // Parent should re-render (place changed to null)
        expect(parentRenders).toBeGreaterThan(parentAfterDialogue)
    })

    it("multiple property changes in one frame only cause one re-render", async () => {
        const item = createMockItem(1, "Sword", 100)

        let renderCount = 0

        function ItemView() {
            const data = useFrameSync(
                () => item,
                (i) => [i.Name, i.Durability, i.StackCount, i.Version]
            )
            renderCount++
            return null
        }

        render(<ItemView />, container as any)
        await flushMicrotasks()
        await advanceFrame()
        const afterInit = renderCount

        // Change multiple properties at once (between frames)
        item.Name = "Broken Sword"
        item.Durability = 0
        item.Version = 2
        await advanceFrame()

        // Should only re-render once for all changes in the same frame
        expect(renderCount).toBe(afterInit + 1)
    })
})
