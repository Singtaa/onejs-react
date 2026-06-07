/**
 * Tests for host-config.ts - the React reconciler implementation
 *
 * Tests cover:
 * - Instance creation (createInstance)
 * - Style property application and cleanup
 * - ClassName management (add/remove/update)
 * - Event handler registration
 * - Component-specific props (text, value, label)
 * - Child management (appendChild, insertBefore, removeChild)
 */

import { describe, it, expect, vi } from "vitest";
import { hostConfig, type Instance } from "../host-config";
import { MockVisualElement, MockLength, MockColor, getEventAPI } from "./mocks";
import type { BaseProps } from "../types";

// Props type that includes component-specific properties for testing
type TestProps = BaseProps & {
    text?: string;
    value?: unknown;
    label?: string;
};

// Helper to extract value from style (handles both raw values and MockLength/MockColor)
function getStyleValue(style: unknown): unknown {
    if (style instanceof MockLength) return style.value;
    if (style instanceof MockColor) return style;
    return style;
}

// Type-safe wrapper for createInstance (accepts extra args for backward compat)
function createInstance(type: string, props: TestProps, ..._extra: unknown[]): Instance {
    return hostConfig.createInstance(type, props as BaseProps, {} as any, null as any, null);
}

// Type-safe wrapper for commitUpdate (accepts extra args for backward compat)
function commitUpdate(instance: Instance, type: string, oldProps: TestProps, newProps: TestProps, ..._extra: unknown[]): void {
    (hostConfig.commitUpdate as any)(instance, type, oldProps as BaseProps, newProps as BaseProps, null);
}

// Type-safe wrapper to get element as MockVisualElement for assertions
function getMockElement(instance: Instance): MockVisualElement {
    return instance.element as unknown as MockVisualElement;
}

// Type-safe wrappers for hostConfig methods that may be undefined
const appendChild = hostConfig.appendChild!;
const appendInitialChild = hostConfig.appendInitialChild!;
const insertBefore = hostConfig.insertBefore!;
const removeChild = hostConfig.removeChild!;
const appendChildToContainer = hostConfig.appendChildToContainer!;
const removeChildFromContainer = hostConfig.removeChildFromContainer!;
const clearContainer = hostConfig.clearContainer!;
const hideInstance = hostConfig.hideInstance!;
const unhideInstance = hostConfig.unhideInstance!;
const commitTextUpdate = hostConfig.commitTextUpdate!;
const prepareUpdate = hostConfig.prepareUpdate!;

// Type-safe wrapper for createTextInstance
function createTextInstance(text: string): Instance {
    return hostConfig.createTextInstance(text, {} as any, null as any, null as any);
}

describe('host-config', () => {
    describe('createInstance', () => {
        it('creates a VisualElement for ojs-view', () => {
            const instance = createInstance('ojs-view', {});

            expect(instance).toBeDefined();
            expect(instance.type).toBe('ojs-view');
            expect(instance.element).toBeInstanceOf(MockVisualElement);
            expect(instance.eventHandlers).toBeInstanceOf(Map);
            expect(instance.appliedStyleKeys).toBeInstanceOf(Set);
        });

        it('creates a Label for ojs-label', () => {
            const instance = createInstance('ojs-label', { text: 'Hello' });

            expect(instance.type).toBe('ojs-label');
            expect(instance.element.text).toBe('Hello');
        });

        it('creates a Button for ojs-button', () => {
            const instance = createInstance('ojs-button', { text: 'Click me' });

            expect(instance.type).toBe('ojs-button');
            expect(instance.element.text).toBe('Click me');
        });

        it('creates a TextField for ojs-textfield', () => {
            const instance = createInstance('ojs-textfield', { value: 'test' });

            expect(instance.type).toBe('ojs-textfield');
            expect(instance.element.value).toBe('test');
        });

        it('creates a Toggle for ojs-toggle', () => {
            const instance = createInstance('ojs-toggle', { value: true, label: 'Enable' });

            expect(instance.type).toBe('ojs-toggle');
            expect(instance.element.value).toBe(true);
            expect(instance.element.label).toBe('Enable');
        });

        it('throws for unknown element type', () => {
            expect(() => {
                createInstance('unknown-type', {});
            }).toThrow('Unknown element type: unknown-type');
        });

        it('forwards the focusable prop to the element', () => {
            const instance = createInstance('ojs-view', { focusable: true } as TestProps);
            expect((instance.element as unknown as { focusable: boolean }).focusable).toBe(true);
        });

        it('forwards focusable=false explicitly', () => {
            const instance = createInstance('ojs-button', { focusable: false } as TestProps);
            expect((instance.element as unknown as { focusable: boolean }).focusable).toBe(false);
        });

        it('does not set focusable when prop is omitted', () => {
            const instance = createInstance('ojs-view', {});
            expect((instance.element as unknown as { focusable?: boolean }).focusable).toBeUndefined();
        });

        it('applies disabled=true by calling SetEnabled(false)', () => {
            const instance = createInstance('ojs-button', { disabled: true } as TestProps);
            expect(getMockElement(instance).enabledSelf).toBe(false);
        });

        it('applies disabled=false by calling SetEnabled(true)', () => {
            const instance = createInstance('ojs-button', { disabled: false } as TestProps);
            expect(getMockElement(instance).enabledSelf).toBe(true);
        });

        it('leaves element enabled by default when disabled prop is omitted', () => {
            const instance = createInstance('ojs-view', {});
            expect(getMockElement(instance).enabledSelf).toBe(true);
        });
    });

    describe('style application', () => {
        it('applies style properties on creation', () => {
            const instance = createInstance(
                'ojs-view',
                { style: { width: 100, height: 50, backgroundColor: 'red' } },
                null as any,
                null,
                null
            );

            // Length properties are now wrapped in MockLength
            expect(getStyleValue(instance.element.style.width)).toBe(100);
            expect(getStyleValue(instance.element.style.height)).toBe(50);
            // Color properties are now wrapped in MockColor
            expect(instance.element.style.backgroundColor).toBeInstanceOf(MockColor);
        });

        it('tracks applied style keys', () => {
            const instance = createInstance(
                'ojs-view',
                { style: { width: 100, height: 50 } },
                null as any,
                null,
                null
            );

            expect(instance.appliedStyleKeys.has('width')).toBe(true);
            expect(instance.appliedStyleKeys.has('height')).toBe(true);
            expect(instance.appliedStyleKeys.has('backgroundColor')).toBe(false);
        });

        it('expands shorthand padding to individual properties', () => {
            const instance = createInstance(
                'ojs-view',
                { style: { padding: 10 } },
                null as any,
                null,
                null
            );

            expect(getStyleValue(instance.element.style.paddingTop)).toBe(10);
            expect(getStyleValue(instance.element.style.paddingRight)).toBe(10);
            expect(getStyleValue(instance.element.style.paddingBottom)).toBe(10);
            expect(getStyleValue(instance.element.style.paddingLeft)).toBe(10);
            expect(instance.appliedStyleKeys.has('paddingTop')).toBe(true);
        });

        it('expands shorthand margin to individual properties', () => {
            const instance = createInstance(
                'ojs-view',
                { style: { margin: 20 } },
                null as any,
                null,
                null
            );

            expect(getStyleValue(instance.element.style.marginTop)).toBe(20);
            expect(getStyleValue(instance.element.style.marginRight)).toBe(20);
            expect(getStyleValue(instance.element.style.marginBottom)).toBe(20);
            expect(getStyleValue(instance.element.style.marginLeft)).toBe(20);
        });

        it('expands shorthand borderRadius', () => {
            const instance = createInstance(
                'ojs-view',
                { style: { borderRadius: 8 } },
                null as any,
                null,
                null
            );

            expect(getStyleValue(instance.element.style.borderTopLeftRadius)).toBe(8);
            expect(getStyleValue(instance.element.style.borderTopRightRadius)).toBe(8);
            expect(getStyleValue(instance.element.style.borderBottomRightRadius)).toBe(8);
            expect(getStyleValue(instance.element.style.borderBottomLeftRadius)).toBe(8);
        });
    });

    describe('style updates (commitUpdate)', () => {
        it('updates style properties', () => {
            const instance = createInstance(
                'ojs-view',
                { style: { width: 100 } },
                null as any,
                null,
                null
            );

            // Simulate React calling commitUpdate
            commitUpdate(
                instance,
                'ojs-view',
                { style: { width: 100 } },
                { style: { width: 200 } },
                null as any
            );

            expect(getStyleValue(instance.element.style.width)).toBe(200);
        });

        it('clears removed style properties', () => {
            const instance = createInstance(
                'ojs-view',
                { style: { width: 100, height: 50, backgroundColor: 'red' } },
                null as any,
                null,
                null
            );

            // Update: remove width and backgroundColor, keep height
            commitUpdate(
                instance,
                'ojs-view',
                { style: { width: 100, height: 50, backgroundColor: 'red' } },
                { style: { height: 75 } },
                null as any
            );

            expect(instance.element.style.width).toBeUndefined();
            expect(instance.element.style.backgroundColor).toBeUndefined();
            expect(getStyleValue(instance.element.style.height)).toBe(75);
        });

        it('clears expanded shorthand properties when shorthand is removed', () => {
            const instance = createInstance(
                'ojs-view',
                { style: { padding: 10, width: 100 } },
                null as any,
                null,
                null
            );

            // Remove padding shorthand
            commitUpdate(
                instance,
                'ojs-view',
                { style: { padding: 10, width: 100 } },
                { style: { width: 100 } },
                null as any
            );

            expect(instance.element.style.paddingTop).toBeUndefined();
            expect(instance.element.style.paddingRight).toBeUndefined();
            expect(instance.element.style.paddingBottom).toBeUndefined();
            expect(instance.element.style.paddingLeft).toBeUndefined();
            expect(getStyleValue(instance.element.style.width)).toBe(100);
        });

        it('clears all styles when style prop becomes undefined', () => {
            const instance = createInstance(
                'ojs-view',
                { style: { width: 100, height: 50 } },
                null as any,
                null,
                null
            );

            commitUpdate(
                instance,
                'ojs-view',
                { style: { width: 100, height: 50 } },
                {},
                null as any
            );

            expect(instance.element.style.width).toBeUndefined();
            expect(instance.element.style.height).toBeUndefined();
        });

        it('updates appliedStyleKeys after style change', () => {
            const instance = createInstance(
                'ojs-view',
                { style: { width: 100 } },
                null as any,
                null,
                null
            );

            expect(instance.appliedStyleKeys.has('width')).toBe(true);
            expect(instance.appliedStyleKeys.has('height')).toBe(false);

            commitUpdate(
                instance,
                'ojs-view',
                { style: { width: 100 } },
                { style: { height: 50 } },
                null as any
            );

            expect(instance.appliedStyleKeys.has('width')).toBe(false);
            expect(instance.appliedStyleKeys.has('height')).toBe(true);
        });

        it('updates focusable when the prop changes', () => {
            const instance = createInstance('ojs-view', { focusable: false } as TestProps);
            expect((instance.element as unknown as { focusable: boolean }).focusable).toBe(false);

            commitUpdate(instance, 'ojs-view', { focusable: false } as TestProps, { focusable: true } as TestProps);
            expect((instance.element as unknown as { focusable: boolean }).focusable).toBe(true);
        });

        it('does not clobber focusable when the prop becomes undefined', () => {
            // Removing the prop should leave the element's current state alone,
            // so element-specific defaults (Button etc.) remain intact.
            const instance = createInstance('ojs-button', { focusable: true } as TestProps);
            expect((instance.element as unknown as { focusable: boolean }).focusable).toBe(true);

            commitUpdate(instance, 'ojs-button', { focusable: true } as TestProps, {} as TestProps);
            expect((instance.element as unknown as { focusable: boolean }).focusable).toBe(true);
        });

        it('updates disabled when the prop changes', () => {
            const instance = createInstance('ojs-button', { disabled: false } as TestProps);
            expect(getMockElement(instance).enabledSelf).toBe(true);

            commitUpdate(instance, 'ojs-button', { disabled: false } as TestProps, { disabled: true } as TestProps);
            expect(getMockElement(instance).enabledSelf).toBe(false);

            commitUpdate(instance, 'ojs-button', { disabled: true } as TestProps, { disabled: false } as TestProps);
            expect(getMockElement(instance).enabledSelf).toBe(true);
        });

        it('restores disabled to enabled when prop is removed', () => {
            // Unlike focusable, every VisualElement starts enabled by default,
            // so removing `disabled={true}` must call SetEnabled(true) to
            // restore the element rather than leaving it stuck disabled.
            const instance = createInstance('ojs-button', { disabled: true } as TestProps);
            expect(getMockElement(instance).enabledSelf).toBe(false);

            commitUpdate(instance, 'ojs-button', { disabled: true } as TestProps, {} as TestProps);
            expect(getMockElement(instance).enabledSelf).toBe(true);
        });
    });

    describe('className management', () => {
        it('applies className on creation', () => {
            const instance = createInstance(
                'ojs-view',
                { className: 'foo bar' },
                null as any,
                null,
                null
            );

            const el = getMockElement(instance);
            expect(el.hasClass('foo')).toBe(true);
            expect(el.hasClass('bar')).toBe(true);
        });

        it('handles multiple spaces in className', () => {
            const instance = createInstance(
                'ojs-view',
                { className: 'foo   bar  baz' },
                null as any,
                null,
                null
            );

            const el = getMockElement(instance);
            expect(el.hasClass('foo')).toBe(true);
            expect(el.hasClass('bar')).toBe(true);
            expect(el.hasClass('baz')).toBe(true);
        });

        it('selectively adds new classes on update', () => {
            const instance = createInstance(
                'ojs-view',
                { className: 'foo bar' },
                null as any,
                null,
                null
            );

            commitUpdate(
                instance,
                'ojs-view',
                { className: 'foo bar' },
                { className: 'foo bar baz' },
                null as any
            );

            const el = getMockElement(instance);
            expect(el.hasClass('foo')).toBe(true);
            expect(el.hasClass('bar')).toBe(true);
            expect(el.hasClass('baz')).toBe(true);
        });

        it('selectively removes old classes on update', () => {
            const instance = createInstance(
                'ojs-view',
                { className: 'foo bar baz' },
                null as any,
                null,
                null
            );

            commitUpdate(
                instance,
                'ojs-view',
                { className: 'foo bar baz' },
                { className: 'foo' },
                null as any
            );

            const el = getMockElement(instance);
            expect(el.hasClass('foo')).toBe(true);
            expect(el.hasClass('bar')).toBe(false);
            expect(el.hasClass('baz')).toBe(false);
        });

        it('handles complete className replacement', () => {
            const instance = createInstance(
                'ojs-view',
                { className: 'old-class' },
                null as any,
                null,
                null
            );

            commitUpdate(
                instance,
                'ojs-view',
                { className: 'old-class' },
                { className: 'new-class' },
                null as any
            );

            const el = getMockElement(instance);
            expect(el.hasClass('old-class')).toBe(false);
            expect(el.hasClass('new-class')).toBe(true);
        });

        it('removes all classes when className becomes undefined', () => {
            const instance = createInstance(
                'ojs-view',
                { className: 'foo bar' },
                null as any,
                null,
                null
            );

            commitUpdate(
                instance,
                'ojs-view',
                { className: 'foo bar' },
                {},
                null as any
            );

            const el = getMockElement(instance);
            expect(el.hasClass('foo')).toBe(false);
            expect(el.hasClass('bar')).toBe(false);
        });
    });

    describe('event handlers', () => {
        it('registers onClick handler on creation', () => {
            const handler = vi.fn();
            const instance = createInstance(
                'ojs-button',
                { onClick: handler },
                null as any,
                null,
                null
            );

            const eventAPI = getEventAPI();
            expect(eventAPI.addEventListener).toHaveBeenCalledWith(
                instance.element,
                'click',
                handler
            );
            expect(instance.eventHandlers.get('click')).toBe(handler);
        });

        it('registers multiple event handlers', () => {
            const onClick = vi.fn();
            const onPointerDown = vi.fn();
            const instance = createInstance(
                'ojs-view',
                { onClick, onPointerDown },
                null as any,
                null,
                null
            );

            const eventAPI = getEventAPI();
            expect(eventAPI.addEventListener).toHaveBeenCalledWith(
                instance.element,
                'click',
                onClick
            );
            expect(eventAPI.addEventListener).toHaveBeenCalledWith(
                instance.element,
                'pointerdown',
                onPointerDown
            );
        });

        it('removes event handler on update', () => {
            const handler = vi.fn();
            const instance = createInstance(
                'ojs-button',
                { onClick: handler },
                null as any,
                null,
                null
            );

            // Clear mock to track only update calls
            const eventAPI = getEventAPI();
            eventAPI.addEventListener.mockClear();
            eventAPI.removeEventListener.mockClear();

            commitUpdate(
                instance,
                'ojs-button',
                { onClick: handler },
                {},
                null as any
            );

            expect(eventAPI.removeEventListener).toHaveBeenCalledWith(
                instance.element,
                'click',
                handler
            );
            expect(instance.eventHandlers.has('click')).toBe(false);
        });

        it('replaces event handler on update', () => {
            const oldHandler = vi.fn();
            const newHandler = vi.fn();
            const instance = createInstance(
                'ojs-button',
                { onClick: oldHandler },
                null as any,
                null,
                null
            );

            const eventAPI = getEventAPI();
            eventAPI.addEventListener.mockClear();
            eventAPI.removeEventListener.mockClear();

            commitUpdate(
                instance,
                'ojs-button',
                { onClick: oldHandler },
                { onClick: newHandler },
                null as any
            );

            expect(eventAPI.removeEventListener).toHaveBeenCalledWith(
                instance.element,
                'click',
                oldHandler
            );
            expect(eventAPI.addEventListener).toHaveBeenCalledWith(
                instance.element,
                'click',
                newHandler
            );
            expect(instance.eventHandlers.get('click')).toBe(newHandler);
        });
    });

    describe('child management', () => {
        it('appendChild adds child to parent', () => {
            const parent = createInstance('ojs-view', {});
            const child = createInstance('ojs-label', { text: 'Hello' });

            appendChild(parent, child);

            const parentEl = getMockElement(parent);
            expect(parentEl.children).toContain(child.element);
        });

        it('appendInitialChild adds child during initial render', () => {
            const parent = createInstance('ojs-view', {});
            const child = createInstance('ojs-label', {});

            appendInitialChild(parent, child);

            const parentEl = getMockElement(parent);
            expect(parentEl.children).toContain(child.element);
        });

        it('insertBefore inserts child at correct position', () => {
            const parent = createInstance('ojs-view', {});
            const child1 = createInstance('ojs-label', { text: '1' });
            const child2 = createInstance('ojs-label', { text: '2' });
            const child3 = createInstance('ojs-label', { text: '3' });

            appendChild(parent, child1);
            appendChild(parent, child3);
            insertBefore(parent, child2, child3);

            const parentEl = getMockElement(parent);
            expect(parentEl.children[0]).toBe(child1.element);
            expect(parentEl.children[1]).toBe(child2.element);
            expect(parentEl.children[2]).toBe(child3.element);
        });

        it('insertBefore moving an existing child before a trailing sibling does not overshoot', () => {
            // Reproduces the keyed-array-next-to-static-sibling reorder bug.
            // React reorders [a, b, static] -> [b, a, static] by giving the reused
            // child `a` a Placement and committing insertBefore(parent, a, static).
            // Unity's Insert(i, child) removes the child *before* placing it at i, so a
            // naive IndexOf(static) + Insert overshoots and lands `a` past `static`.
            const parent = createInstance('ojs-view', {});
            const a = createInstance('ojs-label', { text: 'a' });
            const b = createInstance('ojs-label', { text: 'b' });
            const staticSibling = createInstance('ojs-button', { text: 'STATIC' });

            appendChild(parent, a);
            appendChild(parent, b);
            appendChild(parent, staticSibling);

            // React moves `a` to sit right before the (unchanged) static sibling.
            insertBefore(parent, a, staticSibling);

            const parentEl = getMockElement(parent);
            expect(parentEl.children.map((c) => c.text)).toEqual(['b', 'a', 'STATIC']);
        });

        it('insertBefore moving an existing child after another keeps order', () => {
            // The mirror case: child currently sits *after* beforeChild. Removal does
            // not shift beforeChild, so the index must not be decremented.
            const parent = createInstance('ojs-view', {});
            const a = createInstance('ojs-label', { text: 'a' });
            const b = createInstance('ojs-label', { text: 'b' });
            const c = createInstance('ojs-label', { text: 'c' });

            appendChild(parent, a);
            appendChild(parent, b);
            appendChild(parent, c);

            // Move `c` to sit right before `b`: [a, b, c] -> [a, c, b].
            insertBefore(parent, c, b);

            const parentEl = getMockElement(parent);
            expect(parentEl.children.map((el) => el.text)).toEqual(['a', 'c', 'b']);
        });

        it('removeChild removes child from parent', () => {
            const parent = createInstance('ojs-view', {});
            const child = createInstance('ojs-label', {});

            appendChild(parent, child);
            removeChild(parent, child);

            const parentEl = getMockElement(parent);
            expect(parentEl.children).not.toContain(child.element);
        });

        it('removeChild cleans up event listeners', () => {
            const handler = vi.fn();
            const parent = createInstance('ojs-view', {});
            const child = createInstance('ojs-button', { onClick: handler });

            appendChild(parent, child);

            const eventAPI = getEventAPI();
            eventAPI.removeAllEventListeners.mockClear();

            removeChild(parent, child);

            expect(eventAPI.removeAllEventListeners).toHaveBeenCalledWith(child.element);
        });
    });

    describe('container operations', () => {
        it('appendChildToContainer adds child to container', () => {
            const container = new MockVisualElement('Container');
            const child = createInstance('ojs-view', {});

            appendChildToContainer(container as any, child);

            expect(container.children).toContain(child.element);
        });

        it('removeChildFromContainer removes child and cleans up events', () => {
            const container = new MockVisualElement('Container');
            const handler = vi.fn();
            const child = createInstance('ojs-button', { onClick: handler });

            appendChildToContainer(container as any, child);

            const eventAPI = getEventAPI();
            eventAPI.removeAllEventListeners.mockClear();

            removeChildFromContainer(container as any, child);

            expect(container.children).not.toContain(child.element);
            expect(eventAPI.removeAllEventListeners).toHaveBeenCalledWith(child.element);
        });

        it('clearContainer removes all children', () => {
            const container = new MockVisualElement('Container');
            const child1 = createInstance('ojs-view', {});
            const child2 = createInstance('ojs-view', {});

            appendChildToContainer(container as any, child1);
            appendChildToContainer(container as any, child2);

            expect(container.childCount).toBe(2);

            clearContainer(container as any);

            expect(container.childCount).toBe(0);
        });
    });

    describe('text instances', () => {
        it('createTextInstance creates a TextElement with text', () => {
            const textInstance = createTextInstance('Hello World');

            expect(textInstance.type).toBe('text');
            expect(textInstance.element.__csType).toBe('UnityEngine.UIElements.TextElement');
            expect(textInstance.element.text).toBe('Hello World');
            expect(textInstance.appliedStyleKeys).toBeInstanceOf(Set);
        });

        it('commitTextUpdate updates the text', () => {
            const textInstance = createTextInstance('Old text');

            commitTextUpdate(textInstance, 'Old text', 'New text');

            expect(textInstance.element.text).toBe('New text');
        });
    });

    describe('visibility', () => {
        it('hideInstance sets display to DisplayStyle.None', () => {
            const instance = createInstance('ojs-view', {});

            hideInstance(instance);

            const DisplayStyle = (globalThis as any).CS.UnityEngine.UIElements.DisplayStyle;
            expect(instance.element.style.display).toBe(DisplayStyle.None);
        });

        it('unhideInstance sets display to DisplayStyle.Flex', () => {
            const instance = createInstance('ojs-view', {});
            const DisplayStyle = (globalThis as any).CS.UnityEngine.UIElements.DisplayStyle;
            instance.element.style.display = DisplayStyle.None;

            unhideInstance(instance, {});

            expect(instance.element.style.display).toBe(DisplayStyle.Flex);
        });
    });

    describe('prepareUpdate', () => {
        it('returns true when props differ', () => {
            const instance = createInstance('ojs-view', { style: { width: 100 } });

            const result = prepareUpdate(
                instance,
                'ojs-view',
                { style: { width: 100 } } as BaseProps,
                { style: { width: 200 } } as BaseProps,
                null as any,
                null as any
            );

            expect(result).toBe(true);
        });

        it('returns null when props are same reference', () => {
            const props = { style: { width: 100 } };
            const instance = createInstance('ojs-view', props);

            const result = prepareUpdate(
                instance,
                'ojs-view',
                props as BaseProps,
                props as BaseProps,
                null as any,
                null as any
            );

            expect(result).toBeNull();
        });
    });
});
