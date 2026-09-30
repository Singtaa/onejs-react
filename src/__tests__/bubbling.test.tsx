/**
 * The parent links the bootstrap's JS bubbling walks.
 *
 * C# dispatches an event once, at its target, and the bootstrap bubbles it by
 * following __eventAPI.setParent links. A top-level element or the portal
 * layer left unlinked ends the walk before __root, so a listener there (every
 * onejs-ui dismissal and focus-visible listener) never hears a bubbled event.
 */

import { describe, it, expect } from 'vitest';
import React, { useState } from 'react';
import { act } from 'react';
import { render } from '../renderer';
import { Portal } from '../portal';
import { View, Button } from '../components';
import { MockVisualElement, createMockContainer, flushMicrotasks, getEventAPI } from './mocks';

const handle = (el: unknown) => (el as { __csHandle: number }).__csHandle;

describe('event bubbling links', () => {
    it("links the app's top element to the render container", async () => {
        const root = createMockContainer();
        (globalThis as any).__root = root;

        render(<View><Button text="x" /></View>, root as any);
        await flushMicrotasks();

        const app = root.children[0] as MockVisualElement;
        expect(getEventAPI().setParent).toHaveBeenCalledWith(handle(app), handle(root));
    });

    it('links a top element inserted before a sibling', async () => {
        const root = createMockContainer();
        (globalThis as any).__root = root;
        let show: (v: boolean) => void = () => {};
        function App() {
            const [on, setOn] = useState(false);
            show = setOn;
            return <>{on && <View key="first" />}<View key="second" /></>;
        }

        render(<App />, root as any);
        await flushMicrotasks();
        await act(async () => { show(true); });
        await flushMicrotasks();

        const first = root.children[0] as MockVisualElement;
        expect(getEventAPI().setParent).toHaveBeenCalledWith(handle(first), handle(root));
    });

    it('links the portal layer to __root, so portaled content bubbles to it', async () => {
        const root = createMockContainer();
        (globalThis as any).__root = root;

        render(<View><Portal><Button text="in a dialog" /></Portal></View>, root as any);
        await flushMicrotasks();

        const layer = root.children[1] as MockVisualElement;
        expect(layer.name).toBe('onejs-portal-root');
        expect(getEventAPI().setParent).toHaveBeenCalledWith(handle(layer), handle(root));
    });
});
