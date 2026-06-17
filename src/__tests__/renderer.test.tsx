/**
 * Integration tests for the React renderer
 *
 * Tests cover:
 * - render() and unmount() functions
 * - Full React tree rendering
 * - Re-renders and updates
 * - Component lifecycle
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import React, { useState, useEffect } from 'react';
import { render, unmount, unmountAll, createPortal, getRoot } from '../renderer';
import { View, Label, Button } from '../components';
import { MockVisualElement, MockLength, MockColor, createMockContainer, flushMicrotasks, getEventAPI } from './mocks';

// Helper to extract value from style (handles both raw values and MockLength/MockColor)
function getStyleValue(style: unknown): unknown {
    if (style instanceof MockLength) return style.value;
    if (style instanceof MockColor) return style;
    return style;
}

describe('renderer', () => {
    describe('render()', () => {
        it('renders a simple element to container', async () => {
            const container = createMockContainer();

            render(<ojs-view />, container as any);
            await flushMicrotasks();

            expect(container.childCount).toBe(1);
            expect(container.children[0].__csType).toBe('UnityEngine.UIElements.VisualElement');
        });

        it('renders nested elements', async () => {
            const container = createMockContainer();

            render(
                <ojs-view>
                    <ojs-label text="Hello" />
                    <ojs-button text="Click" />
                </ojs-view>,
                container as any
            );
            await flushMicrotasks();

            expect(container.childCount).toBe(1);
            const view = container.children[0] as MockVisualElement;
            expect(view.childCount).toBe(2);
            expect(view.children[0].__csType).toBe('UnityEngine.UIElements.Label');
            expect(view.children[1].__csType).toBe('UnityEngine.UIElements.Button');
        });

        it('renders with styles', async () => {
            const container = createMockContainer();

            render(
                <ojs-view style={{ width: 100, height: 50, backgroundColor: 'blue' }} />,
                container as any
            );
            await flushMicrotasks();

            const view = container.children[0] as MockVisualElement;
            expect(getStyleValue(view.style.width)).toBe(100);
            expect(getStyleValue(view.style.height)).toBe(50);
            expect(view.style.backgroundColor).toBeInstanceOf(MockColor);
        });

        it('renders with className', async () => {
            const container = createMockContainer();

            render(<ojs-view className="foo bar" />, container as any);
            await flushMicrotasks();

            const view = container.children[0] as MockVisualElement;
            expect(view.hasClass('foo')).toBe(true);
            expect(view.hasClass('bar')).toBe(true);
        });

        it('creates a root on first render', async () => {
            const container = createMockContainer();

            expect(getRoot(container as any)).toBeUndefined();

            render(<ojs-view />, container as any);
            await flushMicrotasks();

            expect(getRoot(container as any)).toBeDefined();
        });

        it('reuses root on re-render to same container', async () => {
            const container = createMockContainer();

            render(<ojs-view />, container as any);
            await flushMicrotasks();
            const firstRoot = getRoot(container as any);

            render(<ojs-label text="Updated" />, container as any);
            await flushMicrotasks();
            const secondRoot = getRoot(container as any);

            expect(secondRoot).toBe(firstRoot);
        });
    });

    describe('unmount()', () => {
        it('removes rendered content from container', async () => {
            const container = createMockContainer();

            render(<ojs-view />, container as any);
            await flushMicrotasks();
            expect(container.childCount).toBe(1);

            unmount(container as any);
            await flushMicrotasks();

            // Container should be cleared
            expect(container.childCount).toBe(0);
        });

        it('removes the root reference', async () => {
            const container = createMockContainer();

            render(<ojs-view />, container as any);
            await flushMicrotasks();
            expect(getRoot(container as any)).toBeDefined();

            unmount(container as any);
            await flushMicrotasks();

            expect(getRoot(container as any)).toBeUndefined();
        });

        it('does nothing when unmounting non-rendered container', () => {
            const container = createMockContainer();

            // Should not throw
            expect(() => unmount(container as any)).not.toThrow();
        });
    });

    describe('createPortal()', () => {
        it('renders portal children into the target, not the host container', async () => {
            const host = createMockContainer();
            const portalTarget = createMockContainer();

            function App() {
                return (
                    <ojs-view>
                        <ojs-label text="in-tree" />
                        {createPortal(<ojs-button text="in-portal" />, portalTarget as any)}
                    </ojs-view>
                );
            }

            render(<App />, host as any);
            await flushMicrotasks();

            // Host tree contains only the view + its label child, not the portal child
            const view = host.children[0] as MockVisualElement;
            expect(view.childCount).toBe(1);
            expect(view.children[0].__csType).toBe('UnityEngine.UIElements.Label');

            // Portal target received the button
            expect(portalTarget.childCount).toBe(1);
            expect(portalTarget.children[0].__csType).toBe('UnityEngine.UIElements.Button');
        });

        it('appends into an existing target without clearing it', async () => {
            const host = createMockContainer();
            const portalTarget = createMockContainer();
            const existing = new MockVisualElement();
            portalTarget.Add(existing);

            render(
                <ojs-view>{createPortal(<ojs-label text="overlay" />, portalTarget as any)}</ojs-view>,
                host as any
            );
            await flushMicrotasks();

            expect(portalTarget.childCount).toBe(2);
            expect(portalTarget.children).toContain(existing);
        });

        it('updates portal children when state changes', async () => {
            const host = createMockContainer();
            const portalTarget = createMockContainer();
            let setText: (s: string) => void;

            function App() {
                const [text, _setText] = useState('a');
                setText = _setText;
                return <ojs-view>{createPortal(<ojs-label text={text} />, portalTarget as any)}</ojs-view>;
            }

            render(<App />, host as any);
            await flushMicrotasks();
            expect((portalTarget.children[0] as MockVisualElement).text).toBe('a');

            setText!('b');
            await flushMicrotasks();
            expect((portalTarget.children[0] as MockVisualElement).text).toBe('b');
        });

        it('removes portal content from the target on unmount', async () => {
            const host = createMockContainer();
            const portalTarget = createMockContainer();

            render(
                <ojs-view>{createPortal(<ojs-label text="x" />, portalTarget as any)}</ojs-view>,
                host as any
            );
            await flushMicrotasks();
            expect(portalTarget.childCount).toBe(1);

            unmount(host as any);
            await flushMicrotasks();
            expect(portalTarget.childCount).toBe(0);
        });

        it('removes portal content when conditionally unmounted', async () => {
            const host = createMockContainer();
            const portalTarget = createMockContainer();
            let setShow: (b: boolean) => void;

            function App() {
                const [show, _setShow] = useState(true);
                setShow = _setShow;
                return (
                    <ojs-view>
                        {show && createPortal(<ojs-label text="modal" />, portalTarget as any)}
                    </ojs-view>
                );
            }

            render(<App />, host as any);
            await flushMicrotasks();
            expect(portalTarget.childCount).toBe(1);

            setShow!(false);
            await flushMicrotasks();
            expect(portalTarget.childCount).toBe(0);
        });
    });

    describe('component wrappers', () => {
        it('renders View component', async () => {
            const container = createMockContainer();

            render(<View style={{ padding: 10 }} />, container as any);
            await flushMicrotasks();

            const view = container.children[0] as MockVisualElement;
            expect(view.__csType).toBe('UnityEngine.UIElements.VisualElement');
            expect(getStyleValue(view.style.paddingTop)).toBe(10);
        });

        it('renders Label component', async () => {
            const container = createMockContainer();

            render(<Label text="Hello World" />, container as any);
            await flushMicrotasks();

            const label = container.children[0] as MockVisualElement;
            expect(label.__csType).toBe('UnityEngine.UIElements.Label');
            expect(label.text).toBe('Hello World');
        });

        it('renders Button component with onClick', async () => {
            const container = createMockContainer();
            const handleClick = vi.fn();

            render(<Button text="Click Me" onClick={handleClick} />, container as any);
            await flushMicrotasks();

            const button = container.children[0] as MockVisualElement;
            expect(button.__csType).toBe('UnityEngine.UIElements.Button');
            expect(button.text).toBe('Click Me');

            // Verify event was registered
            const eventAPI = getEventAPI();
            expect(eventAPI.addEventListener).toHaveBeenCalledWith(
                button,
                'click',
                handleClick
            );
        });
    });

    describe('React state updates', () => {
        it('updates when state changes', async () => {
            const container = createMockContainer();
            let setCount: (n: number) => void;

            function Counter() {
                const [count, _setCount] = useState(0);
                setCount = _setCount;
                return <ojs-label text={`Count: ${count}`} />;
            }

            render(<Counter />, container as any);
            await flushMicrotasks();

            const label = container.children[0] as MockVisualElement;
            expect(label.text).toBe('Count: 0');

            // Update state
            setCount!(5);
            await flushMicrotasks();

            expect(label.text).toBe('Count: 5');
        });

        it('updates styles when props change', async () => {
            const container = createMockContainer();
            let setWidth: (n: number) => void;

            function ResizableBox() {
                const [width, _setWidth] = useState(100);
                setWidth = _setWidth;
                return <ojs-view style={{ width, height: 50 }} />;
            }

            render(<ResizableBox />, container as any);
            await flushMicrotasks();

            const view = container.children[0] as MockVisualElement;
            expect(getStyleValue(view.style.width)).toBe(100);

            setWidth!(200);
            await flushMicrotasks();

            expect(getStyleValue(view.style.width)).toBe(200);
        });

        it('removes style properties when they are removed from props', async () => {
            const container = createMockContainer();
            let setHasBackground: (b: boolean) => void;

            function ConditionalStyle() {
                const [hasBackground, _setHasBackground] = useState(true);
                setHasBackground = _setHasBackground;
                return (
                    <ojs-view
                        style={hasBackground ? { backgroundColor: 'red', width: 100 } : { width: 100 }}
                    />
                );
            }

            render(<ConditionalStyle />, container as any);
            await flushMicrotasks();

            const view = container.children[0] as MockVisualElement;
            expect(view.style.backgroundColor).toBeInstanceOf(MockColor);
            expect(getStyleValue(view.style.width)).toBe(100);

            setHasBackground!(false);
            await flushMicrotasks();

            expect(view.style.backgroundColor).toBeUndefined();
            expect(getStyleValue(view.style.width)).toBe(100);
        });
    });

    describe('React effects', () => {
        it('runs useEffect after render', async () => {
            const container = createMockContainer();
            const effectFn = vi.fn();

            function EffectComponent() {
                useEffect(() => {
                    effectFn();
                }, []);
                return <ojs-view />;
            }

            render(<EffectComponent />, container as any);
            await flushMicrotasks();

            expect(effectFn).toHaveBeenCalled();
        });

        it('runs cleanup on unmount', async () => {
            const container = createMockContainer();
            const cleanupFn = vi.fn();

            function CleanupComponent() {
                useEffect(() => {
                    return cleanupFn;
                }, []);
                return <ojs-view />;
            }

            render(<CleanupComponent />, container as any);
            await flushMicrotasks();

            expect(cleanupFn).not.toHaveBeenCalled();

            unmount(container as any);
            await flushMicrotasks();

            expect(cleanupFn).toHaveBeenCalled();
        });

        it('fires effect cleanup synchronously on unmount (no tick needed)', async () => {
            // On hot-reload teardown the JS context is destroyed immediately after
            // unmount, so cleanups must run synchronously rather than on a later tick.
            const container = createMockContainer();
            const cleanupFn = vi.fn();

            function CleanupComponent() {
                useEffect(() => cleanupFn, []);
                return <ojs-view />;
            }

            render(<CleanupComponent />, container as any);
            await flushMicrotasks();
            expect(cleanupFn).not.toHaveBeenCalled();

            unmount(container as any);
            // No flushMicrotasks: cleanup must already have run.
            expect(cleanupFn).toHaveBeenCalledTimes(1);
            expect(getRoot(container as any)).toBeUndefined();
        });

        it('unmountAll tears down every root and fires cleanups (hot reload)', async () => {
            // unmountAll is what the runtime teardown hook (__runTeardown) invokes
            // before destroying the context on hot reload / stop.
            const containerA = createMockContainer();
            const containerB = createMockContainer();
            const cleanupA = vi.fn();
            const cleanupB = vi.fn();

            function CompA() {
                useEffect(() => cleanupA, []);
                return <ojs-view />;
            }
            function CompB() {
                useEffect(() => cleanupB, []);
                return <ojs-view />;
            }

            render(<CompA />, containerA as any);
            render(<CompB />, containerB as any);
            await flushMicrotasks();

            unmountAll();

            expect(cleanupA).toHaveBeenCalledTimes(1);
            expect(cleanupB).toHaveBeenCalledTimes(1);
            expect(getRoot(containerA as any)).toBeUndefined();
            expect(getRoot(containerB as any)).toBeUndefined();
        });
    });

    describe('conditional rendering', () => {
        it('adds and removes children based on condition', async () => {
            const container = createMockContainer();
            let setShowChild: (b: boolean) => void;

            function ConditionalChild() {
                const [showChild, _setShowChild] = useState(true);
                setShowChild = _setShowChild;
                return (
                    <ojs-view>
                        {showChild && <ojs-label text="Child" />}
                    </ojs-view>
                );
            }

            render(<ConditionalChild />, container as any);
            await flushMicrotasks();

            const view = container.children[0] as MockVisualElement;
            expect(view.childCount).toBe(1);

            setShowChild!(false);
            await flushMicrotasks();

            expect(view.childCount).toBe(0);

            setShowChild!(true);
            await flushMicrotasks();

            expect(view.childCount).toBe(1);
        });
    });

    describe('lists', () => {
        it('renders list of elements', async () => {
            const container = createMockContainer();
            const items = ['A', 'B', 'C'];

            render(
                <ojs-view>
                    {items.map((item, i) => (
                        <ojs-label key={i} text={item} />
                    ))}
                </ojs-view>,
                container as any
            );
            await flushMicrotasks();

            const view = container.children[0] as MockVisualElement;
            expect(view.childCount).toBe(3);
            expect((view.children[0] as MockVisualElement).text).toBe('A');
            expect((view.children[1] as MockVisualElement).text).toBe('B');
            expect((view.children[2] as MockVisualElement).text).toBe('C');
        });

        it('updates list when items change', async () => {
            const container = createMockContainer();
            let setItems: (items: string[]) => void;

            function List() {
                const [items, _setItems] = useState(['A', 'B']);
                setItems = _setItems;
                return (
                    <ojs-view>
                        {items.map((item) => (
                            <ojs-label key={item} text={item} />
                        ))}
                    </ojs-view>
                );
            }

            render(<List />, container as any);
            await flushMicrotasks();

            const view = container.children[0] as MockVisualElement;
            expect(view.childCount).toBe(2);

            setItems!(['A', 'B', 'C']);
            await flushMicrotasks();

            expect(view.childCount).toBe(3);
            expect((view.children[2] as MockVisualElement).text).toBe('C');
        });

        it('keeps a trailing static sibling last when a keyed list reorders', async () => {
            // Regression: a keyed array followed by a static sibling, where reordering
            // the array moves a reused child. React commits that move as
            // insertBefore(view, movedChild, staticButton); the child must land before
            // the button, not overshoot past it.
            const container = createMockContainer();
            let setOrder: (order: string[]) => void;

            function Palette() {
                const [order, _setOrder] = useState(['a', 'b']);
                setOrder = _setOrder;
                return (
                    <ojs-view>
                        {order.map((id) => (
                            <ojs-label key={id} text={id} />
                        ))}
                        <ojs-button text="ADD" />
                    </ojs-view>
                );
            }

            render(<Palette />, container as any);
            await flushMicrotasks();

            const view = container.children[0] as MockVisualElement;
            expect(view.children.map((c) => c.text)).toEqual(['a', 'b', 'ADD']);

            // Swap the two keyed children; the static ADD button must stay last.
            setOrder!(['b', 'a']);
            await flushMicrotasks();

            expect(view.children.map((c) => c.text)).toEqual(['b', 'a', 'ADD']);
        });

        it('keeps a trailing static sibling last across remove-then-add reorders', async () => {
            // Closer to the reported scenario: blocks are removed and added such that a
            // surviving block reorders relative to its old position. The trailing
            // button must remain the last child throughout.
            const container = createMockContainer();
            let setIds: (ids: string[]) => void;

            function Palette() {
                const [ids, _setIds] = useState(['x', 'y', 'z']);
                setIds = _setIds;
                return (
                    <ojs-view>
                        {ids.map((id) => (
                            <ojs-label key={id} text={id} />
                        ))}
                        <ojs-button text="ADD" />
                    </ojs-view>
                );
            }

            render(<Palette />, container as any);
            await flushMicrotasks();

            const view = container.children[0] as MockVisualElement;
            expect(view.children.map((c) => c.text)).toEqual(['x', 'y', 'z', 'ADD']);

            // Remove 'x' and reintroduce a block such that survivors reorder.
            setIds!(['z', 'y', 'w']);
            await flushMicrotasks();

            expect(view.children.map((c) => c.text)).toEqual(['z', 'y', 'w', 'ADD']);
        });
    });
});
