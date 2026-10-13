import { expect, test } from "bun:test";
import { normalizeNewspicRenderSpec } from "../state";
import { validateNewspicRenderResult } from "./validate-newspic-render";

test("checks page limits, required images, and explicitly requested text-only pages", () => {
  const spec = normalizeNewspicRenderSpec({
    min_pages: 1, max_pages: 1, require_image_every_page: true,
    page_specs: [{ page: 3, image_markers: [] }],
  });
  const errors = validateNewspicRenderResult(spec, {
    pageCount: 2,
    pages: [{ page: 1, imageCount: 0, imageSources: [] }, { page: 2, imageCount: 1, imageSources: ["photo.png"] }],
  });
  expect(errors).toEqual([
    expect.stringContaining("at most 1"),
    expect.stringContaining("pages without required body images: 1"),
    expect.stringContaining("page 3 was explicitly configured"),
  ]);
  expect(validateNewspicRenderResult(normalizeNewspicRenderSpec({ min_pages: 1 }), {
    pageCount: 1, pages: [{ page: 1, imageCount: 0, imageSources: [] }],
  })).toEqual([]);
});

test("rejects duplicate or missing page numbers even when the page count matches", () => {
  const spec = normalizeNewspicRenderSpec({ min_pages: 2 });
  for (const pageNumbers of [[1, 1], [1, 3]]) {
    const errors = validateNewspicRenderResult(spec, {
      pageCount: 2,
      pages: pageNumbers.map(page => ({ page, imageCount: 0, imageSources: [] })),
    });
    expect(errors).toEqual(["newspic render page numbers must be consecutive and start at 1"]);
  }
  expect(validateNewspicRenderResult(spec, {
    pageCount: 2,
    pages: [2, 1].map(page => ({ page, imageCount: 0, imageSources: [] })),
  })).toEqual([]);
});
