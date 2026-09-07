// 字号测量和最终成图都使用同一个 DOM，避免二次换行偏差。
window.__zzhubRenderReady = (async function fitCover() {
  try {
    const config = JSON.parse(document.getElementById("cover-config").textContent);
    const cover = document.querySelector(".cover");
    const area = document.querySelector(".text-area");
    const stack = document.querySelector(".text-stack");
    const signature = document.querySelector(".signature");
    const title = document.querySelector(".title");
    const subtitle = document.querySelector(".subtitle");
    // 大型 CJK 字体必须加载完成，不能用回退字体计算字号。
    await Promise.all(Object.values(config.typography).map(font => document.fonts.load(`${font.fontWeight} ${font.fontSize}px "${font.fontFamily}"`)));
    await document.fonts.ready;
    await Promise.all([...document.images].map(image => image.decode()));
    area.style.bottom = `${config.layout.safeArea.bottom + signature.getBoundingClientRect().height + 32}px`;
    if (area.clientWidth <= 0 || area.clientHeight <= 0) throw new Error("封面安全区无法容纳文字和署名");
    function fit(ratio) {
      for (const role of ["title", "subtitle"]) {
        const font = config.typography[role];
        cover.style.setProperty(`--${role}-size`, `${font.minFontSize + (font.fontSize - font.minFontSize) * ratio}px`);
      }
      return stack.getBoundingClientRect().height <= area.clientHeight + 0.5
        && title.scrollWidth <= title.clientWidth + 1
        && subtitle.scrollWidth <= subtitle.clientWidth + 1;
    }
    if (!fit(0)) throw new Error("完整标题在最小字号下仍超出安全区，请缩短标题或调整主题字号、安全区");
    let low = 0;
    let high = 1;
    for (let iteration = 0; iteration < 12; iteration++) {
      const middle = (low + high) / 2;
      if (fit(middle)) low = middle;
      else high = middle;
    }
    fit(low);
    document.documentElement.dataset.coverStatus = "ready";
  } catch (error) {
    document.documentElement.dataset.coverStatus = "error";
    document.documentElement.dataset.coverError = encodeURIComponent(error instanceof Error ? error.message : String(error));
  }
})();
