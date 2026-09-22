/**
 * Tests for `renderItem`: JSX rows inside a virtualized collection view.
 *
 * The collection view still owns the row elements and still recycles them, so
 * these tests drive MockListView's visible window by hand. Each
 * `_setVisibleRange` call stands for one virtualization pass, which is where
 * real binds and unbinds happen, and the assertions are about what React did to
 * the pooled elements in response.
 *
 * Two of these walk a whole sequence rather than one prop, because the bugs
 * this feature can have are sequence bugs: a row that is right when bound and
 * wrong when rebound, or a portal that outlives the element it renders into.
 * Scale is not tested here. It is measured in play mode against 10,000 items,
 * and those numbers live in the ListView docs page.
 */

import { describe, it, expect, vi } from 'vitest';
import React, { useState } from 'react';
import { render } from '../renderer';
import { ListView, TreeView, View, Label } from '../components';
import { MockListView, MockTreeView, MockVisualElement, createMockContainer, flushMicrotasks } from './mocks';

function itemsOf(n: number, prefix = 'Item'): string[] {
    return Array.from({ length: n }, (_, i) => `${prefix} ${i}`);
}

/** A row with structure and state, so the tests exercise a real subtree. */
function Row({ item }: { item: string }) {
    const [mountedWith] = useState(item);
    return (
        <View style={{ flexDirection: 'row', flexGrow: 1 }}>
            <Label text={item} />
            <Label text={mountedWith} />
        </View>
    );
}

/** What each pooled row currently displays, in pool order. */
function rowTexts(list: MockListView): string[] {
    return list._pool.map(row => {
        const root = row.children[0] as MockVisualElement | undefined;
        return (root?.children[0] as MockVisualElement | undefined)?.text ?? '';
    });
}

/** What useState captured at mount, per row: shows whether a row remounted. */
function rowMountedWith(list: MockListView): string[] {
    return list._pool.map(row => {
        const root = row.children[0] as MockVisualElement | undefined;
        return (root?.children[1] as MockVisualElement | undefined)?.text ?? '';
    });
}

describe('ListView renderItem', () => {
    it('fills, scrolls and recycles without rebuilding the pool', async () => {
        const container = createMockContainer();
        render(
            <ListView itemsSource={itemsOf(500)} fixedItemHeight={20} renderItem={(item: string) => <Row item={item} />} />,
            container as any
        );
        await flushMicrotasks();
        const list = container.children[0] as unknown as MockListView;

        // Nothing is bound until the collection view runs a virtualization pass.
        expect(list._pool.length).toBe(0);

        // Fill: one portal per bound row, filling the pooled container rather
        // than replacing it, so the container stays the view's own element.
        list._setVisibleRange(0, 5);
        await flushMicrotasks();
        expect(rowTexts(list)).toEqual(['Item 0', 'Item 1', 'Item 2', 'Item 3', 'Item 4']);
        expect(list._pool.every(row => row.childCount === 1)).toBe(true);
        expect(list._pool[0].style.flexGrow).toBe(1);
        const pooledHandles = list._pool.map(el => el.__csHandle);

        // Scroll by one row, then jump far. Both recycle the same elements.
        list._setVisibleRange(1, 5);
        await flushMicrotasks();
        expect(rowTexts(list)).toEqual(['Item 1', 'Item 2', 'Item 3', 'Item 4', 'Item 5']);

        list._setVisibleRange(400, 5);
        await flushMicrotasks();
        expect(rowTexts(list)).toEqual(['Item 400', 'Item 401', 'Item 402', 'Item 403', 'Item 404']);

        // The pool neither grew nor was rebuilt, and no rebind left a second
        // subtree behind in a row it recycled.
        expect(list._pool.map(el => el.__csHandle)).toEqual(pooledHandles);
        expect(list._pool.every(row => row.childCount === 1)).toBe(true);

        // A bind on a row that is already bound, with no unbind in between.
        // Scrolling never produces this (the pool unbinds first, which would
        // mask a bindItem that ignored the new index), but the callback
        // contract allows it and a refresh can take that path.
        list.bindItem!(list._pool[0], 12);
        await flushMicrotasks();
        expect(rowTexts(list)[0]).toBe('Item 12');
    });

    it('empties rows on unbind, on destroy and on unmount, leaving no portal behind', async () => {
        const container = createMockContainer();
        const ui = (items: string[]) => (
            <View>
                <ListView itemsSource={items} renderItem={(item: string) => <Row item={item} />} />
            </View>
        );

        render(ui(itemsOf(20)), container as any);
        await flushMicrotasks();
        const list = (container.children[0] as MockVisualElement).children[0] as unknown as MockListView;

        list._setVisibleRange(0, 6);
        await flushMicrotasks();
        expect(list._pool.filter(r => r.childCount === 1).length).toBe(6);

        // A shorter window: the tail rows are unbound but stay in the pool, and
        // React empties exactly those.
        list._setVisibleRange(0, 2);
        await flushMicrotasks();
        expect(list._pool.length).toBe(6);
        expect(list._pool.slice(0, 2).every(r => r.childCount === 1)).toBe(true);
        expect(list._pool.slice(2).every(r => r.childCount === 0)).toBe(true);

        // Source contents change under bound rows. No rebind happens, so this
        // only works if the portals re-render from the new prop.
        render(ui(itemsOf(20, 'Fresh')), container as any);
        await flushMicrotasks();
        expect(rowTexts(list).slice(0, 2)).toEqual(['Fresh 0', 'Fresh 1']);

        // Retiring pooled elements. Unity can do that without unbinding them
        // first, and a portal that outlives its target renders into a C# object
        // that is gone.
        list._setVisibleRange(0, 6);
        await flushMicrotasks();
        const retired = list._pool.slice(-2);
        expect(retired.every(r => r.childCount === 1)).toBe(true);
        list._destroyPooledRows(2);
        await flushMicrotasks();
        expect(list._pool.length).toBe(4);
        expect(retired.every(r => r.childCount === 0)).toBe(true);

        // Unmounting the list unmounts every row that is still bound.
        const live = list._pool.slice();
        render(<View />, container as any);
        await flushMicrotasks();
        expect(live.every(r => r.childCount === 0)).toBe(true);
    });

    it('remounts a row when the pool points it at a different item', async () => {
        // The hazard virtualization always has: a recycled element must not
        // carry the previous item's component state into the new item.
        const container = createMockContainer();
        render(
            <ListView itemsSource={itemsOf(100)} renderItem={(item: string) => <Row item={item} />} />,
            container as any
        );
        await flushMicrotasks();
        const list = container.children[0] as unknown as MockListView;

        list._setVisibleRange(0, 2);
        await flushMicrotasks();
        expect(rowMountedWith(list)).toEqual(['Item 0', 'Item 1']);

        list._setVisibleRange(50, 2);
        await flushMicrotasks();
        expect(rowMountedWith(list)).toEqual(['Item 50', 'Item 51']);
    });

    it('renders nothing for a row still bound past the end of a shrunken source', async () => {
        const renderItem = vi.fn((item: string) => <Label text={item.toUpperCase()} />);
        const container = createMockContainer();
        const ui = (items: string[]) => <ListView itemsSource={items} renderItem={renderItem} />;

        render(ui(itemsOf(6)), container as any);
        await flushMicrotasks();
        const list = container.children[0] as unknown as MockListView;
        list._setVisibleRange(0, 6);
        await flushMicrotasks();

        // Shrink the source without telling the view. React re-renders first,
        // with rows still bound to indices 2..5 that no longer exist, and
        // reading item.toUpperCase() off undefined would throw here.
        render(ui(itemsOf(2)), container as any);
        await flushMicrotasks();
        expect(renderItem).not.toHaveBeenCalledWith(undefined, expect.anything());

        // Once the view catches up, the emptied rows agree with the source.
        list.RefreshItems();
        await flushMicrotasks();
        expect(list._pool.slice(2).every(r => r.childCount === 0)).toBe(true);
    });

    it('assigns the four collection delegates once, however often the list re-renders', async () => {
        const container = createMockContainer();
        const ui = (items: string[]) => (
            <ListView itemsSource={items} renderItem={(item: string) => <Label text={item} />} />
        );

        render(ui(itemsOf(5, 'A')), container as any);
        await flushMicrotasks();
        const list = container.children[0] as unknown as MockListView;
        const delegates = [list.makeItem, list.bindItem, list.unbindItem, list.destroyItem];

        for (const prefix of ['B', 'C', 'D']) {
            render(ui(itemsOf(5, prefix)), container as any);
            await flushMicrotasks();
        }
        list._setVisibleRange(0, 3);
        await flushMicrotasks();

        // Each reassignment burns a slot in the 4096-entry native callback
        // table, so a list that re-renders every frame must not touch them.
        expect([list.makeItem, list.bindItem, list.unbindItem, list.destroyItem]).toEqual(delegates);
    });

    it('leaves the imperative makeItem/bindItem path untouched', async () => {
        const items = itemsOf(10);
        const made: MockVisualElement[] = [];
        const container = createMockContainer();
        render(
            <ListView
                itemsSource={items}
                makeItem={() => {
                    const el = new MockVisualElement('UnityEngine.UIElements.Label');
                    made.push(el);
                    return el as any;
                }}
                bindItem={(el: any, i: number) => { el.text = items[i]; }}
            />,
            container as any
        );
        await flushMicrotasks();
        const list = container.children[0] as unknown as MockListView;

        list._setVisibleRange(0, 3);
        await flushMicrotasks();

        expect(made.map(el => el.text)).toEqual(['Item 0', 'Item 1', 'Item 2']);
        // The user's own elements are the rows: no container wrapper, no portal.
        expect(made.every(el => el.childCount === 0)).toBe(true);
    });
});

describe('TreeView renderItem', () => {
    it('renders rows from the data resolved at bind time, and releases them on unbind', async () => {
        const container = createMockContainer();
        render(
            <TreeView
                rootItems={[
                    { id: 1, data: { name: 'root' }, children: [
                        { id: 2, data: { name: 'child a' } },
                        { id: 3, data: { name: 'child b' } },
                    ]},
                ]}
                renderItem={(data: { name: string }) => <Label text={data.name} />}
            />,
            container as any
        );
        await flushMicrotasks();
        const tree = container.children[0] as unknown as MockTreeView;

        // TreeView binds through host-config, which resolves a row's data from
        // its id rather than from an index into a source array.
        const rows: MockVisualElement[] = [];
        for (let i = 0; i < 3; i++) {
            const row = tree.makeItem!() as MockVisualElement;
            rows.push(row);
            tree.bindItem!(row, i);
        }
        await flushMicrotasks();
        expect(rows.map(r => (r.children[0] as MockVisualElement)?.text)).toEqual(['root', 'child a', 'child b']);

        tree.unbindItem!(rows[1], 1);
        await flushMicrotasks();
        expect(rows.map(r => r.childCount)).toEqual([1, 0, 1]);
    });
});
