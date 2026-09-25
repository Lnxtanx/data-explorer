// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { setupSectionVisibilitySpy } from '../init';

type Posted = { type: string; sectionId?: string };

function mockParentPost() {
  const posted: Posted[] = [];
  const parentPost = vi.fn((_msg: unknown, _origin?: string) => {
    posted.push(_msg as Posted);
  });
  // jsdom: window.parent === window
  vi.stubGlobal('parent', { postMessage: parentPost });
  // Also stub the bare `parent` binding used inside the module scope
  Object.defineProperty(window, 'parent', {
    value: { postMessage: parentPost },
    writable: true,
    configurable: true,
  });
  return { posted, parentPost };
}

function setViewport(scrollY: number, innerHeight: number, scrollHeight: number) {
  Object.defineProperty(window, 'scrollY', { value: scrollY, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: innerHeight, configurable: true });
  Object.defineProperty(document.documentElement, 'scrollHeight', {
    value: scrollHeight,
    configurable: true,
  });
}

async function flushRaf() {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

describe('setupSectionVisibilitySpy', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts SECTION_VISIBLE for the first section on initial tick', async () => {
    const { posted } = mockParentPost();
    document.body.innerHTML = `
      <section class="sw-section" id="section-overview"><h2>Overview</h2></section>
      <section class="sw-section" id="section-growth"><h2>Growth</h2></section>
    `;
    // Overview near top, growth far below
    const overview = document.getElementById('section-overview')!;
    const growth = document.getElementById('section-growth')!;
    vi.spyOn(overview, 'getBoundingClientRect').mockReturnValue({
      top: 20, bottom: 400, left: 0, right: 800, width: 800, height: 380,
      x: 0, y: 20, toJSON: () => ({}),
    } as DOMRect);
    vi.spyOn(growth, 'getBoundingClientRect').mockReturnValue({
      top: 800, bottom: 1400, left: 0, right: 800, width: 800, height: 600,
      x: 0, y: 800, toJSON: () => ({}),
    } as DOMRect);
    setViewport(0, 600, 2000);

    setupSectionVisibilitySpy();
    await flushRaf();

    expect(posted).toEqual([{ type: 'SECTION_VISIBLE', sectionId: 'overview' }]);
  });

  it('does not repost the same section on subsequent scrolls', async () => {
    const { posted } = mockParentPost();
    document.body.innerHTML = `<section id="section-overview"></section>`;
    const overview = document.getElementById('section-overview')!;
    vi.spyOn(overview, 'getBoundingClientRect').mockReturnValue({
      top: 10, bottom: 500, left: 0, right: 800, width: 800, height: 490,
      x: 0, y: 10, toJSON: () => ({}),
    } as DOMRect);
    setViewport(0, 600, 2000);

    setupSectionVisibilitySpy();
    await flushRaf();
    window.dispatchEvent(new Event('scroll'));
    await flushRaf();

    expect(posted.filter((p) => p.type === 'SECTION_VISIBLE')).toHaveLength(1);
  });

  it('activates the last section when scrolled to the bottom', async () => {
    const { posted } = mockParentPost();
    document.body.innerHTML = `
      <section id="section-overview"></section>
      <section id="section-engagement"></section>
    `;
    // Both sections report top above marker (we are deep in the page)
    for (const id of ['section-overview', 'section-engagement']) {
      const el = document.getElementById(id)!;
      vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
        top: -400, bottom: 100, left: 0, right: 800, width: 800, height: 500,
        x: 0, y: -400, toJSON: () => ({}),
      } as DOMRect);
    }
    // scrollY + innerHeight >= scrollHeight → bottom of page
    setViewport(1900, 200, 2100);

    setupSectionVisibilitySpy();
    await flushRaf();

    expect(posted[posted.length - 1]).toEqual({
      type: 'SECTION_VISIBLE',
      sectionId: 'engagement',
    });
  });

  it('is a no-op when no sections exist', async () => {
    const { posted } = mockParentPost();
    setupSectionVisibilitySpy();
    await flushRaf();
    expect(posted).toHaveLength(0);
  });
});
