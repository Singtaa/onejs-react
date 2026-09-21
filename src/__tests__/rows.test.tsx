/**
 * Tests for `renderItem`: JSX rows inside a virtualized collection view.
 *
 * The collection view still owns the row elements and still recycles them, so
 * these tests drive MockListView's visible window by hand. Each
 * `_setVisibleRange` call stands for one virtualization pass, which is where
 * real binds and unbinds happen, and the assertions are about what React did to
 * the pooled elements in response.
 */

import { describe, it, expect, vi } from 'vitest';
import React, { useState } from 'react';
import { render } from '../renderer';
import { ListView, TreeView } from '../components';
import { View, Label } from '../components';
import { MockListView, MockTreeView, MockVisualElement, createMockContainer, flushMicrotasks, getCreatedElements } from './mocks';

function itemsOf(n: number, prefix = 'Item'): string[] {
    return Array.from({ length: n }, (_, i) => `${prefix} ${i}`);
}

async function mountList(ui: React.ReactElement) {
    const container = createMockContainer();
    render(ui, container as any);
    await flushMicrotasks();
    return { container, list: container.children[0] as unknown as MockListView };
}

/** Text of the Labels React put inside each pooled row, in pool order. */
function rowTexts(list: MockListView): string[] {
    return list._pool.map(row => {
        const first = row.children[0] as MockVisualElement | undefined;
        return first ? first.text : '';
    });
}

describe('ListView renderItem: binding', () => {
    it('renders JSX into each bound row element', async () => {
        const items = itemsOf(50);
        const { list } = await mountList(
            <ListView itemsSource={items} fixedItemHeight={20} renderItem={(item: string) => <Label text={item} />} />
        );

        // Nothing is bound until the collection view runs a virtualization pass.
        expect(list._pool.length).toBe(0);

        list._setVisibleRange(0, 5);
        await flushMicrotasks();

        expect(list._pool.length).toBe(5);
        expect(rowTexts(list)).toEqual(['Item 0', 'Item 1', 'Item 2', 'Item 3', 'Item 4']);
        // One child per row: the portal fills the pooled container, it does not
        // replace it, so the container is still the collection view's element.
        expect(list._pool.every(row => row.childCount === 1)).toBe(true);
    });

    it('gives the pooled container a row-filling style, not the content', async () => {
        const { list } = await mountList(
            <ListView itemsSource={itemsOf(10)} renderItem={(item: string) => <Label text={item} />} />
        );
        list._setVisibleRange(0, 2);
        await flushMicrotasks();

        expect(list._pool[0].style.flexGrow).toBe(1);
    });

    it('renders a row built from several elements and hooks', async () => {
        function Row({ item }: { item: string }) {
            const [count, setCount] = useState(0);
            return (
                <View>
                    <Label text={`${item}:${count}`} />
                    <Label text="tap" onClick={() => setCount(c => c + 1)} />
                </View>
            );
        }
        const { list } = await mountList(
            <ListView itemsSource={itemsOf(20)} renderItem={(item: string) => <Row item={item} />} />
        );
        list._setVisibleRange(0, 3);
        await flushMicrotasks();

        const firstRowRoot = list._pool[0].children[0] as MockVisualElement;
        expect(firstRowRoot.__csType).toBe('UnityEngine.UIElements.VisualElement');
        expect((firstRowRoot.children[0] as MockVisualElement).text).toBe('Item 0:0');
    });
});

describe('ListView renderItem: recycling', () => {
    it('reuses the pooled element when the window scrolls', async () => {
        const items = itemsOf(10000);
        const { list } = await mountList(
            <ListView itemsSource={items} fixedItemHeight={20} renderItem={(item: string) => <Label text={item} />} />
        );

        list._setVisibleRange(0, 4);
        await flushMicrotasks();
        const pooled = list._pool.slice();
        const handles = pooled.map(el => el.__csHandle);

        list._setVisibleRange(40, 4);
        await flushMicrotasks();

        // Same C# elements, new contents: the pool was not rebuilt.
        expect(list._pool.map(el => el.__csHandle)).toEqual(handles);
        expect(rowTexts(list)).toEqual(['Item 40', 'Item 41', 'Item 42', 'Item 43']);
        // And still exactly one child each: no duplicate content left behind by
        // the unbind/bind pair that recycling performs.
        expect(list._pool.every(row => row.childCount === 1)).toBe(true);
    });

    it('scrolling to the far end of 10,000 items leaves the pool at its original size', async () => {
        const items = itemsOf(10000);
        const { list } = await mountList(
            <ListView itemsSource={items} fixedItemHeight={20} renderItem={(item: string) => <Label text={item} />} />
        );

        list._setVisibleRange(0, 12);
        await flushMicrotasks();
        const poolSize = list._pool.length;

        for (let start = 0; start <= 9900; start += 300) {
            list._setVisibleRange(start, 12);
            await flushMicrotasks();
        }

        expect(list._pool.length).toBe(poolSize);
        expect(list._pool.every(row => row.childCount === 1)).toBe(true);
        expect(rowTexts(list)[0]).toBe('Item 9900');
    });

    it('builds one row subtree per rebind, and no more', async () => {
        // The mock rebinds every pooled row when the window moves, which is the
        // worst case (Unity rotates its pool, so a one-row scroll rebinds one
        // row). What is asserted here is the ratio: a rebind costs one row
        // subtree, not a whole pool, and nothing accumulates across scrolls.
        const before = getCreatedElements().length;
        const { list } = await mountList(
            <ListView itemsSource={itemsOf(10000)} renderItem={(item: string) => <Label text={item} />} />
        );
        list._setVisibleRange(0, 4);
        await flushMicrotasks();
        const afterFirstFill = getCreatedElements().length;
        // 4 row containers + 4 labels, plus the ListView and the mock root.
        expect(afterFirstFill - before).toBe(10);

        list._setVisibleRange(100, 4);
        await flushMicrotasks();
        // Four rebinds: four new Labels, and no new containers (the pool held).
        expect(getCreatedElements().length - afterFirstFill).toBe(4);

        list._setVisibleRange(200, 4);
        await flushMicrotasks();
        expect(getCreatedElements().length - afterFirstFill).toBe(8);
    });

    it('remounts row state when a row is pointed at a different item', async () => {
        // The hazard virtualization always has: a recycled element must not
        // carry the previous item's component state into the new item.
        const mounted: string[] = [];
        function Row({ item }: { item: string }) {
            const [seen] = useState(item);
            mounted.push(item);
            return <Label text={seen} />;
        }
        const { list } = await mountList(
            <ListView itemsSource={itemsOf(100)} renderItem={(item: string) => <Row item={item} />} />
        );

        list._setVisibleRange(0, 2);
        await flushMicrotasks();
        expect(rowTexts(list)).toEqual(['Item 0', 'Item 1']);

        list._setVisibleRange(50, 2);
        await flushMicrotasks();

        // useState's initial value is the NEW item, so the row remounted rather
        // than keeping the state that belonged to the item that scrolled away.
        expect(rowTexts(list)).toEqual(['Item 50', 'Item 51']);
    });

    it('re-keys rows by item identity when an insertion shifts every index', async () => {
        interface Row { id: number; name: string }
        const base: Row[] = [
            { id: 1, name: 'one' },
            { id: 2, name: 'two' },
            { id: 3, name: 'three' },
        ];
        function RowView({ row }: { row: Row }) {
            const [firstSeen] = useState(row.name);
            return <Label text={firstSeen} />;
        }

        const container = createMockContainer();
        const ui = (items: Row[]) => (
            <ListView
                itemsSource={items}
                renderItem={(row: Row) => <RowView key={row.id} row={row} />}
            />
        );
        render(ui(base), container as any);
        await flushMicrotasks();
        const list = container.children[0] as unknown as MockListView;

        list._setVisibleRange(0, 3);
        await flushMicrotasks();
        expect(rowTexts(list)).toEqual(['one', 'two', 'three']);

        // Prepend: every row's index shifts by one, but the ids do not move.
        const shifted: Row[] = [{ id: 0, name: 'zero' }, ...base];
        render(ui(shifted), container as any);
        list.RefreshItems();
        await flushMicrotasks();

        // Each pooled row is still bound to the same INDEX, so an index-keyed
        // row would have kept the state it mounted with and gone on showing
        // one/two/three. Keying by the item's own id re-mounts the rows the
        // insertion actually moved, so the display follows the data.
        expect(rowTexts(list)).toEqual(['zero', 'one', 'two']);
    });
});

describe('ListView renderItem: unbinding', () => {
    it('empties a pooled row that leaves the visible window', async () => {
        const { list } = await mountList(
            <ListView itemsSource={itemsOf(10)} renderItem={(item: string) => <Label text={item} />} />
        );

        list._setVisibleRange(0, 6);
        await flushMicrotasks();
        expect(list._pool.length).toBe(6);

        // A shorter window: the tail rows are unbound but stay in the pool.
        list._setVisibleRange(0, 2);
        await flushMicrotasks();

        expect(list._pool.length).toBe(6);
        expect(list._pool.slice(0, 2).every(row => row.childCount === 1)).toBe(true);
        expect(list._pool.slice(2).every(row => row.childCount === 0)).toBe(true);
    });

    it('drops the portal when the element is destroyed', async () => {
        const { list } = await mountList(
            <ListView itemsSource={itemsOf(10)} renderItem={(item: string) => <Label text={item} />} />
        );

        list._setVisibleRange(0, 4);
        await flushMicrotasks();
        const doomed = list._pool[list._pool.length - 1];
        expect(doomed.childCount).toBe(1);

        // Unity retires pooled elements without unbinding them first.
        list._destroyPooledRows(2);
        await flushMicrotasks();

        expect(list._pool.length).toBe(2);
        // React unmounted into the retired element before letting go of it, so
        // nothing is left rendering into an element the view no longer owns.
        expect(doomed.childCount).toBe(0);
    });

    it('unmounts every row when the ListView itself unmounts', async () => {
        const container = createMockContainer();
        function App({ show }: { show: boolean }) {
            return <View>{show && <ListView itemsSource={itemsOf(10)} renderItem={(i: string) => <Label text={i} />} />}</View>;
        }
        render(<App show={true} />, container as any);
        await flushMicrotasks();
        const list = (container.children[0] as MockVisualElement).children[0] as unknown as MockListView;
        list._setVisibleRange(0, 3);
        await flushMicrotasks();
        const rows = list._pool.slice();
        expect(rows.every(r => r.childCount === 1)).toBe(true);

        render(<App show={false} />, container as any);
        await flushMicrotasks();

        expect(rows.every(r => r.childCount === 0)).toBe(true);
    });

    it('survives Rebuild, which destroys the pool and makes it again', async () => {
        const { list } = await mountList(
            <ListView itemsSource={itemsOf(30)} renderItem={(item: string) => <Label text={item} />} />
        );
        list._setVisibleRange(0, 4);
        await flushMicrotasks();
        const oldRows = list._pool.slice();

        list.Rebuild();
        await flushMicrotasks();

        expect(list._pool.map(r => r.__csHandle)).not.toEqual(oldRows.map(r => r.__csHandle));
        expect(oldRows.every(r => r.childCount === 0)).toBe(true);
        expect(rowTexts(list)).toEqual(['Item 0', 'Item 1', 'Item 2', 'Item 3']);
    });
});

describe('ListView renderItem: itemsSource changes', () => {
    it('re-renders bound rows when the source contents change', async () => {
        const container = createMockContainer();
        const ui = (items: string[]) => (
            <ListView itemsSource={items} renderItem={(item: string) => <Label text={item} />} />
        );

        render(ui(itemsOf(10, 'A')), container as any);
        await flushMicrotasks();
        const list = container.children[0] as unknown as MockListView;
        list._setVisibleRange(0, 3);
        await flushMicrotasks();
        expect(rowTexts(list)).toEqual(['A 0', 'A 1', 'A 2']);

        // Same length, new contents: React re-renders from the new prop even
        // though no row changed which index it is bound to.
        render(ui(itemsOf(10, 'B')), container as any);
        await flushMicrotasks();

        expect(rowTexts(list)).toEqual(['B 0', 'B 1', 'B 2']);
    });

    it('empties rows that fall off the end of a shrunken source', async () => {
        const container = createMockContainer();
        const ui = (items: string[]) => (
            <ListView itemsSource={items} renderItem={(item: string) => <Label text={item} />} />
        );

        render(ui(itemsOf(8)), container as any);
        await flushMicrotasks();
        const list = container.children[0] as unknown as MockListView;
        list._setVisibleRange(0, 6);
        await flushMicrotasks();
        expect(list._pool.filter(r => r.childCount === 1).length).toBe(6);

        render(ui(itemsOf(2)), container as any);
        list.RefreshItems();
        await flushMicrotasks();

        expect(rowTexts(list).slice(0, 2)).toEqual(['Item 0', 'Item 1']);
        expect(list._pool.slice(2).every(r => r.childCount === 0)).toBe(true);
    });

    it('never hands renderItem an item past the end of the source', async () => {
        const renderItem = vi.fn((item: string) => <Label text={item.toUpperCase()} />);
        const container = createMockContainer();
        const ui = (items: string[]) => <ListView itemsSource={items} renderItem={renderItem} />;

        render(ui(itemsOf(6)), container as any);
        await flushMicrotasks();
        const list = container.children[0] as unknown as MockListView;
        list._setVisibleRange(0, 6);
        await flushMicrotasks();

        // Shrink the source without telling the view: React re-renders first,
        // with rows still bound to indices 2..5 that no longer exist. Reading
        // item.toUpperCase() off undefined would throw here.
        render(ui(itemsOf(2)), container as any);
        await flushMicrotasks();

        expect(renderItem).not.toHaveBeenCalledWith(undefined, expect.anything());
    });
});

describe('ListView renderItem: callback stability', () => {
    it('assigns the collection delegates once, however often the list re-renders', async () => {
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

        // Each reassignment would burn a slot in the 4096-entry native callback
        // table, so a list that re-renders per frame must not touch them.
        expect([list.makeItem, list.bindItem, list.unbindItem, list.destroyItem]).toEqual(delegates);
    });
});

describe('ListView imperative rows still work', () => {
    it('forwards makeItem/bindItem untouched when renderItem is absent', async () => {
        const items = itemsOf(10);
        const made: MockVisualElement[] = [];
        const { list } = await mountList(
            <ListView
                itemsSource={items}
                makeItem={() => {
                    const el = new MockVisualElement('UnityEngine.UIElements.Label');
                    made.push(el);
                    return el as any;
                }}
                bindItem={(el: any, i: number) => { el.text = items[i]; }}
            />
        );

        list._setVisibleRange(0, 3);
        await flushMicrotasks();

        expect(made.length).toBe(3);
        expect(made.map(el => el.text)).toEqual(['Item 0', 'Item 1', 'Item 2']);
        // No portals: the rows are the user's own elements, with no container
        // wrapper and no React children.
        expect(made.every(el => el.childCount === 0)).toBe(true);
    });
});

describe('TreeView renderItem', () => {
    it('renders JSX rows from the data resolved at bind time', async () => {
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
        // its id; drive three rows of the all-expanded view.
        const rows: MockVisualElement[] = [];
        for (let i = 0; i < 3; i++) {
            const row = tree.makeItem!() as MockVisualElement;
            rows.push(row);
            tree.bindItem!(row, i);
        }
        await flushMicrotasks();

        expect(rows.map(r => (r.children[0] as MockVisualElement)?.text)).toEqual(['root', 'child a', 'child b']);
    });

    it('empties a row when the TreeView unbinds it', async () => {
        const container = createMockContainer();
        render(
            <TreeView
                rootItems={[{ id: 1, data: { name: 'only' } }]}
                renderItem={(data: { name: string }) => <Label text={data.name} />}
            />,
            container as any
        );
        await flushMicrotasks();
        const tree = container.children[0] as unknown as MockTreeView;

        const row = tree.makeItem!() as MockVisualElement;
        tree.bindItem!(row, 0);
        await flushMicrotasks();
        expect(row.childCount).toBe(1);

        tree.unbindItem!(row, 0);
        await flushMicrotasks();
        expect(row.childCount).toBe(0);
    });
});
