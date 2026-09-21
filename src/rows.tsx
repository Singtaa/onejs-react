import { Fragment, createElement, isValidElement, type ReactNode, useCallback, useState } from 'react';
import { createPortal } from './renderer';
import type { VisualElement } from './types';

declare const CS: any;

/**
 * Row plumbing behind the `renderItem` prop on ListView and TreeView.
 *
 * UI Toolkit owns the row elements and recycles them: `makeItem` creates a
 * pooled element, `bindItem` points it at a data index, `unbindItem` releases
 * it, `destroyItem` retires it. `renderItem` layers React on top without taking
 * that ownership away. `makeItem` hands back a plain container, `bindItem`
 * records which index that container is showing, and every bound container
 * becomes the target of one React portal. React owns what is inside a row; the
 * collection view keeps doing the virtualization.
 *
 * A portal is keyed by its container's C# handle, so a recycled container keeps
 * its portal across binds and React never tears the target down. What goes
 * inside is keyed separately, by the row's identity: see renderPortal.
 */

/** One pooled row element that the collection view currently has bound. */
interface BoundRow {
    element: VisualElement;
    index: number;
    /** Row data resolved at bind time. TreeView supplies it; ListView reads itemsSource instead. */
    data: unknown;
}

export interface RowPortals {
    makeItem: () => VisualElement;
    bindItem: (element: VisualElement, index: number, data?: unknown) => void;
    unbindItem: (element: VisualElement, index: number, data?: unknown) => void;
    destroyItem: (element: VisualElement) => void;
    /** Portals for the currently bound rows. Render inside the collection element. */
    portals: ReactNode;
}

function handleOf(element: VisualElement): number {
    return (element as unknown as { __csHandle: number }).__csHandle;
}

/**
 * Turn a `renderItem` callback into the four imperative collection callbacks
 * plus the portals that fill the bound rows.
 *
 * Pass `undefined` to opt out: the callbacks are still returned (hooks run
 * unconditionally) but no portal is produced, so the caller can forward the
 * user's own imperative callbacks instead.
 */
export function useRowPortals(renderRow: ((index: number, data: unknown) => ReactNode) | undefined): RowPortals {
    const [rows, setRows] = useState<BoundRow[]>([]);

    // All four callbacks are stable for the life of the component. They are
    // assigned to C# delegate properties, and every reassignment burns a slot in
    // the native callback table (4096 of them), so re-rendering must not churn
    // them. They only close over setRows, which React keeps stable.
    const makeItem = useCallback((): VisualElement => {
        const el = new CS.UnityEngine.UIElements.VisualElement();
        // The pooled row is a container, not the content. Fill the row box so a
        // renderItem root that lays itself out (flexGrow, alignment, padding)
        // sees the height the collection view reserved for it.
        el.style.flexGrow = 1;
        return el as VisualElement;
    }, []);

    const bindItem = useCallback((element: VisualElement, index: number, data?: unknown) => {
        setRows(prev => {
            const handle = handleOf(element);
            const at = prev.findIndex(r => handleOf(r.element) === handle);
            if (at < 0) return [...prev, { element, index, data }];
            if (prev[at].index === index && prev[at].data === data) return prev;
            const next = prev.slice();
            next[at] = { element, index, data };
            return next;
        });
    }, []);

    const releaseRow = useCallback((element: VisualElement) => {
        setRows(prev => {
            const handle = handleOf(element);
            const at = prev.findIndex(r => handleOf(r.element) === handle);
            if (at < 0) return prev;
            const next = prev.slice();
            next.splice(at, 1);
            return next;
        });
    }, []);

    const unbindItem = useCallback((element: VisualElement) => releaseRow(element), [releaseRow]);
    // A destroyed row element must drop its portal too, or React would keep
    // rendering into a C# object that no longer exists. Unity calls destroyItem
    // without a preceding unbindItem when it shrinks the pool.
    const destroyItem = useCallback((element: VisualElement) => releaseRow(element), [releaseRow]);

    const portals = renderRow ? rows.map(row => renderPortal(row, renderRow)) : null;

    return { makeItem, bindItem, unbindItem, destroyItem, portals };
}

/**
 * One row's portal: React's contents, UI Toolkit's container.
 *
 * Two keys are at work, and they answer different questions. The portal's key
 * is the container's handle, so the portal itself survives recycling and React
 * never tears the target down. The content's key is the row's identity, so the
 * contents do NOT survive being pointed at a different item: a component with
 * state (an expanded row, an editing flag) remounts instead of carrying state
 * from the item that scrolled away.
 *
 * Identity is the key on the node `renderItem` returned when there is one, and
 * the index otherwise. That is the usual React escape hatch: returning a root
 * keyed by the item's own id keeps a row's state across a reorder or an
 * insertion, where the index alone would move it to the wrong row.
 */
function renderPortal(row: BoundRow, renderRow: (index: number, data: unknown) => ReactNode): ReactNode {
    const content = renderRow(row.index, row.data);
    const identity = isValidElement(content) && content.key != null ? content.key : String(row.index);
    return createPortal(
        createElement(Fragment, { key: identity }, content),
        row.element,
        String(handleOf(row.element))
    );
}
