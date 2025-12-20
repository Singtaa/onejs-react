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

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { hostConfig, type Instance } from '../host-config';
import { MockVisualElement, getEventAPI, flushMicrotasks, getCreatedElements } from './mocks';

describe('host-config', () => {
    describe('createInstance', () => {
        it('creates a VisualElement for ojs-view', () => {
            const instance = hostConfig.createInstance('ojs-view', {}, null as any, null, null);

            expect(instance).toBeDefined();
            expect(instance.type).toBe('ojs-view');
            expect(instance.element).toBeInstanceOf(MockVisualElement);
            expect(instance.eventHandlers).toBeInstanceOf(Map);
            expect(instance.appliedStyleKeys).toBeInstanceOf(Set);
        });

        it('creates a Label for ojs-label', () => {
            const instance = hostConfig.createInstance('ojs-label', { text: 'Hello' }, null as any, null, null);

            expect(instance.type).toBe('ojs-label');
            expect(instance.element.text).toBe('Hello');
        });

        it('creates a Button for ojs-button', () => {
            const instance = hostConfig.createInstance('ojs-button', { text: 'Click me' }, null as any, null, null);

            expect(instance.type).toBe('ojs-button');
            expect(instance.element.text).toBe('Click me');
        });

        it('creates a TextField for ojs-textfield', () => {
            const instance = hostConfig.createInstance('ojs-textfield', { value: 'test' }, null as any, null, null);

            expect(instance.type).toBe('ojs-textfield');
            expect(instance.element.value).toBe('test');
        });

        it('creates a Toggle for ojs-toggle', () => {
            const instance = hostConfig.createInstance('ojs-toggle', { value: true, label: 'Enable' }, null as any, null, null);

            expect(instance.type).toBe('ojs-toggle');
            expect(instance.element.value).toBe(true);
            expect(instance.element.label).toBe('Enable');
        });

        it('throws for unknown element type', () => {
            expect(() => {
                hostConfig.createInstance('unknown-type', {}, null as any, null, null);
            }).toThrow('Unknown element type: unknown-type');
        });
    });

    describe('style application', () => {
        it('applies style properties on creation', () => {
            const instance = hostConfig.createInstance(
                'ojs-view',
                { style: { width: 100, height: 50, backgroundColor: 'red' } },
                null as any,
                null,
                null
            );

            expect(instance.element.style.width).toBe(100);
            expect(instance.element.style.height).toBe(50);
            expect(instance.element.style.backgroundColor).toBe('red');
        });

        it('tracks applied style keys', () => {
            const instance = hostConfig.createInstance(
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
            const instance = hostConfig.createInstance(
                'ojs-view',
                { style: { padding: 10 } },
                null as any,
                null,
                null
            );

            expect(instance.element.style.paddingTop).toBe(10);
            expect(instance.element.style.paddingRight).toBe(10);
            expect(instance.element.style.paddingBottom).toBe(10);
            expect(instance.element.style.paddingLeft).toBe(10);
            expect(instance.appliedStyleKeys.has('paddingTop')).toBe(true);
        });

        it('expands shorthand margin to individual properties', () => {
            const instance = hostConfig.createInstance(
                'ojs-view',
                { style: { margin: 20 } },
                null as any,
                null,
                null
            );

            expect(instance.element.style.marginTop).toBe(20);
            expect(instance.element.style.marginRight).toBe(20);
            expect(instance.element.style.marginBottom).toBe(20);
            expect(instance.element.style.marginLeft).toBe(20);
        });

        it('expands shorthand borderRadius', () => {
            const instance = hostConfig.createInstance(
                'ojs-view',
                { style: { borderRadius: 8 } },
                null as any,
                null,
                null
            );

            expect(instance.element.style.borderTopLeftRadius).toBe(8);
            expect(instance.element.style.borderTopRightRadius).toBe(8);
            expect(instance.element.style.borderBottomRightRadius).toBe(8);
            expect(instance.element.style.borderBottomLeftRadius).toBe(8);
        });
    });

    describe('style updates (commitUpdate)', () => {
        it('updates style properties', () => {
            const instance = hostConfig.createInstance(
                'ojs-view',
                { style: { width: 100 } },
                null as any,
                null,
                null
            );

            // Simulate React calling commitUpdate
            hostConfig.commitUpdate(
                instance,
                'ojs-view',
                { style: { width: 100 } },
                { style: { width: 200 } },
                null as any
            );

            expect(instance.element.style.width).toBe(200);
        });

        it('clears removed style properties', () => {
            const instance = hostConfig.createInstance(
                'ojs-view',
                { style: { width: 100, height: 50, backgroundColor: 'red' } },
                null as any,
                null,
                null
            );

            // Update: remove width and backgroundColor, keep height
            hostConfig.commitUpdate(
                instance,
                'ojs-view',
                { style: { width: 100, height: 50, backgroundColor: 'red' } },
                { style: { height: 75 } },
                null as any
            );

            expect(instance.element.style.width).toBeUndefined();
            expect(instance.element.style.backgroundColor).toBeUndefined();
            expect(instance.element.style.height).toBe(75);
        });

        it('clears expanded shorthand properties when shorthand is removed', () => {
            const instance = hostConfig.createInstance(
                'ojs-view',
                { style: { padding: 10, width: 100 } },
                null as any,
                null,
                null
            );

            // Remove padding shorthand
            hostConfig.commitUpdate(
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
            expect(instance.element.style.width).toBe(100);
        });

        it('clears all styles when style prop becomes undefined', () => {
            const instance = hostConfig.createInstance(
                'ojs-view',
                { style: { width: 100, height: 50 } },
                null as any,
                null,
                null
            );

            hostConfig.commitUpdate(
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
            const instance = hostConfig.createInstance(
                'ojs-view',
                { style: { width: 100 } },
                null as any,
                null,
                null
            );

            expect(instance.appliedStyleKeys.has('width')).toBe(true);
            expect(instance.appliedStyleKeys.has('height')).toBe(false);

            hostConfig.commitUpdate(
                instance,
                'ojs-view',
                { style: { width: 100 } },
                { style: { height: 50 } },
                null as any
            );

            expect(instance.appliedStyleKeys.has('width')).toBe(false);
            expect(instance.appliedStyleKeys.has('height')).toBe(true);
        });
    });

    describe('className management', () => {
        it('applies className on creation', () => {
            const instance = hostConfig.createInstance(
                'ojs-view',
                { className: 'foo bar' },
                null as any,
                null,
                null
            );

            const el = instance.element as MockVisualElement;
            expect(el.hasClass('foo')).toBe(true);
            expect(el.hasClass('bar')).toBe(true);
        });

        it('handles multiple spaces in className', () => {
            const instance = hostConfig.createInstance(
                'ojs-view',
                { className: 'foo   bar  baz' },
                null as any,
                null,
                null
            );

            const el = instance.element as MockVisualElement;
            expect(el.hasClass('foo')).toBe(true);
            expect(el.hasClass('bar')).toBe(true);
            expect(el.hasClass('baz')).toBe(true);
        });

        it('selectively adds new classes on update', () => {
            const instance = hostConfig.createInstance(
                'ojs-view',
                { className: 'foo bar' },
                null as any,
                null,
                null
            );

            hostConfig.commitUpdate(
                instance,
                'ojs-view',
                { className: 'foo bar' },
                { className: 'foo bar baz' },
                null as any
            );

            const el = instance.element as MockVisualElement;
            expect(el.hasClass('foo')).toBe(true);
            expect(el.hasClass('bar')).toBe(true);
            expect(el.hasClass('baz')).toBe(true);
        });

        it('selectively removes old classes on update', () => {
            const instance = hostConfig.createInstance(
                'ojs-view',
                { className: 'foo bar baz' },
                null as any,
                null,
                null
            );

            hostConfig.commitUpdate(
                instance,
                'ojs-view',
                { className: 'foo bar baz' },
                { className: 'foo' },
                null as any
            );

            const el = instance.element as MockVisualElement;
            expect(el.hasClass('foo')).toBe(true);
            expect(el.hasClass('bar')).toBe(false);
            expect(el.hasClass('baz')).toBe(false);
        });

        it('handles complete className replacement', () => {
            const instance = hostConfig.createInstance(
                'ojs-view',
                { className: 'old-class' },
                null as any,
                null,
                null
            );

            hostConfig.commitUpdate(
                instance,
                'ojs-view',
                { className: 'old-class' },
                { className: 'new-class' },
                null as any
            );

            const el = instance.element as MockVisualElement;
            expect(el.hasClass('old-class')).toBe(false);
            expect(el.hasClass('new-class')).toBe(true);
        });

        it('removes all classes when className becomes undefined', () => {
            const instance = hostConfig.createInstance(
                'ojs-view',
                { className: 'foo bar' },
                null as any,
                null,
                null
            );

            hostConfig.commitUpdate(
                instance,
                'ojs-view',
                { className: 'foo bar' },
                {},
                null as any
            );

            const el = instance.element as MockVisualElement;
            expect(el.hasClass('foo')).toBe(false);
            expect(el.hasClass('bar')).toBe(false);
        });
    });

    describe('event handlers', () => {
        it('registers onClick handler on creation', () => {
            const handler = vi.fn();
            const instance = hostConfig.createInstance(
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
            const instance = hostConfig.createInstance(
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
            const instance = hostConfig.createInstance(
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

            hostConfig.commitUpdate(
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
            const instance = hostConfig.createInstance(
                'ojs-button',
                { onClick: oldHandler },
                null as any,
                null,
                null
            );

            const eventAPI = getEventAPI();
            eventAPI.addEventListener.mockClear();
            eventAPI.removeEventListener.mockClear();

            hostConfig.commitUpdate(
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
            const parent = hostConfig.createInstance('ojs-view', {}, null as any, null, null);
            const child = hostConfig.createInstance('ojs-label', { text: 'Hello' }, null as any, null, null);

            hostConfig.appendChild(parent, child);

            const parentEl = parent.element as MockVisualElement;
            expect(parentEl.children).toContain(child.element);
        });

        it('appendInitialChild adds child during initial render', () => {
            const parent = hostConfig.createInstance('ojs-view', {}, null as any, null, null);
            const child = hostConfig.createInstance('ojs-label', {}, null as any, null, null);

            hostConfig.appendInitialChild(parent, child);

            const parentEl = parent.element as MockVisualElement;
            expect(parentEl.children).toContain(child.element);
        });

        it('insertBefore inserts child at correct position', () => {
            const parent = hostConfig.createInstance('ojs-view', {}, null as any, null, null);
            const child1 = hostConfig.createInstance('ojs-label', { text: '1' }, null as any, null, null);
            const child2 = hostConfig.createInstance('ojs-label', { text: '2' }, null as any, null, null);
            const child3 = hostConfig.createInstance('ojs-label', { text: '3' }, null as any, null, null);

            hostConfig.appendChild(parent, child1);
            hostConfig.appendChild(parent, child3);
            hostConfig.insertBefore(parent, child2, child3);

            const parentEl = parent.element as MockVisualElement;
            expect(parentEl.children[0]).toBe(child1.element);
            expect(parentEl.children[1]).toBe(child2.element);
            expect(parentEl.children[2]).toBe(child3.element);
        });

        it('removeChild removes child from parent', () => {
            const parent = hostConfig.createInstance('ojs-view', {}, null as any, null, null);
            const child = hostConfig.createInstance('ojs-label', {}, null as any, null, null);

            hostConfig.appendChild(parent, child);
            hostConfig.removeChild(parent, child);

            const parentEl = parent.element as MockVisualElement;
            expect(parentEl.children).not.toContain(child.element);
        });

        it('removeChild cleans up event listeners', () => {
            const handler = vi.fn();
            const parent = hostConfig.createInstance('ojs-view', {}, null as any, null, null);
            const child = hostConfig.createInstance('ojs-button', { onClick: handler }, null as any, null, null);

            hostConfig.appendChild(parent, child);

            const eventAPI = getEventAPI();
            eventAPI.removeAllEventListeners.mockClear();

            hostConfig.removeChild(parent, child);

            expect(eventAPI.removeAllEventListeners).toHaveBeenCalledWith(child.element);
        });
    });

    describe('container operations', () => {
        it('appendChildToContainer adds child to container', () => {
            const container = new MockVisualElement('Container');
            const child = hostConfig.createInstance('ojs-view', {}, null as any, null, null);

            hostConfig.appendChildToContainer(container as any, child);

            expect(container.children).toContain(child.element);
        });

        it('removeChildFromContainer removes child and cleans up events', () => {
            const container = new MockVisualElement('Container');
            const handler = vi.fn();
            const child = hostConfig.createInstance('ojs-button', { onClick: handler }, null as any, null, null);

            hostConfig.appendChildToContainer(container as any, child);

            const eventAPI = getEventAPI();
            eventAPI.removeAllEventListeners.mockClear();

            hostConfig.removeChildFromContainer(container as any, child);

            expect(container.children).not.toContain(child.element);
            expect(eventAPI.removeAllEventListeners).toHaveBeenCalledWith(child.element);
        });

        it('clearContainer removes all children', () => {
            const container = new MockVisualElement('Container');
            const child1 = hostConfig.createInstance('ojs-view', {}, null as any, null, null);
            const child2 = hostConfig.createInstance('ojs-view', {}, null as any, null, null);

            hostConfig.appendChildToContainer(container as any, child1);
            hostConfig.appendChildToContainer(container as any, child2);

            expect(container.childCount).toBe(2);

            hostConfig.clearContainer(container as any);

            expect(container.childCount).toBe(0);
        });
    });

    describe('text instances', () => {
        it('createTextInstance creates a Label with text', () => {
            const textInstance = hostConfig.createTextInstance('Hello World', null as any, null, null);

            expect(textInstance.type).toBe('text');
            expect(textInstance.element.text).toBe('Hello World');
            expect(textInstance.appliedStyleKeys).toBeInstanceOf(Set);
        });

        it('commitTextUpdate updates the text', () => {
            const textInstance = hostConfig.createTextInstance('Old text', null as any, null, null);

            hostConfig.commitTextUpdate(textInstance, 'Old text', 'New text');

            expect(textInstance.element.text).toBe('New text');
        });
    });

    describe('visibility', () => {
        it('hideInstance sets display to none', () => {
            const instance = hostConfig.createInstance('ojs-view', {}, null as any, null, null);

            hostConfig.hideInstance(instance);

            expect(instance.element.style.display).toBe('none');
        });

        it('unhideInstance clears display', () => {
            const instance = hostConfig.createInstance('ojs-view', {}, null as any, null, null);
            instance.element.style.display = 'none';

            hostConfig.unhideInstance(instance, {});

            expect(instance.element.style.display).toBe('');
        });
    });

    describe('prepareUpdate', () => {
        it('returns true when props differ', () => {
            const instance = hostConfig.createInstance('ojs-view', { style: { width: 100 } }, null as any, null, null);

            const result = hostConfig.prepareUpdate(
                instance,
                'ojs-view',
                { style: { width: 100 } },
                { style: { width: 200 } },
                null as any,
                null
            );

            expect(result).toBe(true);
        });

        it('returns null when props are same reference', () => {
            const props = { style: { width: 100 } };
            const instance = hostConfig.createInstance('ojs-view', props, null as any, null, null);

            const result = hostConfig.prepareUpdate(
                instance,
                'ojs-view',
                props,
                props,
                null as any,
                null
            );

            expect(result).toBeNull();
        });
    });
});
