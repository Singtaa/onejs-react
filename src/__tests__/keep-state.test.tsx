/**
 * Component state across a hot reload (Singtaa/OneJS#155).
 *
 * A reload here is what JSRunner does: capture the state, unmount everything (the teardown),
 * forget this "context" (resetKeepState), hand the snapshot back and render the new code,
 * whose component functions are new objects with the same names.
 *
 * The first group pins the React internals keep-state.ts reads, so an upgrade of React that
 * moves one fails here, by name, instead of keeping wrong state.
 */
import { describe, it, expect, afterEach } from 'vitest';
import React, * as R from 'react';
import { render, unmountAll, getRoot } from '../renderer';
import { HOOK_SLOTS, resetKeepState } from '../keep-state';
import { createMockContainer, flushMicrotasks, MockVisualElement } from './mocks';

const g = globalThis as any;

afterEach(() => {
    unmountAll();
    resetKeepState();
    delete g.__bridge;
    delete g.__onejsReloadSnapshot;
});

/** Captures, tears down and renders `next` into a new container as a reloaded context would. */
async function reload(next: React.ReactNode): Promise<{ container: MockVisualElement; report: string; snapshot: string }> {
    g.__bridge = {};
    g.__onejsCaptureState();
    const snapshot = g.__bridge.ReloadSnapshot as string;
    unmountAll();
    resetKeepState();
    g.__onejsReloadSnapshot = snapshot;
    const container = createMockContainer();
    render(next, container as any);
    await flushMicrotasks();
    return { container, report: g.__onejsTakeReloadReport(), snapshot };
}

async function mount(node: React.ReactNode): Promise<MockVisualElement> {
    const container = createMockContainer();
    render(node, container as any);
    await flushMicrotasks();
    return container;
}

function texts(el: MockVisualElement): string[] {
    const out: string[] = [];
    const walk = (e: any) => {
        if (typeof e.text === 'string' && e.text) out.push(e.text);
        for (const c of e.children ?? []) walk(c);
    };
    walk(el);
    return out;
}

/** A setter the test can call from outside, standing in for a click. */
const setters: Record<string, (v: any) => void> = {};

describe('the React internals keep-state reads', () => {
    it('React exposes the hooks dispatcher and, in development, the rendering fiber', async () => {
        const shared = (React as any).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
        expect(shared).toBeTruthy();
        expect('H' in shared).toBe(true);
        let owner: any = null;
        function Probe() {
            owner = shared.A.getOwner();
            R.useState(0);
            return null;
        }
        const c = await mount(<Probe />);
        const fiber = (getRoot(c as any) as any).current.child;
        expect(owner).toBe(fiber);
        expect(owner.alternate).toBe(null);
    });

    it('every hook keep-state knows takes the slots its table says, and is recorded under its own name', async () => {
        const uses: Record<string, () => void> = {
            useState: () => { R.useState(1); },
            useReducer: () => { R.useReducer((s: number) => s, 1); },
            useRef: () => { R.useRef(1); },
            useMemo: () => { R.useMemo(() => 1, []); },
            useCallback: () => { R.useCallback(() => 1, []); },
            useEffect: () => { R.useEffect(() => {}, []); },
            useLayoutEffect: () => { R.useLayoutEffect(() => {}, []); },
            useInsertionEffect: () => { R.useInsertionEffect(() => {}, []); },
            useImperativeHandle: () => { R.useImperativeHandle(null as any, () => ({}), []); },
            useContext: () => { R.useContext(R.createContext(1)); },
            useDebugValue: () => { R.useDebugValue(1); },
            useDeferredValue: () => { R.useDeferredValue(1); },
            useTransition: () => { R.useTransition(); },
            useSyncExternalStore: () => { R.useSyncExternalStore(() => () => {}, () => 1); },
            useId: () => { R.useId(); },
            useOptimistic: () => { (R as any).useOptimistic(1); },
            useActionState: () => { (R as any).useActionState((s: number) => s, 1); },
            useFormState: () => { (R as any).useActionState((s: number) => s, 1); },
        };
        expect(Object.keys(uses).sort()).toEqual(Object.keys(HOOK_SLOTS).sort());
        for (const [name, use] of Object.entries(uses)) {
            if (name === 'useFormState') continue; // the deprecated alias of useActionState, same slots
            function Probe() {
                use();
                return null;
            }
            const c = await mount(<Probe />);
            const fiber = (getRoot(c as any) as any).current.child;
            let slots = 0;
            for (let h = fiber.memoizedState; h; h = h.next) slots++;
            expect({ name, slots, recorded: fiber._debugHookTypes }).toEqual({ name, slots: HOOK_SLOTS[name], recorded: [name] });
        }
    });

    it('a state hook keeps its value in memoizedState beside a queue with a dispatch, and a ref keeps an object with current', async () => {
        function Probe() {
            R.useState('a');
            R.useReducer((s: number) => s, 7);
            R.useRef({ x: 1 });
            return null;
        }
        const c = await mount(<Probe />);
        const state = (getRoot(c as any) as any).current.child.memoizedState;
        expect(state.memoizedState).toBe('a');
        expect(typeof state.queue.dispatch).toBe('function');
        expect(state.next.memoizedState).toBe(7);
        expect(typeof state.next.queue.dispatch).toBe('function');
        expect(state.next.next.memoizedState).toEqual({ current: { x: 1 } });
    });
});

describe('a hot reload', () => {
    function counter(label: string) {
        return function Counter() {
            const [n, setN] = R.useState(0);
            setters.n = setN;
            return <ojs-label text={`${label} ${n}`} />;
        };
    }

    it('keeps useState in a component whose hooks are unchanged, even though its code changed', async () => {
        const Before = counter('count');
        await mount(<Before />);
        setters.n(5);
        await flushMicrotasks();
        const After = counter('clicks');
        const { container, report } = await reload(<After />);
        expect(texts(container)).toEqual(['clicks 5']);
        expect(report).toBe('kept state in 1 component');
    });

    it('starts the first render, and the mount effects, from the kept value', async () => {
        const seen: number[] = [];
        function Counter() {
            const [n, setN] = R.useState(0);
            setters.n = setN;
            R.useEffect(() => { seen.push(n); }, []);
            return null;
        }
        await mount(<Counter />);
        setters.n(3);
        await flushMicrotasks();
        seen.length = 0;
        await reload(<Counter />);
        expect(seen).toEqual([3]);
    });

    it('keeps useReducer and a ref holding data, and leaves an element ref to React', async () => {
        let ref: any, data: any;
        function Panel() {
            const [s, dispatch] = R.useReducer((x: { open: boolean }, a: string) => (a === 'toggle' ? { open: !x.open } : x), { open: false });
            data = R.useRef({ scrolled: 0 });
            ref = R.useRef(null);
            setters.toggle = () => dispatch('toggle');
            return <ojs-view ref={ref}><ojs-label text={s.open ? 'open' : 'closed'} /></ojs-view>;
        }
        await mount(<Panel />);
        setters.toggle(null);
        data.current.scrolled = 120;
        await flushMicrotasks();
        const { container, report } = await reload(<Panel />);
        expect(texts(container)).toEqual(['open']);
        expect(data.current).toEqual({ scrolled: 120 });
        expect(ref.current).toBe(container.children[0]);
        expect(report).toBe('kept state in 1 component');
    });

    it('starts a component fresh when its hooks changed, and says so', async () => {
        await mount(<>{React.createElement(counter('n'))}</>);
        setters.n(4);
        await flushMicrotasks();
        function Counter() {
            const [n] = R.useState(0);
            const [step] = R.useState(1);
            return <ojs-label text={`n ${n} ${step}`} />;
        }
        const { container, report } = await reload(<><Counter /></>);
        expect(texts(container)).toEqual(['n 0 1']);
        expect(report).toBe('kept state in 0 components; 1 started fresh (Counter: its hooks changed)');
    });

    it('starts a component fresh when its state holds a function or a C# object', async () => {
        function Holder() {
            const [fn, setFn] = R.useState<any>(null);
            setters.fn = setFn;
            return <ojs-label text={fn ? 'set' : 'unset'} />;
        }
        await mount(<Holder />);
        setters.fn(() => ({ __csHandle: 12 }));
        await flushMicrotasks();
        const { container, report } = await reload(<Holder />);
        expect(texts(container)).toEqual(['unset']);
        expect(report).toBe('kept state in 0 components; 1 started fresh (Holder: its state holds a function or a C# object)');
    });

    it('keeps each keyed row with its own key, in its new order', async () => {
        function Row({ id }: { id: string }) {
            const [n, setN] = R.useState(0);
            setters[id] = setN;
            return <ojs-label text={`${id}${n}`} />;
        }
        await mount(<ojs-view>{['a', 'b', 'c'].map(id => <Row key={id} id={id} />)}</ojs-view>);
        setters.a(1);
        setters.c(3);
        await flushMicrotasks();
        const { container, report } = await reload(<ojs-view>{['c', 'a', 'b'].map(id => <Row key={id} id={id} />)}</ojs-view>);
        expect(texts(container)).toEqual(['c3', 'a1', 'b0']);
        expect(report).toBe('kept state in 3 components');
    });

    it('counts a component that moved as no longer where it was, and starts it fresh', async () => {
        const Counter = counter('n');
        await mount(<ojs-view><Counter /></ojs-view>);
        setters.n(2);
        await flushMicrotasks();
        const { container, report } = await reload(<ojs-view><ojs-view><Counter /></ojs-view></ojs-view>);
        expect(texts(container)).toEqual(['n 0']);
        expect(report).toBe('kept state in 0 components; 1 is no longer where it was');
    });

    it('renders everything fresh when the kept state makes the new code throw', async () => {
        await mount(<>{React.createElement(counter('n'))}</>);
        setters.n(9);
        await flushMicrotasks();
        function Counter() {
            const [n] = R.useState(0);
            if (n > 0) throw new Error('expected an object');
            return <ojs-label text={`fresh ${n}`} />;
        }
        const { container, report } = await reload(<><Counter /></>);
        expect(texts(container)).toEqual(['fresh 0']);
        expect(report).toBe('the first render with the kept state threw (expected an object), so every component started fresh');
    });

    it('keeps state through memo and forwardRef', async () => {
        const Memo = R.memo(function Memo() {
            const [n, setN] = R.useState(0);
            setters.m = setN;
            return <ojs-label text={`m${n}`} />;
        });
        const Fwd = R.forwardRef(function Fwd(_: {}, ref: any) {
            const [n, setN] = R.useState(0);
            setters.f = setN;
            return <ojs-label ref={ref} text={`f${n}`} />;
        });
        await mount(<ojs-view><Memo /><Fwd /></ojs-view>);
        setters.m(1);
        setters.f(2);
        await flushMicrotasks();
        const { container, report } = await reload(<ojs-view><Memo /><Fwd /></ojs-view>);
        expect(texts(container)).toEqual(['m1', 'f2']);
        expect(report).toBe('kept state in 2 components');
    });

    it('carries values JSON cannot: undefined, NaN, dates, maps and sets', async () => {
        const value = { u: undefined, n: NaN, i: -Infinity, d: new Date(5), m: new Map([['k', new Set([1, 2])]]), list: [1, 'two', null] };
        let got: any;
        function Holder() {
            const [v, setV] = R.useState<any>(null);
            setters.v = setV;
            got = v;
            return null;
        }
        await mount(<Holder />);
        setters.v(value);
        await flushMicrotasks();
        await reload(<Holder />);
        expect(got).toEqual(value);
        expect(Object.keys(got)).toContain('u');
    });

    it('changes nothing when there is no snapshot, and reports nothing', async () => {
        const Counter = counter('n');
        const c = await mount(<Counter />);
        expect(texts(c)).toEqual(['n 0']);
        expect(g.__onejsTakeReloadReport()).toBe('');
    });

    it('tears down the old tree as before: effect cleanups still run after the state is captured', async () => {
        const cleaned: string[] = [];
        function Sub() {
            R.useState(1);
            R.useEffect(() => () => { cleaned.push('effect'); }, []);
            return null;
        }
        await mount(<Sub />);
        await reload(<Sub />);
        expect(cleaned).toEqual(['effect']);
    });
});
