import type { ImageRenderOutput } from "../adapter-types";
import type { NewspicRenderSpec } from "../state";

/** 校验插件实际输出是否满足图文任务约束。 */
export function validateNewspicRenderResult(
  spec: NewspicRenderSpec,
  result: Pick<ImageRenderOutput, "pageCount" | "pages">,
): string[] {
  const errors: string[] = [];

  if (result.pageCount < spec.min_pages) {
    errors.push(
      `newspic render produced ${result.pageCount} page(s), but at least ${spec.min_pages} page(s) were requested`,
    );
  }

  if (spec.max_pages > 0 && result.pageCount > spec.max_pages) {
    errors.push(`newspic render produced ${result.pageCount} page(s), but at most ${spec.max_pages} page(s) were requested`);
  }
  if (result.pages.length !== result.pageCount) {
    errors.push("newspic render page summaries do not match page count");
  }
  const pageNumbers = new Set(result.pages.map(page => page.page));
  if (pageNumbers.size !== result.pageCount || result.pages.some(page =>
    !Number.isInteger(page.page) || page.page < 1 || page.page > result.pageCount)) {
    errors.push("newspic render page numbers must be consecutive and start at 1");
  }

  if (spec.require_image_every_page) {
    const missingPages = result.pages
      .filter((page) => page.imageCount < 1)
      .map((page) => page.page);
    if (missingPages.length > 0) {
      errors.push(`pages without required body images: ${missingPages.join(", ")}`);
    }
  }

  for (const pageSpec of spec.page_specs) {
    const page = result.pages.find((item) => item.page === pageSpec.page);
    if (!page) {
      errors.push(
        `page ${pageSpec.page} was explicitly configured but render only produced ${result.pageCount} page(s)`,
      );
      continue;
    }
    if (page.imageCount < pageSpec.image_markers.length) {
      errors.push(
        `page ${pageSpec.page} expected ${pageSpec.image_markers.length} body image(s), but render placed ${page.imageCount}`,
      );
    }
  }

  return errors;
}
