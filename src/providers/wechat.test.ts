import { describe, expect, test } from "bun:test";
import {
  normalizeAccountName,
  resolveTimeout,
  parsePhotos,
  mergePhotoLists,
  extractImageUrls,
  replaceImageUrls,
  isRetryableTokenFetchError,
  resolveFilenameFromUrl,
} from "./wechat";

describe("normalizeAccountName", () => {
  test("accepts valid account names", () => {
    expect(normalizeAccountName("default")).toBe("default");
    expect(normalizeAccountName("my-account")).toBe("my-account");
    expect(normalizeAccountName("account_v2")).toBe("account_v2");
    expect(normalizeAccountName("test.account")).toBe("test.account");
  });

  test("trims whitespace", () => {
    expect(normalizeAccountName("  default  ")).toBe("default");
  });

  test("throws on empty string", () => {
    expect(() => normalizeAccountName("")).toThrow("wx account cannot be empty");
    expect(() => normalizeAccountName("  ")).toThrow("wx account cannot be empty");
  });

  test("throws on invalid characters", () => {
    expect(() => normalizeAccountName("my account")).toThrow("invalid wx account");
    expect(() => normalizeAccountName("account@name")).toThrow("invalid wx account");
  });
});

describe("resolveTimeout", () => {
  test("returns override when valid", () => {
    expect(resolveTimeout(5000, 10000, 15000)).toBe(15000);
  });

  test("returns config timeout when override is absent", () => {
    expect(resolveTimeout(5000, 10000)).toBe(10000);
  });

  test("returns default when config and override are absent", () => {
    expect(resolveTimeout(5000, 0)).toBe(5000);
  });

  test("ignores invalid override (zero, negative, non-finite)", () => {
    expect(resolveTimeout(5000, 10000, 0)).toBe(10000);
    expect(resolveTimeout(5000, 10000, -1)).toBe(10000);
    expect(resolveTimeout(5000, 10000, Infinity)).toBe(10000);
    expect(resolveTimeout(5000, 10000, NaN)).toBe(10000);
  });

  test("ignores invalid config timeout", () => {
    expect(resolveTimeout(5000, -1)).toBe(5000);
    expect(resolveTimeout(5000, 0)).toBe(5000);
  });
});

describe("parsePhotos", () => {
  test("trims and filters empty entries", () => {
    expect(parsePhotos(["  img1.png  ", "", "  img2.png  "])).toEqual(["img1.png", "img2.png"]);
  });

  test("returns empty array for undefined", () => {
    expect(parsePhotos(undefined)).toEqual([]);
  });

  test("returns empty array for empty array", () => {
    expect(parsePhotos([])).toEqual([]);
  });

  test("filters whitespace-only entries", () => {
    expect(parsePhotos(["img.png", "  ", "other.png"])).toEqual(["img.png", "other.png"]);
  });
});

describe("mergePhotoLists", () => {
  test("deduplicates across multiple lists", () => {
    const result = mergePhotoLists(
      ["a.png", "b.png"],
      ["b.png", "c.png"],
      ["c.png", "d.png"],
    );
    expect(result).toEqual(["a.png", "b.png", "c.png", "d.png"]);
  });

  test("handles empty lists", () => {
    expect(mergePhotoLists([], ["a.png"], [])).toEqual(["a.png"]);
  });

  test("trims entries before deduplication", () => {
    expect(mergePhotoLists(["  a.png  "], ["a.png"])).toEqual(["a.png"]);
  });

  test("filters empty entries", () => {
    expect(mergePhotoLists(["", "a.png", "  "])).toEqual(["a.png"]);
  });
});

describe("extractImageUrls", () => {
  test("extracts markdown image URLs", () => {
    const input = "![alt](https://example.com/img.png) and ![other](https://cdn.com/other.jpg)";
    const urls = extractImageUrls(input);
    expect(urls).toContain("https://example.com/img.png");
    expect(urls).toContain("https://cdn.com/other.jpg");
  });

  test("extracts HTML img src URLs", () => {
    const input = '<img src="https://example.com/img.png" alt="test">';
    const urls = extractImageUrls(input);
    expect(urls).toContain("https://example.com/img.png");
  });

  test("deduplicates URLs", () => {
    const input = "![a](https://example.com/img.png) ![b](https://example.com/img.png)";
    const urls = extractImageUrls(input);
    expect(urls.filter((u) => u === "https://example.com/img.png")).toHaveLength(1);
  });

  test("handles mixed markdown and HTML images", () => {
    const input = '![md](https://a.com/1.png) <img src="https://b.com/2.png">';
    const urls = extractImageUrls(input);
    expect(urls).toHaveLength(2);
  });

  test("returns empty array for no images", () => {
    expect(extractImageUrls("just text")).toEqual([]);
  });

  test("handles image with title attribute", () => {
    const input = '![alt](https://example.com/img.png "title")';
    const urls = extractImageUrls(input);
    expect(urls).toContain("https://example.com/img.png");
  });
});

describe("replaceImageUrls", () => {
  test("replaces URLs using the mapping", () => {
    const html = '<img src="https://old.com/img.png">';
    const result = replaceImageUrls(html, { "https://old.com/img.png": "https://new.com/img.png" });
    expect(result).toBe('<img src="https://new.com/img.png">');
  });

  test("escapes special regex characters in URLs", () => {
    const html = '<img src="https://old.com/img.png?v=1&size=large">';
    const result = replaceImageUrls(html, {
      "https://old.com/img.png?v=1&size=large": "https://new.com/img.png",
    });
    expect(result).toBe('<img src="https://new.com/img.png">');
  });

  test("replaces multiple occurrences", () => {
    const html = '<img src="https://a.com/1.png"><img src="https://a.com/1.png">';
    const result = replaceImageUrls(html, { "https://a.com/1.png": "https://b.com/1.png" });
    expect(result).toBe('<img src="https://b.com/1.png"><img src="https://b.com/1.png">');
  });

  test("skips empty keys or values", () => {
    const html = '<img src="https://a.com/1.png">';
    const result = replaceImageUrls(html, { "": "https://b.com/1.png", "https://a.com/1.png": "" });
    expect(result).toBe(html);
  });
});

describe("isRetryableTokenFetchError", () => {
  test("returns true for fetch failed errors", () => {
    expect(isRetryableTokenFetchError(new Error("fetch failed"))).toBe(true);
    expect(isRetryableTokenFetchError(new Error("Request failed: fetch failed ECONNREFUSED"))).toBe(true);
  });

  test("returns true case-insensitively", () => {
    expect(isRetryableTokenFetchError(new Error("Fetch Failed"))).toBe(true);
    expect(isRetryableTokenFetchError(new Error("FETCH FAILED"))).toBe(true);
  });

  test("returns false for non-fetch errors", () => {
    expect(isRetryableTokenFetchError(new Error("timeout"))).toBe(false);
    expect(isRetryableTokenFetchError(new Error("unauthorized"))).toBe(false);
  });

  test("returns false for non-Error values", () => {
    expect(isRetryableTokenFetchError("fetch failed")).toBe(false);
    expect(isRetryableTokenFetchError(null)).toBe(false);
    expect(isRetryableTokenFetchError(undefined)).toBe(false);
  });
});

describe("resolveFilenameFromUrl", () => {
  test("uses filename from URL path", () => {
    expect(resolveFilenameFromUrl("https://cdn.com/photo.png", "image/png", 0)).toBe("photo.png");
  });

  test("strips query parameters", () => {
    expect(resolveFilenameFromUrl("https://cdn.com/photo.png?v=1&size=large", "image/png", 0)).toBe("photo.png");
  });

  test("adds extension when missing", () => {
    expect(resolveFilenameFromUrl("https://cdn.com/photo", "image/jpeg", 0)).toBe("photo.jpg");
  });

  test("corrects mismatched extension", () => {
    expect(resolveFilenameFromUrl("https://cdn.com/photo.gif", "image/png", 0)).toBe("photo.png");
  });

  test("uses fallback name when URL has no filename", () => {
    expect(resolveFilenameFromUrl("https://cdn.com/", "image/png", 0)).toBe("image_1.png");
  });

  test("uses index for fallback naming", () => {
    expect(resolveFilenameFromUrl("https://cdn.com/", "image/jpeg", 2)).toBe("image_3.jpg");
  });
});
