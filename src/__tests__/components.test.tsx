/**
 * Tests for component wrappers
 *
 * Tests verify that component wrappers:
 * - Map to correct internal element types (ojs-*)
 * - Pass through all props correctly
 * - Handle all supported props for each component type
 */

import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render } from '../renderer';
import {
    View,
    Text,
    Label,
    Button,
    TextField,
    Toggle,
    Slider,
    ScrollView,
    Image,
    clearImageCache,
} from '../components';
import { MockVisualElement, MockTexture2D, MockVectorImage, MockLength, MockColor, createMockContainer, flushMicrotasks, getEventAPI, mockFileSystem, mockUrlAssets } from './mocks';

// Helper to extract value from style (handles both raw values and MockLength/MockColor)
function getStyleValue(style: unknown): unknown {
    if (style instanceof MockLength) return style.value;
    if (style instanceof MockColor) return style;
    return style;
}

describe('components', () => {
    describe('View', () => {
        it('renders as VisualElement', async () => {
            const container = createMockContainer();
            render(<View />, container as any);
            await flushMicrotasks();

            expect(container.children[0].__csType).toBe('UnityEngine.UIElements.VisualElement');
        });

        it('applies style props', async () => {
            const container = createMockContainer();
            render(
                <View
                    style={{
                        width: 200,
                        height: 100,
                        flexDirection: 'row',
                        padding: 10,
                    }}
                />,
                container as any
            );
            await flushMicrotasks();

            const el = container.children[0] as MockVisualElement;
            expect(getStyleValue(el.style.width)).toBe(200);
            expect(getStyleValue(el.style.height)).toBe(100);
            // flexDirection 'row' is converted to the Unity enum value FlexDirection.Row
            const FlexDirection = (globalThis as any).CS.UnityEngine.UIElements.FlexDirection;
            expect(el.style.flexDirection).toBe(FlexDirection.Row);
            expect(getStyleValue(el.style.paddingTop)).toBe(10);
        });

        it('applies className', async () => {
            const container = createMockContainer();
            render(<View className="container main" />, container as any);
            await flushMicrotasks();

            const el = container.children[0] as MockVisualElement;
            expect(el.hasClass('container')).toBe(true);
            expect(el.hasClass('main')).toBe(true);
        });

        it('registers event handlers', async () => {
            const container = createMockContainer();
            const onClick = vi.fn();
            const onPointerMove = vi.fn();

            render(<View onClick={onClick} onPointerMove={onPointerMove} />, container as any);
            await flushMicrotasks();

            const eventAPI = getEventAPI();
            expect(eventAPI.addEventListener).toHaveBeenCalledWith(
                container.children[0],
                'click',
                onClick
            );
            expect(eventAPI.addEventListener).toHaveBeenCalledWith(
                container.children[0],
                'pointermove',
                onPointerMove
            );
        });

        it('renders children', async () => {
            const container = createMockContainer();
            render(
                <View>
                    <Label text="Child 1" />
                    <Label text="Child 2" />
                </View>,
                container as any
            );
            await flushMicrotasks();

            const view = container.children[0] as MockVisualElement;
            expect(view.childCount).toBe(2);
        });
    });

    describe('Text', () => {
        it('renders as TextElement', async () => {
            const container = createMockContainer();
            render(<Text text="Hello" />, container as any);
            await flushMicrotasks();

            expect(container.children[0].__csType).toBe('UnityEngine.UIElements.TextElement');
        });

        it('sets text property', async () => {
            const container = createMockContainer();
            render(<Text text="Hello World" />, container as any);
            await flushMicrotasks();

            const el = container.children[0] as MockVisualElement;
            expect(el.text).toBe('Hello World');
        });

        it('applies styles', async () => {
            const container = createMockContainer();
            render(
                <Text
                    text="Styled"
                    style={{ fontSize: 24, color: 'white' }}
                />,
                container as any
            );
            await flushMicrotasks();

            const el = container.children[0] as MockVisualElement;
            expect(getStyleValue(el.style.fontSize)).toBe(24);
            expect(el.style.color).toBeInstanceOf(MockColor);
        });
    });

    describe('Label', () => {
        it('renders as Label element', async () => {
            const container = createMockContainer();
            render(<Label text="Hello" />, container as any);
            await flushMicrotasks();

            expect(container.children[0].__csType).toBe('UnityEngine.UIElements.Label');
        });

        it('sets text property', async () => {
            const container = createMockContainer();
            render(<Label text="Hello World" />, container as any);
            await flushMicrotasks();

            const el = container.children[0] as MockVisualElement;
            expect(el.text).toBe('Hello World');
        });

        it('applies styles', async () => {
            const container = createMockContainer();
            render(
                <Label
                    text="Styled"
                    style={{ fontSize: 24, color: 'white' }}
                />,
                container as any
            );
            await flushMicrotasks();

            const el = container.children[0] as MockVisualElement;
            expect(getStyleValue(el.style.fontSize)).toBe(24);
            expect(el.style.color).toBeInstanceOf(MockColor);
        });
    });

    describe('Button', () => {
        it('renders as Button element', async () => {
            const container = createMockContainer();
            render(<Button text="Click" />, container as any);
            await flushMicrotasks();

            expect(container.children[0].__csType).toBe('UnityEngine.UIElements.Button');
        });

        it('sets text property', async () => {
            const container = createMockContainer();
            render(<Button text="Submit" />, container as any);
            await flushMicrotasks();

            const el = container.children[0] as MockVisualElement;
            expect(el.text).toBe('Submit');
        });

        it('registers onClick handler', async () => {
            const container = createMockContainer();
            const handleClick = vi.fn();

            render(<Button text="Click Me" onClick={handleClick} />, container as any);
            await flushMicrotasks();

            const eventAPI = getEventAPI();
            expect(eventAPI.addEventListener).toHaveBeenCalledWith(
                container.children[0],
                'click',
                handleClick
            );
        });
    });

    describe('TextField', () => {
        it('renders as TextField element', async () => {
            const container = createMockContainer();
            render(<TextField />, container as any);
            await flushMicrotasks();

            expect(container.children[0].__csType).toBe('UnityEngine.UIElements.TextField');
        });

        it('sets value property', async () => {
            const container = createMockContainer();
            render(<TextField value="initial text" />, container as any);
            await flushMicrotasks();

            const el = container.children[0] as MockVisualElement;
            expect(el.value).toBe('initial text');
        });

        it('registers onChange handler', async () => {
            const container = createMockContainer();
            const handleChange = vi.fn();

            render(<TextField onChange={handleChange} />, container as any);
            await flushMicrotasks();

            const eventAPI = getEventAPI();
            expect(eventAPI.addEventListener).toHaveBeenCalledWith(
                container.children[0],
                'change',
                handleChange
            );
        });

        // Unity puts placeholder on ITextEdition, not on TextField, so it needs
        // its own line in applyTextFieldProps. It was declared in TextFieldProps
        // but never applied, which failed silently.
        it('sets placeholder on textEdition', async () => {
            const container = createMockContainer();
            render(<TextField placeholder="Search" />, container as any);
            await flushMicrotasks();

            const el = container.children[0] as any;
            expect(el.textEdition.placeholder).toBe('Search');
        });

        it('updates placeholder on re-render', async () => {
            const container = createMockContainer();
            render(<TextField placeholder="Search" />, container as any);
            await flushMicrotasks();

            render(<TextField placeholder="Filter by name" />, container as any);
            await flushMicrotasks();

            const el = container.children[0] as any;
            expect(el.textEdition.placeholder).toBe('Filter by name');
        });
    });

    describe('Toggle', () => {
        it('renders as Toggle element', async () => {
            const container = createMockContainer();
            render(<Toggle />, container as any);
            await flushMicrotasks();

            expect(container.children[0].__csType).toBe('UnityEngine.UIElements.Toggle');
        });

        it('sets value and label properties', async () => {
            const container = createMockContainer();
            render(<Toggle value={true} label="Enable feature" />, container as any);
            await flushMicrotasks();

            const el = container.children[0] as MockVisualElement;
            expect(el.value).toBe(true);
            expect(el.label).toBe('Enable feature');
        });

        it('registers onChange handler', async () => {
            const container = createMockContainer();
            const handleChange = vi.fn();

            render(<Toggle onChange={handleChange} />, container as any);
            await flushMicrotasks();

            const eventAPI = getEventAPI();
            expect(eventAPI.addEventListener).toHaveBeenCalledWith(
                container.children[0],
                'change',
                handleChange
            );
        });
    });

    describe('Slider', () => {
        it('renders as Slider element', async () => {
            const container = createMockContainer();
            render(<Slider />, container as any);
            await flushMicrotasks();

            expect(container.children[0].__csType).toBe('UnityEngine.UIElements.Slider');
        });

        it('sets value property', async () => {
            const container = createMockContainer();
            render(<Slider value={0.5} />, container as any);
            await flushMicrotasks();

            const el = container.children[0] as MockVisualElement;
            expect(el.value).toBe(0.5);
        });

        it('registers onChange handler', async () => {
            const container = createMockContainer();
            const handleChange = vi.fn();

            render(<Slider onChange={handleChange} />, container as any);
            await flushMicrotasks();

            const eventAPI = getEventAPI();
            expect(eventAPI.addEventListener).toHaveBeenCalledWith(
                container.children[0],
                'change',
                handleChange
            );
        });
    });

    describe('ScrollView', () => {
        it('renders as ScrollView element', async () => {
            const container = createMockContainer();
            render(<ScrollView />, container as any);
            await flushMicrotasks();

            expect(container.children[0].__csType).toBe('UnityEngine.UIElements.ScrollView');
        });

        it('renders children', async () => {
            const container = createMockContainer();
            render(
                <ScrollView>
                    <View style={{ height: 1000 }}>
                        <Label text="Scrollable content" />
                    </View>
                </ScrollView>,
                container as any
            );
            await flushMicrotasks();

            const scrollView = container.children[0] as MockVisualElement;
            expect(scrollView.childCount).toBe(1);
        });
    });

    describe('Image', () => {
        it('renders as Image element', async () => {
            const container = createMockContainer();
            render(<Image />, container as any);
            await flushMicrotasks();

            expect(container.children[0].__csType).toBe('UnityEngine.UIElements.Image');
        });

        it('applies styles', async () => {
            const container = createMockContainer();
            render(
                <Image style={{ width: 100, height: 100 }} />,
                container as any
            );
            await flushMicrotasks();

            const el = container.children[0] as MockVisualElement;
            expect(getStyleValue(el.style.width)).toBe(100);
            expect(getStyleValue(el.style.height)).toBe(100);
        });

        it('loads texture when src is provided', async () => {
            mockFileSystem.set("/project/App/assets/images/logo.png", [0x89, 0x50, 0x4e, 0x47]);
            (globalThis as any).__workingDir = "/project/App";

            const container = createMockContainer();
            render(<Image src="images/logo.png" style={{ width: 64, height: 64 }} />, container as any);
            await flushMicrotasks();

            const el = container.children[0] as any;
            expect(el.image).toBeInstanceOf(MockTexture2D);
            expect((el.image as MockTexture2D)._loaded).toBe(true);
        });

        it('returns null for missing file with console.error', async () => {
            (globalThis as any).__workingDir = "/project/App";

            const container = createMockContainer();
            render(<Image src="images/missing.png" />, container as any);
            await flushMicrotasks();

            const el = container.children[0] as any;
            expect(el.image).toBeNull();
            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining("Image src not found: images/missing.png")
            );
        });

        it('caches textures across renders', async () => {
            mockFileSystem.set("/project/App/assets/photos/hero.png", [0x89, 0x50]);
            (globalThis as any).__workingDir = "/project/App";
            const cs = (globalThis as any).CS;
            const readSpy = vi.spyOn(cs.System.IO.File, 'ReadAllBytes');

            const container = createMockContainer();
            render(<Image src="photos/hero.png" />, container as any);
            await flushMicrotasks();

            // Re-render with same src
            render(<Image src="photos/hero.png" />, container as any);
            await flushMicrotasks();

            expect(readSpy).toHaveBeenCalledTimes(1);
        });

        it('src takes precedence over image prop', async () => {
            mockFileSystem.set("/project/App/assets/a.png", [0x89]);
            (globalThis as any).__workingDir = "/project/App";
            const manualTex = { manual: true };

            const container = createMockContainer();
            render(<Image src="a.png" image={manualTex} />, container as any);
            await flushMicrotasks();

            const el = container.children[0] as any;
            expect(el.image).toBeInstanceOf(MockTexture2D);
        });

        it('clearImageCache resets the cache', async () => {
            mockFileSystem.set("/project/App/assets/b.png", [0x89]);
            (globalThis as any).__workingDir = "/project/App";
            const cs = (globalThis as any).CS;
            const readSpy = vi.spyOn(cs.System.IO.File, 'ReadAllBytes');

            const container1 = createMockContainer();
            render(<Image src="b.png" />, container1 as any);
            await flushMicrotasks();

            clearImageCache();

            // Render in a new container to force a fresh component mount
            const container2 = createMockContainer();
            render(<Image src="b.png" />, container2 as any);
            await flushMicrotasks();

            expect(readSpy).toHaveBeenCalledTimes(2);
        });

        it('loads SVG synchronously via SVGUtils in the editor', async () => {
            mockFileSystem.set("/project/App/assets/icons/star.svg", "<svg></svg>");
            (globalThis as any).__workingDir = "/project/App";

            const container = createMockContainer();
            render(<Image src="icons/star.svg" />, container as any);
            await flushMicrotasks();

            const el = container.children[0] as any;
            expect(el.image).toBeInstanceOf(MockVectorImage);
            expect((el.image as MockVectorImage).svgText).toBe("<svg></svg>");
        });
    });

    describe('Image on URL StreamingAssets platforms (Android APK, WebGL)', () => {
        const JAR_BASE = "jar:file:///data/app/base.apk!/assets";

        // Simulate an Android player: not the editor, and streamingAssetsPath
        // is a jar: URL inside the APK that System.IO.File cannot read
        beforeEach(() => {
            const app = (globalThis as any).CS.UnityEngine.Application;
            app.isEditor = false;
            app.streamingAssetsPath = JAR_BASE;
        });

        it('loads raster images asynchronously via Network.LoadTextureFromUrl', async () => {
            mockUrlAssets.set(`${JAR_BASE}/onejs/assets/images/logo.png`, [0x89, 0x50, 0x4e, 0x47]);

            const container = createMockContainer();
            render(<Image src="images/logo.png" />, container as any);
            await flushMicrotasks();

            const el = container.children[0] as any;
            expect(el.image).toBeInstanceOf(MockTexture2D);
            expect((el.image as MockTexture2D)._loaded).toBe(true);
            expect((el.image as MockTexture2D).filterMode).toBe(1); // Bilinear
        });

        it('loads SVG asynchronously via fetch + SVGUtils', async () => {
            mockUrlAssets.set(`${JAR_BASE}/onejs/assets/icons/spinner.svg`, "<svg>spin</svg>");

            const container = createMockContainer();
            render(<Image src="icons/spinner.svg" />, container as any);
            await flushMicrotasks();

            const el = container.children[0] as any;
            expect(el.image).toBeInstanceOf(MockVectorImage);
            expect((el.image as MockVectorImage).svgText).toBe("<svg>spin</svg>");
        });

        it('keeps a null image and logs an error when the asset is missing', async () => {
            const container = createMockContainer();
            render(<Image src="images/missing.png" />, container as any);
            await flushMicrotasks();

            const el = container.children[0] as any;
            expect(el.image).toBeNull();
            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining("Image src not found: images/missing.png")
            );
        });

        it('dedupes concurrent loads and serves later mounts from the cache', async () => {
            mockUrlAssets.set(`${JAR_BASE}/onejs/assets/a.png`, [0x89]);
            const cs = (globalThis as any).CS;
            const loadSpy = vi.spyOn(cs.OneJS.Network, 'LoadTextureFromUrl');

            // Two simultaneous mounts of the same src share one request
            const container1 = createMockContainer();
            render(
                <View>
                    <Image src="a.png" />
                    <Image src="a.png" />
                </View>,
                container1 as any
            );
            await flushMicrotasks();

            expect(loadSpy).toHaveBeenCalledTimes(1);
            const view = container1.children[0];
            expect((view.children[0] as any).image).toBeInstanceOf(MockTexture2D);
            expect((view.children[1] as any).image).toBeInstanceOf(MockTexture2D);

            // A later mount resolves synchronously from the cache
            const container2 = createMockContainer();
            render(<Image src="a.png" />, container2 as any);
            await flushMicrotasks();

            expect(loadSpy).toHaveBeenCalledTimes(1);
            expect((container2.children[0] as any).image).toBeInstanceOf(MockTexture2D);
        });
    });

    describe('event handler mapping', () => {
        it('maps all pointer events correctly', async () => {
            const container = createMockContainer();
            const handlers = {
                onClick: vi.fn(),
                onPointerDown: vi.fn(),
                onPointerUp: vi.fn(),
                onPointerMove: vi.fn(),
                onPointerEnter: vi.fn(),
                onPointerLeave: vi.fn(),
            };

            render(<View {...handlers} />, container as any);
            await flushMicrotasks();

            const eventAPI = getEventAPI();
            const el = container.children[0];

            expect(eventAPI.addEventListener).toHaveBeenCalledWith(el, 'click', handlers.onClick);
            expect(eventAPI.addEventListener).toHaveBeenCalledWith(el, 'pointerdown', handlers.onPointerDown);
            expect(eventAPI.addEventListener).toHaveBeenCalledWith(el, 'pointerup', handlers.onPointerUp);
            expect(eventAPI.addEventListener).toHaveBeenCalledWith(el, 'pointermove', handlers.onPointerMove);
            expect(eventAPI.addEventListener).toHaveBeenCalledWith(el, 'pointerenter', handlers.onPointerEnter);
            expect(eventAPI.addEventListener).toHaveBeenCalledWith(el, 'pointerleave', handlers.onPointerLeave);
        });

        it('maps focus events correctly', async () => {
            const container = createMockContainer();
            const onFocus = vi.fn();
            const onBlur = vi.fn();

            render(<TextField onFocus={onFocus} onBlur={onBlur} />, container as any);
            await flushMicrotasks();

            const eventAPI = getEventAPI();
            const el = container.children[0];

            expect(eventAPI.addEventListener).toHaveBeenCalledWith(el, 'focus', onFocus);
            expect(eventAPI.addEventListener).toHaveBeenCalledWith(el, 'blur', onBlur);
        });

        it('maps keyboard events correctly', async () => {
            const container = createMockContainer();
            const onKeyDown = vi.fn();
            const onKeyUp = vi.fn();

            render(<TextField onKeyDown={onKeyDown} onKeyUp={onKeyUp} />, container as any);
            await flushMicrotasks();

            const eventAPI = getEventAPI();
            const el = container.children[0];

            expect(eventAPI.addEventListener).toHaveBeenCalledWith(el, 'keydown', onKeyDown);
            expect(eventAPI.addEventListener).toHaveBeenCalledWith(el, 'keyup', onKeyUp);
        });
    });
});
