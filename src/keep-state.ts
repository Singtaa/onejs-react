/**
 * Component state that survives a hot reload (Singtaa/OneJS#155).
 *
 * A hot reload destroys the JS context and runs the new bundle in a fresh one, so nothing old
 * is left running. Just before that, JSRunner calls `__onejsCaptureState()`, which records each
 * function component's `useState`, `useReducer` and `useRef` values, keyed by where the
 * component sits in the tree and by the order of its hooks, and hands them to C# as JSON. The
 * new context gets them back as `__onejsReloadSnapshot`, and the first render of each root
 * starts those hooks from the saved values instead of their initial ones.
 *
 * Every step fails towards a fresh start, never towards wrong state:
 * - A component whose place in the tree or whose list of hooks changed starts fresh.
 * - A value that cannot be copied as data (a function, a C# object, a class instance) is not
 *   kept: a state hook holding one starts its whole component fresh; a ref holding one (an
 *   element ref, usually) just starts at its initial value, as React fills it anyway.
 * - If the first render after restoring throws, or a restored component turns out to have
 *   different hooks, the root renders again with less (or nothing) restored.
 *
 * This reads React's development build internals: the hook list on each fiber, the
 * `_debugHookTypes` names, the current owner from the async dispatcher, and the hooks
 * dispatcher in React's shared internals. `keep-state.test.tsx` pins each of them, so a React
 * upgrade that moves one fails a test rather than silently keeping wrong state. The editor
 * always runs the development build (a player build, the production one, never hot reloads).
 */
import React from 'react';

type Fiber = any;

/** A component's saved hooks: their names in order, and the kept values by hook index. */
interface SavedComponent {
    /** Display name, for the report. */
    n: string;
    /** `_debugHookTypes` at capture: the component's hook names, in call order. */
    h: string[];
    /** Kept values by index into `h`: `s` state, `r` reducer, `f` ref. */
    v: Record<number, { k: 's' | 'r' | 'f'; v: unknown }>;
}

/** A component that had state but could not keep it, and why. */
interface FreshComponent {
    n: string;
    fresh: string;
}

type SavedEntry = SavedComponent | FreshComponent;

/** One root's components by path. */
export type SavedRoot = Record<string, SavedEntry>;

export interface StateSnapshot {
    v: 1;
    roots: SavedRoot[];
}

const VERSION = 1;
/** A snapshot larger than this is dropped: copying it would cost more than the state is worth. */
const MAX_SNAPSHOT_CHARS = 4 * 1024 * 1024;

/**
 * Hook slots each hook takes in a fiber's `memoizedState` list, by the name React records in
 * `_debugHookTypes`. A hook missing from this table makes its component start fresh, so a
 * React that adds one keeps working, just without keeping that component's state.
 */
export const HOOK_SLOTS: Readonly<Record<string, number>> = {
    useState: 1,
    useReducer: 1,
    useRef: 1,
    useMemo: 1,
    useCallback: 1,
    useEffect: 1,
    useLayoutEffect: 1,
    useInsertionEffect: 1,
    useImperativeHandle: 1,
    useContext: 0,
    useDebugValue: 0,
    useDeferredValue: 1,
    useTransition: 2,
    useSyncExternalStore: 2,
    useId: 1,
    useOptimistic: 1,
    useActionState: 3,
    useFormState: 3,
};

function internals(): any {
    return (React as any).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
}

// Paths

function typeName(fiber: Fiber): string {
    const t = fiber.type;
    if (typeof t === 'string') return t;
    if (typeof t === 'function') return t.displayName || t.name || 'Anonymous';
    if (t && typeof t === 'object') {
        const inner = t.render || t.type;
        if (t.displayName) return t.displayName;
        if (typeof inner === 'function') return inner.displayName || inner.name || 'Anonymous';
        if (typeof t.$$typeof === 'symbol') return t.$$typeof.description || 'object';
        return 'object';
    }
    return `#${fiber.tag}`;
}

function segment(fiber: Fiber): string {
    return `${typeName(fiber)}:${fiber.key != null ? `k${fiber.key}` : fiber.index}`;
}

/** The fiber's path from its root, the same for the same place in the old and the new tree. */
function pathOf(fiber: Fiber): string {
    const parts: string[] = [];
    for (let f = fiber; f && f.return; f = f.return) parts.push(segment(f));
    return parts.reverse().join('/');
}

function hookNames(fiber: Fiber): string[] | null {
    return Array.isArray(fiber._debugHookTypes) && fiber._debugHookTypes.length > 0 ? fiber._debugHookTypes : null;
}

function* components(rootFiber: Fiber): Generator<[string, Fiber]> {
    // Iterative depth-first walk carrying each fiber's path.
    const stack: Array<[Fiber, string]> = [];
    for (let c = rootFiber.child; c; c = c.sibling) stack.push([c, segment(c)]);
    stack.reverse();
    while (stack.length) {
        const [fiber, path] = stack.pop()!;
        if (hookNames(fiber)) yield [path, fiber];
        const children: Array<[Fiber, string]> = [];
        for (let c = fiber.child; c; c = c.sibling) children.push([c, `${path}/${segment(c)}`]);
        for (let i = children.length - 1; i >= 0; i--) stack.push(children[i]);
    }
}

// Values as data

class NotData extends Error {}

const TAG = '\u0000onejs';

function encode(value: unknown, seen: Set<object>, depth: number): unknown {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number') return Number.isFinite(value) && !Object.is(value, -0) ? value : { [TAG]: 'n', v: String(value) };
    if (value === undefined) return { [TAG]: 'u' };
    if (typeof value !== 'object' || depth > 64) throw new NotData();
    if (seen.has(value)) throw new NotData();
    seen.add(value);
    try {
        if (Array.isArray(value)) return value.map(x => encode(x, seen, depth + 1));
        if (value instanceof Date) return { [TAG]: 'd', v: value.getTime() };
        if (value instanceof Map) return { [TAG]: 'm', v: Array.from(value, ([k, x]) => [encode(k, seen, depth + 1), encode(x, seen, depth + 1)]) };
        if (value instanceof Set) return { [TAG]: 'S', v: Array.from(value, x => encode(x, seen, depth + 1)) };
        const proto = Object.getPrototypeOf(value);
        // A C# object's proxy, a class instance, a React element: not data.
        if ((proto !== Object.prototype && proto !== null) || '__csHandle' in (value as object) || '$$typeof' in (value as object)) throw new NotData();
        const out: Record<string, unknown> = {};
        for (const key of Object.keys(value as object)) {
            if (key === TAG) throw new NotData();
            out[key] = encode((value as any)[key], seen, depth + 1);
        }
        return out;
    } finally {
        seen.delete(value);
    }
}

function decode(value: unknown): unknown {
    if (value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(decode);
    const tagged = (value as any)[TAG];
    if (tagged !== undefined) {
        const v = (value as any).v;
        switch (tagged) {
            case 'u': return undefined;
            case 'n': return Number(v);
            case 'd': return new Date(v);
            case 'm': return new Map(v.map(([k, x]: [unknown, unknown]) => [decode(k), decode(x)]));
            case 'S': return new Set(v.map(decode));
        }
    }
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as object)) out[key] = decode((value as any)[key]);
    return out;
}

/** The value as data, or NotData. */
function asData(value: unknown): { ok: true; v: unknown } | { ok: false } {
    try {
        return { ok: true, v: encode(value, new Set(), 0) };
    } catch (e) {
        if (e instanceof NotData) return { ok: false };
        // A getter that throws, a revoked proxy: not data either.
        return { ok: false };
    }
}

// Capture

function captureComponent(fiber: Fiber): SavedEntry | null {
    const names = hookNames(fiber)!;
    const name = typeName(fiber);
    const values: SavedComponent['v'] = {};
    let hook = fiber.memoizedState;
    let any = false;
    for (let i = 0; i < names.length; i++) {
        const slots = HOOK_SLOTS[names[i]];
        if (slots === undefined) return { n: name, fresh: `uses ${names[i]}` };
        if (names[i] === 'useState' || names[i] === 'useReducer') {
            if (!hook || !hook.queue || typeof hook.queue.dispatch !== 'function') return { n: name, fresh: 'its hooks could not be read' };
            const data = asData(hook.memoizedState);
            if (!data.ok) return { n: name, fresh: 'its state holds a function or a C# object' };
            values[i] = { k: names[i] === 'useState' ? 's' : 'r', v: data.v };
            any = true;
        } else if (names[i] === 'useRef') {
            if (!hook || !hook.memoizedState || typeof hook.memoizedState !== 'object' || !('current' in hook.memoizedState)) return { n: name, fresh: 'its hooks could not be read' };
            const data = asData(hook.memoizedState.current);
            if (data.ok) {
                values[i] = { k: 'f', v: data.v };
                any = true;
            }
        }
        for (let s = 0; s < slots; s++) hook = hook?.next;
    }
    // The walk has to land exactly on the end of the list, or the table above is wrong for this React.
    if (hook) return { n: name, fresh: 'its hooks could not be read' };
    return any ? { n: name, h: names.slice(), v: values } : null;
}

/** The state of every component in these roots, as JSON for the next context. */
export function captureState(fiberRoots: Iterable<any>): string {
    const snapshot: StateSnapshot = { v: VERSION, roots: [] };
    for (const fiberRoot of fiberRoots) {
        const saved: SavedRoot = {};
        const rootFiber = fiberRoot?.current;
        if (rootFiber) {
            for (const [path, fiber] of components(rootFiber)) {
                const entry = captureComponent(fiber);
                if (entry) saved[path] = entry;
            }
        }
        snapshot.roots.push(saved);
    }
    const json = JSON.stringify(snapshot);
    return json.length > MAX_SNAPSHOT_CHARS ? '' : json;
}

// Restore

/** The snapshot handed to this context, consumed root by root as roots are created. */
let pending: StateSnapshot | null | undefined;
let rootsCreated = 0;

/** This context's saved state for the next root it creates, or null. */
export function takeSavedRoot(): SavedRoot | null {
    const g = globalThis as any;
    if (pending === undefined) {
        pending = null;
        const raw = g.__onejsReloadSnapshot;
        delete g.__onejsReloadSnapshot;
        if (typeof raw === 'string' && raw) {
            try {
                const parsed = JSON.parse(raw);
                if (parsed && parsed.v === VERSION && Array.isArray(parsed.roots)) pending = parsed;
            } catch {
                pending = null;
            }
        }
    }
    const index = rootsCreated++;
    const saved = pending?.roots[index];
    return saved && Object.keys(saved).length > 0 ? saved : null;
}

/**
 * Whether this React exposes the hooks dispatcher. The rendering fiber is read during the
 * render (React sets its async dispatcher only then), and a component it cannot find simply
 * starts fresh, so a production build, which never hot reloads, would keep nothing.
 */
export function canRestore(): boolean {
    const i = internals();
    return !!i && 'H' in i && 'A' in i;
}

/**
 * Runs `render` with hooks of components in `saved` starting from their saved values. Only
 * mounting components are touched, and only `useState`, `useReducer` and `useRef` at an index
 * whose name matches the saved one; the whole list is compared after the render.
 */
export function withRestoredHooks(saved: SavedRoot, render: () => void): Set<string> {
    const shared = internals();
    const restored = new Set<string>();
    let real = shared.H;
    let active: any = null;
    let nested = 0;

    function wrap(dispatcher: any, entry: SavedComponent, path: string): any {
        let index = 0;
        const wrapper: any = Object.create(null);
        for (const key of Object.keys(dispatcher)) {
            const fn = dispatcher[key];
            if (typeof fn !== 'function') {
                wrapper[key] = fn;
                continue;
            }
            // The hooks React records in _debugHookTypes. A component using any other one was
            // saved as fresh, so it never gets here.
            const recorded = key in HOOK_SLOTS;
            wrapper[key] = function (this: unknown, ...args: any[]) {
                const i = recorded ? index++ : -1;
                const kept = i >= 0 && entry.h[i] === key ? entry.v[i] : undefined;
                if (kept) {
                    const value = decode(kept.v);
                    if (key === 'useState' && kept.k === 's') args = [() => value];
                    else if (key === 'useReducer' && kept.k === 'r') args = [args[0], value];
                    else if (key === 'useRef' && kept.k === 'f') args = [value];
                    restored.add(path);
                }
                nested++;
                try {
                    return fn.apply(this, args);
                } finally {
                    nested--;
                }
            };
        }
        return wrapper;
    }

    function onDispatcher(next: any): void {
        real = next;
        // React swaps the dispatcher inside a hook too (useMemo's factory, in development):
        // that is the same component, so its count carries on.
        if (nested > 0) return;
        active = null;
        if (!next || typeof next.useState !== 'function') return;
        const owner = shared.A?.getOwner?.();
        // A mounting component whose render is just starting: React clears the hook list first.
        if (!owner || owner.alternate !== null || owner.memoizedState !== null) return;
        const path = pathOf(owner);
        const entry = saved[path];
        if (!entry || !('h' in entry)) return;
        // A re-render after a render-phase update gets no wrapper: it reuses the hooks it made,
        // where React ignores initial values.
        active = wrap(next, entry, path);
    }

    const descriptor = Object.getOwnPropertyDescriptor(shared, 'H');
    Object.defineProperty(shared, 'H', {
        configurable: true,
        enumerable: true,
        get() {
            return active && nested === 0 ? active : real;
        },
        set(next) {
            onDispatcher(next);
        },
    });
    try {
        render();
    } finally {
        if (descriptor) Object.defineProperty(shared, 'H', { ...descriptor, value: real });
        else shared.H = real;
    }
    return restored;
}

export interface RestoreCheck {
    kept: number;
    fresh: Array<{ path: string; name: string; why: string }>;
    gone: number;
}

/** What the render kept: components restored whose hook lists match the saved ones. */
export function checkRestore(fiberRoot: any, saved: SavedRoot, restored: Set<string>): RestoreCheck {
    const check: RestoreCheck = { kept: 0, fresh: [], gone: 0 };
    const found = new Set<string>();
    if (fiberRoot?.current) {
        for (const [path, fiber] of components(fiberRoot.current)) {
            const entry = saved[path];
            if (!entry) continue;
            found.add(path);
            if (!('h' in entry)) {
                check.fresh.push({ path, name: entry.n, why: entry.fresh });
            } else {
                const names = hookNames(fiber) ?? [];
                if (names.length !== entry.h.length || names.some((n, i) => n !== entry.h[i])) check.fresh.push({ path, name: entry.n, why: 'its hooks changed' });
                else if (restored.has(path)) check.kept++;
                else check.fresh.push({ path, name: entry.n, why: 'its state could not be restored' });
            }
        }
    }
    for (const path of Object.keys(saved)) if (!found.has(path)) check.gone++;
    return check;
}

/** The saved state minus these paths. */
export function without(saved: SavedRoot, paths: Iterable<string>): SavedRoot {
    const out = { ...saved };
    for (const p of paths) delete out[p];
    return out;
}

// Report

let checks: RestoreCheck[] = [];
let fallback: string | null = null;
/** JSRunner has read the report after running the bundle; a root rendered later logs its own. */
let reportTaken = false;

function noted(): void {
    if (!reportTaken) return;
    const line = takeReport();
    if (line) console.log(`[OneJS React] After the reload: ${line}`);
}

export function noteCheck(check: RestoreCheck): void {
    checks.push(check);
    noted();
}

/** Every component of a root started fresh, for this reason. */
export function noteFallback(reason: string): void {
    fallback = reason;
    noted();
}

/**
 * One line for JSRunner's "Reloaded" log: how many components kept their state and which
 * started fresh, and why. Empty when nothing had state to keep. Clears what it read.
 */
export function takeReport(): string {
    const all = checks;
    const why = fallback;
    checks = [];
    fallback = null;
    reportTaken = true;
    if (why !== null) return `${why}, so every component started fresh`;
    if (all.length === 0) return '';
    const kept = all.reduce((n, c) => n + c.kept, 0);
    const gone = all.reduce((n, c) => n + c.gone, 0);
    const reasons = new Map<string, number>();
    for (const c of all) for (const f of c.fresh) {
        const key = `${f.name}: ${f.why}`;
        reasons.set(key, (reasons.get(key) ?? 0) + 1);
    }
    const fresh = Array.from(reasons.values()).reduce((a, b) => a + b, 0);
    const parts = [`kept state in ${kept} component${kept === 1 ? '' : 's'}`];
    if (fresh > 0) {
        const named = Array.from(reasons, ([w, n]) => (n > 1 ? w.replace(':', ` (${n}):`) : w));
        const list = named.length > 6 ? [...named.slice(0, 6), `${named.length - 6} more`] : named;
        parts.push(`${fresh} started fresh (${list.join('; ')})`);
    }
    if (gone > 0) parts.push(`${gone} ${gone === 1 ? 'is' : 'are'} no longer where ${gone === 1 ? 'it was' : 'they were'}`);
    return parts.join('; ');
}

/** For tests: forget this context's snapshot, as a new context would. */
export function resetKeepState(): void {
    pending = undefined;
    rootsCreated = 0;
    checks = [];
    fallback = null;
    reportTaken = false;
}
