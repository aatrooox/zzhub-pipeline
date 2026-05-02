import { describe, expect, test } from "bun:test";
import { parseArgs, requireArg, optionalArg, flagArg } from "./args";

describe("parseArgs", () => {
  test("handles --key value pairs", () => {
    const parsed = parseArgs(["--state", "/path/to/file"]);
    expect(parsed.state).toBe("/path/to/file");
  });

  test("handles --key=value form", () => {
    const parsed = parseArgs(["--mode=content"]);
    expect(parsed.mode).toBe("content");
  });

  test("handles boolean flags", () => {
    const parsed = parseArgs(["--skip-render"]);
    expect(parsed["skip-render"]).toBe(true);
  });

  test("handles --help", () => {
    const parsed = parseArgs(["--help"]);
    expect(parsed.help).toBe(true);
  });

  test("handles -h shorthand", () => {
    const parsed = parseArgs(["-h"]);
    expect(parsed.help).toBe(true);
  });

  test("normalizes underscores to hyphens", () => {
    const parsed = parseArgs(["--requires_render", "true"]);
    expect(parsed["requires-render"]).toBe("true");
    expect(parsed["requires_render"]).toBe("true");
  });

  test("handles multiple arguments", () => {
    const parsed = parseArgs(["--state", "/path", "--mode", "content", "--verbose"]);
    expect(parsed.state).toBe("/path");
    expect(parsed.mode).toBe("content");
    expect(parsed.verbose).toBe(true);
  });

  test("collects positional arguments", () => {
    const parsed = parseArgs(["positional1", "--state", "/path", "positional2"]);
    const positional = JSON.parse(parsed._ as string) as string[];
    expect(positional).toEqual(["positional1", "positional2"]);
  });

  test("handles empty args", () => {
    const parsed = parseArgs([]);
    expect(parsed.help).toBeUndefined();
    expect(JSON.parse(parsed._ as string)).toEqual([]);
  });

  test("handles value that looks like a flag", () => {
    const parsed = parseArgs(["--output", "--verbose"]);
    expect(parsed.output).toBe(true);
    expect(parsed.verbose).toBe(true);
  });
});

describe("requireArg", () => {
  test("returns string value when present", () => {
    expect(requireArg({ state: "/path" }, "state", "state path")).toBe("/path");
  });

  test("throws for missing key", () => {
    expect(() => requireArg({}, "state", "state path")).toThrow(
      "Missing required argument: --state (state path)",
    );
  });

  test("throws when value is boolean", () => {
    expect(() => requireArg({ state: true }, "state", "state path")).toThrow(
      "Missing required argument: --state (state path)",
    );
  });

  test("throws when value is undefined", () => {
    expect(() => requireArg({ state: undefined as unknown as string | boolean }, "state", "desc")).toThrow();
  });
});

describe("optionalArg", () => {
  test("returns string value when present", () => {
    expect(optionalArg({ phase: "render" }, "phase")).toBe("render");
  });

  test("returns undefined for missing key", () => {
    expect(optionalArg({}, "phase")).toBeUndefined();
  });

  test("returns undefined for boolean value", () => {
    expect(optionalArg({ phase: true }, "phase")).toBeUndefined();
  });
});

describe("flagArg", () => {
  test("returns true for boolean true", () => {
    expect(flagArg({ verbose: true }, "verbose")).toBe(true);
  });

  test("returns true for string 'true'", () => {
    expect(flagArg({ verbose: "true" }, "verbose")).toBe(true);
  });

  test("returns false for missing key", () => {
    expect(flagArg({}, "verbose")).toBe(false);
  });

  test("returns false for string 'false'", () => {
    expect(flagArg({ verbose: "false" }, "verbose")).toBe(false);
  });

  test("returns false for other string values", () => {
    expect(flagArg({ verbose: "yes" }, "verbose")).toBe(false);
  });
});
