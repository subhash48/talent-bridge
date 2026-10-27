// The home page's scroll-driven film (lib/scroll-frames.ts). Run with `npm test`.
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  FRAME_COUNT,
  coverRect,
  ease,
  filmShot,
  framePosition,
  frameSetFor,
  frameUrl,
  framesNear,
  holdPoint,
  sceneState,
  sceneWindows,
  scrollProgress,
} from "../lib/scroll-frames.ts";

test("frames are numbered from 01, one set per orientation", () => {
  assert.equal(frameUrl("desktop", 0), "/hero/desktop/01.webp");
  assert.equal(frameUrl("mobile", FRAME_COUNT - 1), "/hero/mobile/40.webp");
  assert.equal(frameSetFor(1440, 900), "desktop");
  assert.equal(frameSetFor(390, 844), "mobile");
  assert.equal(frameSetFor(1000, 1000), "desktop");
});

test("scroll progress runs 0 to 1 across the hero, and no further", () => {
  assert.equal(scrollProgress(-50, 2000), 0);
  assert.equal(scrollProgress(500, 2000), 0.25);
  assert.equal(scrollProgress(5000, 2000), 1);
  assert.equal(scrollProgress(100, 0), 0);
});

test("progress maps onto frames: 0 → first, 0.5 → middle, 1 → last", () => {
  assert.deepEqual(framePosition(0), { index: 0, next: 1, mix: 0 });
  assert.deepEqual(framePosition(1), { index: FRAME_COUNT - 1, next: FRAME_COUNT - 1, mix: 0 });
  const middle = framePosition(0.5);
  assert.equal(middle.index, 19);
  assert.ok(Math.abs(middle.mix - 0.5) < 1e-9);
  assert.equal(framePosition(0.25).index, Math.floor(0.25 * (FRAME_COUNT - 1)));
});

test("frames load nearest first, ahead before behind, never out of range", () => {
  assert.deepEqual(framesNear(0, 3), [0, 1, 2, 3]);
  assert.deepEqual(framesNear(10, 2), [10, 11, 9, 12, 8]);
  assert.deepEqual(framesNear(39, 2), [39, 38, 37]);
  assert.equal(new Set(framesNear(20, FRAME_COUNT)).size, FRAME_COUNT);
});

test("a frame covers the canvas whatever its shape, centred", () => {
  const wide = coverRect({ width: 1600, height: 900 }, { width: 1000, height: 1000 });
  assert.equal(wide.height, 1000);
  assert.ok(wide.width > 1000);
  assert.equal(wide.x, (1000 - wide.width) / 2);
  const zoomed = coverRect({ width: 1600, height: 900 }, { width: 1600, height: 900 }, 1.1);
  assert.ok(Math.abs(zoomed.width - 1760) < 1e-9);
  assert.ok(zoomed.x < 0 && zoomed.y < 0);
});

test("scenes take turns: one at a time, the first at the top, the last gone by the end", () => {
  const windows = sceneWindows([1, 1, 1, 1]);
  const shownAt = (progress) => windows.map((window) => sceneState(progress, window).shown);
  assert.deepEqual(shownAt(0), [1, 0, 0, 0]);
  assert.deepEqual(shownAt(0.375), [0, 1, 0, 0]);
  assert.deepEqual(shownAt(0.625), [0, 0, 1, 0]);
  assert.deepEqual(shownAt(0.875), [0, 0, 0, 1]);
  // Empty when the pinned screen lets go, so nothing scrolls up under the header.
  assert.deepEqual(shownAt(1), [0, 0, 0, 0]);
  for (let progress = 0; progress <= 1; progress += 0.005) {
    assert.ok(shownAt(progress).filter((shown) => shown > 0).length <= 1, `two scenes at ${progress}`);
  }
  assert.equal(sceneState(0.24, windows[0]).leaving, true);
  assert.equal(sceneState(0.26, windows[1]).leaving, false);
});

test("heavier scenes get more of the film, and a link to a scene lands where it's fully shown", () => {
  const windows = sceneWindows([1, 3]);
  assert.equal(windows[0][3], 0.25);
  assert.equal(windows[1][0], 0.25);
  windows.forEach((window, index) => {
    assert.equal(sceneState(holdPoint(window), window).shown, 1, `scene ${index} at its hold point`);
  });
  const many = sceneWindows([1.1, 0.75, 0.75, 0.85, 1.25, 1.35, 1.35, 1.35]);
  for (let index = 1; index < many.length; index += 1) assert.ok(holdPoint(many[index]) > holdPoint(many[index - 1]));
});

test("every scene is its own shot: the clip plays through once per scene, and the next shot dissolves in as it leaves", () => {
  const windows = sceneWindows([1, 1, 1, 1]);
  assert.deepEqual(filmShot(0, windows), { scene: 0, position: 0, next: null });
  const middle = filmShot(0.375, windows);
  assert.equal(middle.scene, 1);
  assert.equal(middle.position, 0.5);
  assert.equal(middle.next, null);
  const leaving = filmShot(0.49, windows);
  assert.equal(leaving.scene, 1);
  assert.ok(leaving.position > 0.9 && leaving.next && leaving.next.position === 0 && leaving.next.mix > 0.8);
  // The next shot picks up exactly where the dissolve left it: its first frame.
  assert.deepEqual(filmShot(0.5, windows), { scene: 2, position: 0, next: null });
  assert.deepEqual(filmShot(1, windows), { scene: 3, position: 1, next: null });
  assert.equal(filmShot(1.4, windows).position, 1);
  for (let progress = 0; progress <= 1; progress += 0.01) {
    const { position, next } = filmShot(progress, windows);
    assert.ok(position >= 0 && position <= 1 && (!next || (next.mix >= 0 && next.mix <= 1)), `shot at ${progress}`);
  }
});

test("easing closes half the gap every half-life, whatever the frame rate", () => {
  assert.equal(ease(0, 1, 70), 0.5);
  assert.ok(Math.abs(ease(0, 1, 35) - ease(ease(0, 1, 17.5), 1, 17.5)) < 1e-12);
  assert.equal(ease(0.3, 0.3, 16), 0.3);
});
