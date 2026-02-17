import { describe, it, expect } from "vitest";
import {
  resolveCursorConfig,
  getCursorInjectionScript,
  getCursorMoveScript,
  getCursorClickScript,
} from "../src/cursor.js";

describe("resolveCursorConfig", () => {
  it("returns undefined for false", () => {
    expect(resolveCursorConfig(false)).toBeUndefined();
  });

  it("returns undefined for undefined", () => {
    expect(resolveCursorConfig(undefined)).toBeUndefined();
  });

  it("returns defaults for true", () => {
    const result = resolveCursorConfig(true);
    expect(result).toEqual({
      size: 20,
      color: "rgba(0,0,0,0.8)",
      clickEffect: true,
    });
  });

  it("merges custom options with defaults", () => {
    const result = resolveCursorConfig({
      size: 30,
      color: "red",
      clickEffect: false,
    });
    expect(result).toEqual({
      size: 30,
      color: "red",
      clickEffect: false,
    });
  });

  it("fills in missing optional fields from defaults", () => {
    const result = resolveCursorConfig({
      size: 15,
    } as any);
    expect(result!.size).toBe(15);
    expect(result!.color).toBe("rgba(0,0,0,0.8)");
    expect(result!.clickEffect).toBe(true);
  });
});

describe("getCursorInjectionScript", () => {
  it("returns a string that creates cursor and ripple elements", () => {
    const script = getCursorInjectionScript({
      size: 20,
      color: "rgba(0,0,0,0.8)",
      clickEffect: true,
    });
    expect(script).toContain("__demotape-cursor");
    expect(script).toContain("__demotape-ripple");
    expect(script).toContain("createElement");
    expect(script).toContain("z-index: 999999");
    expect(script).toContain("pointer-events: none");
  });

  it("uses custom size in the style", () => {
    const script = getCursorInjectionScript({
      size: 32,
      color: "blue",
      clickEffect: true,
    });
    expect(script).toContain("width: 32px");
    expect(script).toContain("height: 32px");
  });

  it("uses custom color in the style", () => {
    const script = getCursorInjectionScript({
      size: 20,
      color: "red",
      clickEffect: true,
    });
    expect(script).toContain("background: red");
  });

  it("does not re-create if cursor already exists", () => {
    const script = getCursorInjectionScript({
      size: 20,
      color: "black",
      clickEffect: true,
    });
    expect(script).toContain("getElementById");
    expect(script).toContain("return");
  });
});

describe("getCursorMoveScript", () => {
  it("returns script that sets cursor position", () => {
    const script = getCursorMoveScript(100, 200);
    expect(script).toContain("'200px'");
    expect(script).toContain("'100px'");
    expect(script).toContain("__demotape-cursor");
  });

  it("handles decimal coordinates", () => {
    const script = getCursorMoveScript(100.5, 200.7);
    expect(script).toContain("200.7px");
    expect(script).toContain("100.5px");
  });
});

describe("getCursorClickScript", () => {
  it("returns script that triggers ripple animation", () => {
    const script = getCursorClickScript();
    expect(script).toContain("__demotape-cursor");
    expect(script).toContain("__demotape-ripple");
    expect(script).toContain("opacity");
    expect(script).toContain("scale(1)");
    expect(script).toContain("setTimeout");
  });
});
