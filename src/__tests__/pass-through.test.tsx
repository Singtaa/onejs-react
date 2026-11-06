import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from '../renderer';
import { View } from '../components';
import { PASS_THROUGH_CLASS } from '../class-names';
import { MockVisualElement, createMockContainer, flushMicrotasks } from './mocks';

/**
 * A View's `passThrough`: its presses are the game's, which ojplay's overUI
 * reads from the class it adds, so the class follows the prop through every
 * className change and goes with it.
 */
describe('passThrough', () => {
    async function view(node: React.ReactElement, container = createMockContainer()) {
        render(node, container as any);
        await flushMicrotasks();
        return { container, el: container.children[0] as MockVisualElement };
    }

    it('adds the class, beside a className, and is not forwarded as a property', async () => {
        const { el } = await view(<View passThrough className="hud" />);
        expect(PASS_THROUGH_CLASS).toBe('oj-world');
        expect(el.hasClass(PASS_THROUGH_CLASS)).toBe(true);
        expect(el.hasClass('hud')).toBe(true);
        expect((el as any).passThrough).toBeUndefined();
    });

    it('adds nothing to a View without it', async () => {
        const { el } = await view(<View className="hud" />);
        expect(el.hasClass(PASS_THROUGH_CLASS)).toBe(false);
    });

    it('keeps the class through a className change, and takes it away with the prop', async () => {
        const { container, el } = await view(<View passThrough className="a" />);
        await view(<View passThrough className="b" />, container);
        expect(el.hasClass(PASS_THROUGH_CLASS)).toBe(true);
        expect(el.hasClass('a')).toBe(false);
        expect(el.hasClass('b')).toBe(true);
        await view(<View className="b" />, container);
        expect(el.hasClass(PASS_THROUGH_CLASS)).toBe(false);
        expect(el.hasClass('b')).toBe(true);
        await view(<View passThrough className="b" />, container);
        expect(el.hasClass(PASS_THROUGH_CLASS)).toBe(true);
    });

    it('is the same marker as a className that names the class itself', async () => {
        const { container, el } = await view(<View passThrough className="oj-world" />);
        expect(el.hasClass(PASS_THROUGH_CLASS)).toBe(true);
        await view(<View className="oj-world" />, container);
        expect(el.hasClass(PASS_THROUGH_CLASS)).toBe(true);
    });
});
