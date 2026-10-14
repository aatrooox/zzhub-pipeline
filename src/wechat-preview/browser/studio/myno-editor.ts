import { Crepe } from "@milkdown/crepe";
import { getCombinedMilkdownPlugins } from "@akairos/milkdown-article-plugins";
import {
  articleBlockMenu,
  articleInlineToolbar,
  articleInlineTopBar,
  getEditorView,
  getParser,
} from "./milkdown-article-menu";

import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/frame.css";
import "@akairos/milkdown-article-style/tokens-default.css";
import "@akairos/milkdown-article-style/article.css";

export interface MynoEditorOptions {
  root: HTMLElement;
  defaultValue?: string;
  readonly?: boolean;
  placeholder?: string;
  onMarkdownChange?: (markdown: string) => void;
}

export class MynoEditor {
  private crepe: Crepe | null = null;
  private options: MynoEditorOptions;
  private isDestroyed = false;

  constructor(options: MynoEditorOptions) {
    this.options = options;
  }

  async create(): Promise<Crepe> {
    const { root, defaultValue = "", readonly = false, placeholder = "输入内容，或输入 / 快速插入文章组件..." } = this.options;

    const crepe = new Crepe({
      root,
      defaultValue,
      features: readonly
        ? {
            [Crepe.Feature.BlockEdit]: false,
            [Crepe.Feature.LinkTooltip]: false,
            [Crepe.Feature.Toolbar]: false,
            [Crepe.Feature.TopBar]: false,
          }
        : undefined,
      featureConfigs: {
        [Crepe.Feature.BlockEdit]: {
          buildMenu: articleBlockMenu,
        },
        [Crepe.Feature.Toolbar]: {
          buildToolbar: articleInlineToolbar,
        },
        [Crepe.Feature.TopBar]: {
          buildTopBar: articleInlineTopBar,
        },
        placeholder: {
          text: placeholder,
          mode: "doc",
        },
      },
    });

    crepe.editor.use(getCombinedMilkdownPlugins());

    crepe.on((listener) => {
      listener.markdownUpdated((_ctx, markdown) => {
        if (!this.isDestroyed && this.options.onMarkdownChange) {
          this.options.onMarkdownChange(markdown);
        }
      });
    });

    await crepe.create();
    crepe.setReadonly(readonly);

    crepe.editor.action((ctx) => {
      const view = getEditorView(ctx);
      if (view?.dom) {
        view.dom.classList.add("zzhub-wechat-article");
      }
    });

    this.crepe = crepe;
    return crepe;
  }

  getMarkdown(): string {
    if (!this.crepe) return this.options.defaultValue || "";
    return this.crepe.getMarkdown();
  }

  setMarkdown(markdown: string) {
    if (!this.crepe) return;
    this.crepe.editor.action((ctx) => {
      const view = getEditorView(ctx);
      const parser = getParser(ctx);
      if (!view || !parser) return;
      const doc = parser(markdown);
      if (!doc) return;
      const { state } = view;
      const tr = state.tr.replaceWith(0, state.doc.content.size, doc.content);
      view.dispatch(tr);
    });
  }

  setReadonly(readonly: boolean) {
    this.crepe?.setReadonly(readonly);
  }

  getCrepe(): Crepe | null {
    return this.crepe;
  }

  async destroy() {
    this.isDestroyed = true;
    if (this.crepe) {
      await this.crepe.destroy();
      this.crepe = null;
    }
  }
}
