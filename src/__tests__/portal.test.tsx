/**
 * Tests for the <Portal> component.
 *
 * Portal renders into a shared overlay layer that OneJS keeps as the last child
 * of __root, so overlays paint on top of the app without per-call BringToFront.
 */

import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from '../renderer';
import { Portal } from '../portal';
import { View, Label, Button } from '../components';
import { MockVisualElement, createMockContainer, flushMicrotasks } from './mocks';

describe('Portal', () => {
    it('mounts children into a shared overlay layer appended last under __root', async () => {
        const root = createMockContainer();
        (globalThis as any).__root = root;

        render(<View><Portal><Label text="overlay" /></Portal></View>, root as any);
        await flushMicrotasks();

        // root children: [0] app view, [1] portal layer (added in an effect → last)
        expect(root.childCount).toBe(2);
        const layer = root.children[1] as MockVisualElement;
        expect(layer.name).toBe('onejs-portal-root');
        expect(layer.pickingMode).toBe((globalThis as any).CS.UnityEngine.UIElements.PickingMode.Ignore);

        // portal content lives inside the layer, not the app view
        expect(layer.childCount).toBe(1);
        expect(layer.children[0].__csType).toBe('UnityEngine.UIElements.Label');
        expect((root.children[0] as MockVisualElement).childCount).toBe(0);
    });

    it('shares one layer across multiple Portals', async () => {
        const root = createMockContainer();
        (globalThis as any).__root = root;

        render(
            <View>
                <Portal><Label text="a" /></Portal>
                <Portal><Button text="b" /></Portal>
            </View>,
            root as any
        );
        await flushMicrotasks();

        // app + exactly one shared layer
        expect(root.childCount).toBe(2);
        const layer = root.children[1] as MockVisualElement;
        expect(layer.childCount).toBe(2);
    });

    it('targets an explicit container without creating the shared layer', async () => {
        const root = createMockContainer();
        (globalThis as any).__root = root;
        const target = createMockContainer();

        render(<View><Portal container={target as any}><Label text="x" /></Portal></View>, root as any);
        await flushMicrotasks();

        expect(target.childCount).toBe(1);
        expect(target.children[0].__csType).toBe('UnityEngine.UIElements.Label');
        // shared layer not created: root has only the app view
        expect(root.childCount).toBe(1);
    });

    it('removes portal content when unmounted', async () => {
        const root = createMockContainer();
        (globalThis as any).__root = root;

        function App({ show }: { show: boolean }) {
            return <View>{show && <Portal><Label text="m" /></Portal>}</View>;
        }

        render(<App show={true} />, root as any);
        await flushMicrotasks();
        const layer = root.children[1] as MockVisualElement;
        expect(layer.childCount).toBe(1);

        render(<App show={false} />, root as any);
        await flushMicrotasks();
        expect(layer.childCount).toBe(0);
    });
});
