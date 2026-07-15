---
title: 微信排版语义节点验收
slug: wechat-renderer-all-nodes
---

# 微信排版语义节点验收

# 一级标题：克制的中文编辑部

这是一段用于检查正文密度的中文。它包含 **加粗文字**、*强调文字*、~~删除文字~~、`inlineCode()`，以及一个[外部链接](https://example.com/reading-guide?from=wechat)。

这一行之后保留硬换行。\
下一行仍属于同一段，并包含[文内链接](#section-two)。

## 二级标题：清晰但不过度装饰

### 三级标题：细分信息层级

#### 四级标题：低频但仍然可辨

> 好的排版不是抢夺注意力，而是让内容更轻松地被读完。
>
> 引用可以有第二段，并保留 **重点信息**。

![排版示例图](../../imgx/assets/icons/logo.png "图片说明：克制、清晰、适合移动端阅读")

- 无序列表第一项
  - 嵌套列表包含 `nested-code`
  - 嵌套列表第二项
- 无序列表第二项

1. 有序列表第一步
2. 有序列表第二步
   1. 嵌套步骤
   2. 另一个嵌套步骤

- [x] 已完成的任务
- [ ] 尚未完成的任务

```typescript
type Article = {
  title: string;
  published: boolean;
};

const article: Article = {
  title: "保留代码缩进",
  published: false,
};
```

| 节点 | 微信标签 | 设计原则 |
| --- | --- | --- |
| 正文 | `p` | 16px 与舒展行高 |
| 代码 | `pre/code` | 单色、保留空白 |
| 图片 | `img` | 宽度不溢出 |

---

## 危险 HTML 清理

<div onclick="alert('x')" style="display: grid; position: fixed">
  <script>alert('never')</script>
  <p onmouseover="alert('x')" style="color: var(--missing-color)">危险容器里的安全文本</p>
  <img src="javascript:alert('x')" onerror="alert('x')" alt="危险图片">
</div>

文末再放一个[资料链接](https://example.org/reference)，用于检查编号脚注与“相关链接”。
