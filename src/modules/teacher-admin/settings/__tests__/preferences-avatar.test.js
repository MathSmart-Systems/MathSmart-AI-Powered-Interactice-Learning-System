/**
 * Unit tests for teacher preferences and avatar storage.
 */

import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";

import { PRESET_AVATARS } from "../utils/constants.js";
import {
  applyDensity,
  loadDisplayPreferences,
  loadTeacherAvatar,
  saveDisplayPreferences,
  saveTeacherAvatar,
} from "../utils/preferences-storage.js";

// Mock localStorage and window event system
const store = new Map();
const listeners = new Map();

globalThis.window = {
  localStorage: {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, val) => store.set(key, String(val)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
  },
  dispatchEvent: (event) => {
    const handlers = listeners.get(event.type) || [];
    for (const h of handlers) h(event);
    return true;
  },
  addEventListener: (type, handler) => {
    const list = listeners.get(type) || [];
    list.push(handler);
    listeners.set(type, list);
  },
  removeEventListener: (type, handler) => {
    const list = listeners.get(type) || [];
    listeners.set(type, list.filter((h) => h !== handler));
  },
};

globalThis.Event = class Event {
  constructor(type) {
    this.type = type;
  }
};

describe("teacher avatar storage", () => {
  beforeEach(() => {
    store.clear();
    listeners.clear();
  });

  it("returns null when no avatar is saved", () => {
    assert.equal(loadTeacherAvatar(), null);
  });

  it("saves and retrieves teacher avatar data URL", () => {
    const testAvatar = "data:image/jpeg;base64,mock123";
    let eventFired = false;
    window.addEventListener("mathsmart:teacher-avatar-change", () => {
      eventFired = true;
    });

    saveTeacherAvatar(testAvatar);
    assert.equal(loadTeacherAvatar(), testAvatar);
    assert.equal(eventFired, true);
  });

  it("removes teacher avatar cleanly", () => {
    saveTeacherAvatar("data:image/jpeg;base64,temp");
    assert.equal(loadTeacherAvatar(), "data:image/jpeg;base64,temp");

    saveTeacherAvatar(null);
    assert.equal(loadTeacherAvatar(), null);
  });

  it("provides valid preset avatars", () => {
    assert.equal(Array.isArray(PRESET_AVATARS), true);
    assert.equal(PRESET_AVATARS.length >= 4, true);

    for (const preset of PRESET_AVATARS) {
      assert.ok(preset.id);
      assert.ok(preset.title);
      assert.ok(preset.svg.startsWith("data:image/svg+xml;utf8,<svg"));
    }
  });
});

describe("display preferences storage", () => {
  beforeEach(() => {
    store.clear();
  });

  it("returns fallback when no preferences saved", () => {
    const fallback = { theme: "light", density: "comfortable" };
    assert.deepEqual(loadDisplayPreferences(fallback), fallback);
  });

  it("saves and reloads updated preferences including density", () => {
    const prefs = {
      theme: "dark",
      projectorMode: true,
      soundEffects: false,
      density: "compact",
    };
    saveDisplayPreferences(prefs);
    assert.deepEqual(loadDisplayPreferences(), prefs);
  });

  it("applies density-compact class correctly via applyDensity", () => {
    const classes = new Set();
    globalThis.document = {
      documentElement: {
        classList: {
          add: (cls) => classes.add(cls),
          remove: (cls) => classes.delete(cls),
          contains: (cls) => classes.has(cls),
        },
      },
    };

    applyDensity("compact");
    assert.equal(classes.has("density-compact"), true);

    applyDensity("comfortable");
    assert.equal(classes.has("density-compact"), false);

    delete globalThis.document;
  });
});
