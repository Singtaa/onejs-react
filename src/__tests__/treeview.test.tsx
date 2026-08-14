/**
 * Tests for the TreeView wrapper.
 *
 * flattenTree fixtures mirror TreeViewBridgeTests.cs: the parallel-array wire
 * (pre-order, parentId -1 = root) is the C#-JS contract, so the same shapes
 * are asserted on both sides.
 */
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render } from '../renderer';
import { ListView, TreeView } from '../components';
import { flattenTree } from '../treeview';
import { MockListView, MockTreeView, createMockContainer, flushMicrotasks } from './mocks';

describe('flattenTree', () => {
    it('flattens a nested structure in pre-order', () => {
        // Mirrors TreeViewBridgeTests.SetRootItems_BuildsNestedStructure
        const flat = flattenTree([
            { id: 1, data: 'a', children: [
                { id: 2, data: 'b' },
                { id: 3, data: 'c', children: [{ id: 4, data: 'd' }] },
            ]},
            { id: 10, data: 'e' },
        ]);
        expect(flat.ids).toEqual([1, 2, 3, 4, 10]);
        expect(flat.parentIds).toEqual([-1, 1, 1, 3, -1]);
    });

    it('preserves sibling order', () => {
        // Mirrors TreeViewBridgeTests.SetRootItems_PreservesSiblingOrder
        const flat = flattenTree([
            { id: 7, data: 'p', children: [
                { id: 3, data: 'x' }, { id: 9, data: 'y' }, { id: 5, data: 'z' }, { id: 1, data: 'w' },
            ]},
        ]);
        expect(flat.ids).toEqual([7, 3, 9, 5, 1]);
        expect(flat.parentIds).toEqual([-1, 7, 7, 7, 7]);
    });

    it('marks a flat list as all roots', () => {
        const flat = flattenTree([{ id: 4, data: 1 }, { id: 2, data: 2 }, { id: 8, data: 3 }]);
        expect(flat.parentIds).toEqual([-1, -1, -1]);
    });

    it('auto-assigns ids without colliding with explicit ones', () => {
        const flat = flattenTree([
            { data: 'auto' },
            { id: 0, data: 'explicit0' },
            { id: 1, data: 'explicit1' },
            { data: 'auto2' },
        ]);
        const autoIds = [flat.ids[0], flat.ids[3]];
        expect(new Set(flat.ids).size).toBe(4);
        expect(autoIds).not.toContain(0);
        expect(autoIds).not.toContain(1);
        expect(flat.dataById.get(flat.ids[0])).toBe('auto');
        expect(flat.dataById.get(flat.ids[3])).toBe('auto2');
    });

    it('throws on duplicate explicit ids', () => {
        expect(() => flattenTree([{ id: 1, data: 'a' }, { id: 1, data: 'b' }]))
            .toThrow(/Duplicate item id 1/);
    });

    it('maps every id to its data', () => {
        const flat = flattenTree([
            { id: 1, data: { name: 'root' }, children: [{ id: 2, data: { name: 'leaf' } }] },
        ]);
        expect((flat.dataById.get(1) as { name: string }).name).toBe('root');
        expect((flat.dataById.get(2) as { name: string }).name).toBe('leaf');
    });
});

describe('TreeView', () => {
    const ROOTS = [
        { id: 1, data: 'a', children: [
            { id: 2, data: 'b' },
            { id: 3, data: 'c', children: [{ id: 4, data: 'd' }] },
        ]},
        { id: 10, data: 'e' },
    ];

    it('renders and sends the flattened tree through the bridge', async () => {
        const container = createMockContainer();
        render(<TreeView rootItems={ROOTS} makeItem={() => ({} as any)} bindItem={() => {}} />, container as any);
        await flushMicrotasks();

        const el = container.children[0] as unknown as MockTreeView;
        expect(el.__csType).toBe('UnityEngine.UIElements.TreeView');
        expect(el._setRootItemsCalls).toBe(1);
        expect(el._flatIds).toEqual([1, 2, 3, 4, 10]);
        expect(el._flatParents).toEqual([-1, 1, 1, 3, -1]);
    });

    it('resolves row data in bindItem via GetIdForIndex', async () => {
        const container = createMockContainer();
        const bindItem = vi.fn();
        render(<TreeView rootItems={ROOTS} makeItem={() => ({} as any)} bindItem={bindItem} />, container as any);
        await flushMicrotasks();

        const el = container.children[0] as unknown as MockTreeView;
        const row = {};
        el.bindItem!(row, 3);   // all-expanded index 3 -> id 4 -> data 'd'
        expect(bindItem).toHaveBeenCalledWith(row, 3, 'd');
    });

    it('keeps delegates stable and skips the bridge when data is unchanged', async () => {
        const container = createMockContainer();
        const first = vi.fn();
        const second = vi.fn();
        render(<TreeView rootItems={ROOTS} makeItem={() => ({} as any)} bindItem={first} />, container as any);
        await flushMicrotasks();

        const el = container.children[0] as unknown as MockTreeView;
        const boundDelegate = el.bindItem;

        render(<TreeView rootItems={ROOTS} makeItem={() => ({} as any)} bindItem={second} />, container as any);
        await flushMicrotasks();

        // Same data reference: no extra crossing. Same delegate object: no
        // native callback slot churn. New callback still honored through state.
        expect(el._setRootItemsCalls).toBe(1);
        expect(el.bindItem).toBe(boundDelegate);
        el.bindItem!({}, 0);
        expect(first).not.toHaveBeenCalled();
        expect(second).toHaveBeenCalledWith({}, 0, 'a');
    });

    it('re-sends the tree when rootItems reference changes', async () => {
        const container = createMockContainer();
        render(<TreeView rootItems={ROOTS} makeItem={() => ({} as any)} bindItem={() => {}} />, container as any);
        await flushMicrotasks();
        const el = container.children[0] as unknown as MockTreeView;

        render(<TreeView rootItems={[{ id: 42, data: 'new' }]} makeItem={() => ({} as any)} bindItem={() => {}} />, container as any);
        await flushMicrotasks();

        expect(el._setRootItemsCalls).toBe(2);
        expect(el._flatIds).toEqual([42]);
    });

    it('fires onSelectionChange with resolved items and ids', async () => {
        const container = createMockContainer();
        const onSelectionChange = vi.fn();
        render(
            <TreeView rootItems={ROOTS} makeItem={() => ({} as any)} bindItem={() => {}}
                selectionType="Single" onSelectionChange={onSelectionChange} />,
            container as any
        );
        await flushMicrotasks();

        const el = container.children[0] as unknown as MockTreeView;
        expect(el.selectionType).toBe(1);
        el._selectedIds = [3];
        el._fireSelectionChanged();
        expect(onSelectionChange).toHaveBeenCalledWith(['c'], [3]);
    });

    it('applies scalar props', async () => {
        const container = createMockContainer();
        render(
            <TreeView rootItems={ROOTS} makeItem={() => ({} as any)} bindItem={() => {}}
                fixedItemHeight={24} autoExpand showAlternatingRowBackgrounds="All" />,
            container as any
        );
        await flushMicrotasks();

        const el = container.children[0] as unknown as MockTreeView;
        expect(el.fixedItemHeight).toBe(24);
        expect(el.autoExpand).toBe(true);
        expect(el.showAlternatingRowBackgrounds).toBe(2);
    });
});

describe('ListView selection events', () => {
    it('fires onSelectionChange with selected indices', async () => {
        const container = createMockContainer();
        const onSelectionChange = vi.fn();
        render(
            <ListView itemsSource={['a', 'b', 'c']} makeItem={() => ({} as any)} bindItem={() => {}}
                onSelectionChange={onSelectionChange} />,
            container as any
        );
        await flushMicrotasks();

        const el = container.children[0] as unknown as MockListView;
        el._selectedIndices = [0, 2];
        el._fireSelectionChanged();
        expect(onSelectionChange).toHaveBeenCalledWith([0, 2]);
    });

    it('fires onItemsChosen with the chosen items from itemsSource', async () => {
        const container = createMockContainer();
        const onItemsChosen = vi.fn();
        render(
            <ListView itemsSource={['a', 'b', 'c']} makeItem={() => ({} as any)} bindItem={() => {}}
                onItemsChosen={onItemsChosen} />,
            container as any
        );
        await flushMicrotasks();

        const el = container.children[0] as unknown as MockListView;
        el._selectedIndices = [1];
        el._fireItemsChosen();
        expect(onItemsChosen).toHaveBeenCalledWith(['b']);
    });
});
