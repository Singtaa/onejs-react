import type { TreeViewItem } from './types';

/**
 * TreeView data plumbing. BaseTreeView's data entry point is the generic
 * SetRootItems<T>, which the CS proxy cannot call, so the tree crosses as two
 * parallel int arrays in pre-order (parents before children, siblings in
 * display order); parentIds[i] is the parent of ids[i], with -1 marking a
 * root. Item data itself never crosses: C# stores TreeViewItemData<int> whose
 * payload is the id, and row binding resolves id -> data from the map built
 * here. The array contract is replayed by Runtime/TreeViewBridge.cs; keep the
 * two in sync (fixtures mirrored in TreeViewBridgeTests.cs).
 */

export interface FlatTree {
    ids: number[];
    parentIds: number[];
    dataById: Map<number, unknown>;
}

export function flattenTree(items: TreeViewItem[]): FlatTree {
    const ids: number[] = [];
    const parentIds: number[] = [];
    const dataById = new Map<number, unknown>();

    // Collect explicit ids first so auto-assignment never collides with an
    // explicit id that appears later in the tree.
    const used = new Set<number>();
    const collectExplicit = (nodes: TreeViewItem[]) => {
        for (const node of nodes) {
            if (node.id !== undefined) {
                if (used.has(node.id)) {
                    throw new Error(`[TreeView] Duplicate item id ${node.id}`);
                }
                used.add(node.id);
            }
            if (node.children) collectExplicit(node.children);
        }
    };
    collectExplicit(items);

    let next = 0;
    const autoId = () => {
        while (used.has(next)) next++;
        used.add(next);
        return next;
    };

    const walk = (nodes: TreeViewItem[], parentId: number) => {
        for (const node of nodes) {
            const id = node.id !== undefined ? node.id : autoId();
            ids.push(id);
            parentIds.push(parentId);
            dataById.set(id, node.data);
            if (node.children && node.children.length > 0) {
                walk(node.children, id);
            }
        }
    };
    walk(items, -1);

    return { ids, parentIds, dataById };
}
