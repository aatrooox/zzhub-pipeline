import { describe, expect, test } from "bun:test";

import { splitTextByPageMarkers } from "./render-article";

describe("splitTextByPageMarkers", () => {
  test("splits chinese page markers into fixed page text segments", () => {
    const result = splitTextByPageMarkers([
      "导语第一行",
      "导语第二行",
      "",
      "【第一页】",
      "第一页正文",
      "",
      "【第二页】",
      "第二页正文",
    ].join("\n"));

    expect(result).toEqual([
      {
        page: 1,
        text: [
          "导语第一行",
          "导语第二行",
          "",
          "第一页正文",
        ].join("\n"),
      },
      {
        page: 2,
        text: "第二页正文",
      },
    ]);
  });

  test("supports english page markers", () => {
    const result = splitTextByPageMarkers([
      "【Page 2】",
      "Second page copy",
      "",
      "【Page 3】",
      "Third page copy",
    ].join("\n"));

    expect(result).toEqual([
      { page: 2, text: "Second page copy" },
      { page: 3, text: "Third page copy" },
    ]);
  });

  test("returns an empty list when there are no page markers", () => {
    expect(splitTextByPageMarkers("纯正文，没有页标记")).toEqual([]);
  });
});
