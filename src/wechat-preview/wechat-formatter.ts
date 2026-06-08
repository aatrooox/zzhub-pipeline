export interface WechatExportTheme {
  containerStyle?: string
  footerText?: string
  footerStyle?: string
  fontFamily?: string
  bodyColor?: string
  mutedColor?: string
  primaryColor?: string
  dividerColor?: string
  blockquoteBorderColor?: string
  bodyLineHeight?: string
  bodyLetterSpacing?: string
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

// 微信公众号允许的标签白名单
const ALLOWED_TAGS = [
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'p',
  'blockquote',
  'ul',
  'ol',
  'li',
  'pre',
  'code',
  'span',
  'strong',
  'em',
  'b',
  'i',
  'u',
  's',
  'del',
  'a',
  'img',
  'br',
  'hr',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'section',
  'div', // div 会被转换为 section
  'figure',
  'figcaption',
]

// 允许的属性白名单
const ALLOWED_ATTRS: Record<string, string[]> = {
  '*': ['style', 'data-code-block'],
  'img': ['src', 'alt', 'width', 'height', 'data-src', 'data-ratio', 'data-w'],
  'a': ['href', 'target', 'title'],
  'th': ['colspan', 'rowspan', 'align'],
  'td': ['colspan', 'rowspan', 'align'],
}

// 需要提取的 CSS 属性白名单 (合并了 demo 中的 EffectCssAttrs)
const STYLE_WHITELIST = [
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'color',
  'text-align',
  'line-height',
  'letter-spacing', // 字间距
  'text-decoration',
  'background-color',
  'background-image',
  'border',
  'border-top',
  'border-right',
  'border-bottom',
  'border-left',
  'border-color',
  'border-width',
  'border-style',
  'border-radius',
  'padding',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'margin',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  // 'display', // 移除 display，防止 flex 布局复制导致缺少对齐属性错乱
  'width',
  'max-width',
  // 'height', // 移除 height，防止高度固定导致内容溢出
  'list-style-type',
  'list-style-position',
  'white-space',
  'word-break',
  'overflow-x',
  // 'vertical-align', // 移除 vertical-align，防止基线对齐问题
  'box-sizing',
  'text-size-adjust', // demo
]

// 排除的类名
const EXCLUDE_CLASS_LIST = [
  'md-editor-copy-button', // 复制按钮
  'md-editor-icon',
  'md-editor-katex-inline', // 不支持 kateX 公式导出
  'md-editor-katex-block',
  // Crepe Image Block exclude
  'operation',
  'operation-item',
  'image-resize-handle',
  'image-edit',
  // 'not-prose', // 排除不需要样式的元素
  // milkedown里代码块tools
  'cm-gutters',
  'cm-layer',
  'cm-announced',
  'tools',
]

// 驼峰转连字符
// const camelCaseToHyphen = (str: string) => {
//   return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()
// }

// 缓存
// const htmlCache: Record<string, Record<string, string>> = {}
// const styleValueCache: Record<string, string> = {}

interface LinkReference {
  text: string
  url: string
}

interface ImageDimensionInput {
  attrWidth?: string | null
  attrHeight?: string | null
  styleWidth?: string | null
  styleHeight?: string | null
  dataHeight?: string | null
  renderedWidth?: number | null
  renderedHeight?: number | null
}

export function normalizeCssLength(value?: string | null): string | null {
  const trimmed = value?.trim()
  if (!trimmed || trimmed === 'auto')
    return null
  if (/^\d+(?:\.\d+)?$/.test(trimmed))
    return `${trimmed}px`
  return trimmed
}

export function resolveImageDimensionStyles(input: ImageDimensionInput): string[] {
  const styles: string[] = []
  const renderedWidth = Number.isFinite(input.renderedWidth) ? input.renderedWidth ?? 0 : 0
  const renderedHeight = Number.isFinite(input.renderedHeight) ? input.renderedHeight ?? 0 : 0
  const explicitWidth = normalizeCssLength(input.attrWidth) ?? normalizeCssLength(input.styleWidth)
  const explicitHeight
    = normalizeCssLength(input.attrHeight)
      ?? normalizeCssLength(input.styleHeight)
      ?? normalizeCssLength(input.dataHeight)

  if (explicitWidth) {
    styles.push(`width: ${explicitWidth}`)
    styles.push(`height: ${explicitHeight ?? 'auto'}`)
    return styles
  }

  if (renderedWidth > 0) {
    styles.push(`width: ${Math.round(renderedWidth)}px`)
    styles.push('max-width: 100%')
  }
  else {
    styles.push('max-width: 100%')
  }

  if (explicitHeight) {
    styles.push(`height: ${explicitHeight}`)
  }
  else if (renderedHeight > 0) {
    styles.push(`height: ${Math.round(renderedHeight)}px`)
  }
  else {
    styles.push('height: auto')
  }

  return styles
}

export function rewriteStyleDeclarations(
  styleText: string,
  replacements: Record<string, string>,
): string {
  const entries = new Map<string, string>()

  styleText
    .split(';')
    .map(part => part.trim())
    .filter(Boolean)
    .forEach((part) => {
      const separatorIndex = part.indexOf(':')
      if (separatorIndex === -1)
        return
      const key = part.slice(0, separatorIndex).trim()
      const value = part.slice(separatorIndex + 1).trim()
      if (!key)
        return
      entries.set(key, value)
    })

  Object.entries(replacements).forEach(([key, value]) => {
    entries.set(key, value)
  })

  return Array.from(entries.entries())
    .map(([key, value]) => `${key}: ${value}`)
    .join('; ')
}

export function normalizeInlineEmphasisStyles(html: string): string {
  return html.replace(
    /<(strong|em|b|i)\b([^>]*?)style="([^"]*)"/g,
    (_match, tagName: string, beforeStyle: string, styleText: string) => {
      const normalized = rewriteStyleDeclarations(styleText, {
        'font-size': 'inherit',
        'line-height': 'inherit',
        'letter-spacing': 'inherit',
      })
      return `<${tagName}${beforeStyle}style="${normalized}"`
    },
  )
}

export function normalizeLinkStyles(html: string): string {
  return html.replace(
    /<(span|a)\b([^>]*?)style="([^"]*text-decoration:\s*underline[^"]*)"/g,
    (_match, tagName: string, beforeStyle: string, styleText: string) => {
      const normalized = rewriteStyleDeclarations(styleText, {
        'text-decoration': 'underline wavy',
      })
      return `<${tagName}${beforeStyle}style="${normalized}"`
    },
  )
}

export function normalizeHrStyles(html: string): string {
  return html.replace(
    /<hr\b([^>]*?)style="([^"]*)"/g,
    (_match, beforeStyle: string, styleText: string) => {
      const normalized = rewriteStyleDeclarations(styleText, {
        'display': 'block',
        'height': '0',
        'padding': '0',
        'padding-top': '0',
        'padding-right': '0',
        'padding-bottom': '0',
        'padding-left': '0',
        'margin': '2em 0',
        'background-color': 'transparent',
        'background-image': 'none',
        'border': 'none',
        'overflow-x': 'visible',
        'font-size': '0',
        'line-height': '0',
        'color': 'transparent',
      })
      return `<hr${beforeStyle}style="${normalized}"`
    },
  )
}

export interface ParsedTagInfo {
  tagName: string | null
  isClosing: boolean
  isSelfClosing: boolean
  preservesWhitespace: boolean
}

export function parseHtmlTag(tagText: string): ParsedTagInfo {
  const trimmed = tagText.trim()
  if (!trimmed.startsWith('<') || trimmed.startsWith('<!--')) {
    return {
      tagName: null,
      isClosing: false,
      isSelfClosing: false,
      preservesWhitespace: false,
    }
  }

  const isClosing = /^<\//.test(trimmed)
  const nameMatch = trimmed.match(/^<\/?\s*([a-zA-Z0-9-]+)/)
  const tagName = nameMatch?.[1]?.toLowerCase() ?? null
  const isSelfClosing = /\/\s*>$/.test(trimmed) || ['img', 'br', 'hr', 'input', 'meta', 'link'].includes(tagName ?? '')
  const preservesWhitespace = !isClosing && Boolean(
    tagName && ['pre', 'code'].includes(tagName)
      || /\sdata-code-block=(["'])true\1/i.test(trimmed),
  )

  return {
    tagName,
    isClosing,
    isSelfClosing,
    preservesWhitespace,
  }
}

export function minifyHtmlPreservingCodeBlocks(html: string): string {
  const openStack: Array<{ tagName: string; preservesWhitespace: boolean }> = []
  let result = ''
  let index = 0

  while (index < html.length) {
    const nextTagIndex = html.indexOf('<', index)

    if (nextTagIndex === -1) {
      const tail = html.slice(index)
      result += openStack.some(entry => entry.preservesWhitespace) || tail.trim() ? tail : ''
      break
    }

    const textChunk = html.slice(index, nextTagIndex)
    if (openStack.some(entry => entry.preservesWhitespace) || textChunk.trim()) {
      result += textChunk
    }

    let tagEndIndex = nextTagIndex
    let quoteChar: '"' | "'" | null = null
    while (tagEndIndex < html.length) {
      const char = html[tagEndIndex]
      if (quoteChar) {
        if (char === quoteChar) {
          quoteChar = null
        }
      }
      else if (char === '"' || char === "'") {
        quoteChar = char
      }
      else if (char === '>') {
        break
      }
      tagEndIndex += 1
    }

    const tagText = html.slice(nextTagIndex, Math.min(tagEndIndex + 1, html.length))
    result += tagText

    const tagInfo = parseHtmlTag(tagText)
    if (tagInfo.tagName) {
      if (tagInfo.isClosing) {
        for (let stackIndex = openStack.length - 1; stackIndex >= 0; stackIndex -= 1) {
          const entry = openStack[stackIndex]
          openStack.pop()
          if (entry?.tagName === tagInfo.tagName) {
            break
          }
        }
      }
      else if (!tagInfo.isSelfClosing) {
        openStack.push({
          tagName: tagInfo.tagName,
          preservesWhitespace: tagInfo.preservesWhitespace,
        })
      }
    }

    index = tagEndIndex + 1
  }

  return result.trim()
}

function removeStyle(styles: string[], property: string): void {
  for (let index = styles.length - 1; index >= 0; index -= 1) {
    if (styles[index]?.startsWith(`${property}:`)) {
      styles.splice(index, 1)
    }
  }
}

function setStyle(styles: string[], property: string, value: string): void {
  removeStyle(styles, property)
  styles.push(`${property}: ${value}`)
}

function isCodeContextElement(el: HTMLElement | null | undefined): boolean {
  if (!el)
    return false

  return el.hasAttribute('data-code-block')
    || el.classList.contains('milkdown-code-block')
    || el.classList.contains('cm-editor')
    || el.classList.contains('cm-content')
    || el.classList.contains('cm-line')
    || el.classList.contains('cm-lineWrapping')
    || el.tagName.toLowerCase() === 'pre'
}

function hasPreformattedComputedStyle(el: HTMLElement | null | undefined): boolean {
  if (!el || typeof window === 'undefined' || typeof window.getComputedStyle !== 'function')
    return false

  try {
    const computed = window.getComputedStyle(el)
    const whiteSpace = (computed.whiteSpace || '').toLowerCase()
    return whiteSpace.startsWith('pre')
  }
  catch {
    return false
  }
}

function hasBlockCodeAncestor(el: HTMLElement | null | undefined): boolean {
  let current = el
  while (current) {
    if (isCodeContextElement(current) || hasPreformattedComputedStyle(current))
      return true
    current = current.parentElement
  }
  return false
}

function normalizeTypography(
  styles: string[],
  originalTagName: string,
  outTagName: string,
  theme: WechatExportTheme,
  el: HTMLElement,
  isInCodeBlockContext: boolean,
): void {
  const fontFamily = theme.fontFamily
    ?? "'SweiCurveLeg', 'PingFang SC', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
  const bodyColor = theme.bodyColor ?? '#2f3a33'
  const mutedColor = theme.mutedColor ?? '#66756b'
  const primaryColor = theme.primaryColor ?? '#486b58'
  const dividerColor = theme.dividerColor ?? '#d8e0da'
  const blockquoteBorderColor = theme.blockquoteBorderColor ?? '#9cb2a3'
  const bodyLineHeight = theme.bodyLineHeight ?? '1.92'
  const bodyLetterSpacing = theme.bodyLetterSpacing ?? '0.03em'
  const parentTagName = el.parentElement?.tagName.toLowerCase()
  const isInsideCodeBlock = isInCodeBlockContext || hasBlockCodeAncestor(el)

  const clearTextFrame = () => {
    removeStyle(styles, 'width')
    removeStyle(styles, 'max-width')
    removeStyle(styles, 'font-family')
  }

  if (isInsideCodeBlock && (outTagName === 'span' || outTagName === 'strong' || outTagName === 'em' || outTagName === 'b' || outTagName === 'i' || outTagName === 'u' || outTagName === 's' || outTagName === 'del')) {
    clearTextFrame()
    setStyle(styles, 'font-family', 'inherit')
    setStyle(styles, 'font-size', 'inherit')
    setStyle(styles, 'line-height', 'inherit')
    setStyle(styles, 'letter-spacing', 'inherit')
    return
  }

  if (originalTagName === 'a' || outTagName === 'a') {
    clearTextFrame()
    setStyle(styles, 'font-family', fontFamily)
    setStyle(styles, 'font-size', 'inherit')
    setStyle(styles, 'color', primaryColor)
    setStyle(styles, 'text-decoration', 'underline wavy')
    setStyle(styles, 'line-height', bodyLineHeight)
    setStyle(styles, 'letter-spacing', bodyLetterSpacing)
    return
  }

  if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(originalTagName)) {
    clearTextFrame()
    setStyle(styles, 'font-family', fontFamily)

    if (originalTagName === 'h1') {
      setStyle(styles, 'font-weight', '700')
      setStyle(styles, 'color', bodyColor)
      setStyle(styles, 'font-size', '1.625rem')
      setStyle(styles, 'line-height', '1.3')
      setStyle(styles, 'letter-spacing', '-0.01em')
      setStyle(styles, 'margin', '3em 0 1em')
    }
    else if (originalTagName === 'h2') {
      setStyle(styles, 'font-weight', '700')
      setStyle(styles, 'color', primaryColor)
      setStyle(styles, 'font-size', '1.25rem')
      setStyle(styles, 'line-height', '1.35')
      setStyle(styles, 'letter-spacing', '0.02em')
      setStyle(styles, 'margin', '2.4em 0 0.9em')
      setStyle(styles, 'padding-left', '14px')
      setStyle(styles, 'border-left', `4px solid ${primaryColor}`)
    }
    else if (originalTagName === 'h3') {
      setStyle(styles, 'font-weight', '600')
      setStyle(styles, 'color', bodyColor)
      setStyle(styles, 'font-size', '1.125rem')
      setStyle(styles, 'line-height', '1.45')
      setStyle(styles, 'letter-spacing', '0.015em')
      setStyle(styles, 'margin', '2em 0 0.65em')
      setStyle(styles, 'padding-bottom', '0.5em')
      setStyle(styles, 'border-bottom', `1px solid ${dividerColor}`)
    }
    else {
      setStyle(styles, 'font-weight', '600')
      setStyle(styles, 'color', bodyColor)
      setStyle(styles, 'font-size', '1rem')
      setStyle(styles, 'line-height', '1.5')
      setStyle(styles, 'letter-spacing', '0.02em')
      setStyle(styles, 'margin', '1.25em 0 0.5em')
    }
    return
  }

  if (outTagName === 'p') {
    clearTextFrame()
    setStyle(styles, 'font-family', fontFamily)
    setStyle(styles, 'font-size', parentTagName === 'blockquote' ? '15px' : '16px')
    setStyle(styles, 'color', parentTagName === 'blockquote' ? mutedColor : bodyColor)
    setStyle(styles, 'line-height', bodyLineHeight)
    setStyle(styles, 'letter-spacing', bodyLetterSpacing)

    if (parentTagName === 'td' || parentTagName === 'th' || parentTagName === 'blockquote') {
      setStyle(styles, 'margin', '0')
    }
    else if (!(el.parentElement && (el.parentElement.classList.contains('content-dom') || el.parentElement.closest('.list-item')))) {
      setStyle(styles, 'margin', '1.12em 0')
    }
    return
  }

  if (outTagName === 'blockquote') {
    clearTextFrame()
    setStyle(styles, 'font-family', fontFamily)
    setStyle(styles, 'color', mutedColor)
    setStyle(styles, 'line-height', bodyLineHeight)
    setStyle(styles, 'letter-spacing', bodyLetterSpacing)
    setStyle(styles, 'margin', '1.35em 0')
    setStyle(styles, 'padding-left', '16px')
    setStyle(styles, 'border-left', `4px solid ${blockquoteBorderColor}`)
    setStyle(styles, 'background-color', 'rgba(72, 107, 88, 0.04)')
    return
  }

  if (outTagName === 'ul' || outTagName === 'ol') {
    clearTextFrame()
    setStyle(styles, 'font-family', fontFamily)
    setStyle(styles, 'color', bodyColor)
    setStyle(styles, 'line-height', bodyLineHeight)
    setStyle(styles, 'letter-spacing', bodyLetterSpacing)
    setStyle(styles, 'margin', '1em 0')
    setStyle(styles, 'padding-left', '1.2em')
    return
  }

  if (outTagName === 'figcaption') {
    clearTextFrame()
    setStyle(styles, 'font-family', fontFamily)
    setStyle(styles, 'font-size', '12px')
    setStyle(styles, 'line-height', '1.6')
    setStyle(styles, 'color', mutedColor)
    setStyle(styles, 'text-align', 'center')
    setStyle(styles, 'margin', '8px 0 0 0')
    return
  }

  if (outTagName === 'span' || outTagName === 'strong' || outTagName === 'em' || outTagName === 'b' || outTagName === 'i' || outTagName === 'u' || outTagName === 's' || outTagName === 'del') {
    clearTextFrame()
    setStyle(styles, 'font-family', fontFamily)
    setStyle(styles, 'font-size', 'inherit')
    setStyle(styles, 'line-height', bodyLineHeight)
    setStyle(styles, 'letter-spacing', bodyLetterSpacing)
    if (outTagName === 'strong' || outTagName === 'b') {
      setStyle(styles, 'font-weight', '700')
      setStyle(styles, 'color', primaryColor)
    }
    if (outTagName === 'em' || outTagName === 'i') {
      setStyle(styles, 'font-style', 'italic')
    }
    return
  }

  if (outTagName === 'hr') {
    clearTextFrame()
    removeStyle(styles, 'padding')
    removeStyle(styles, 'padding-top')
    removeStyle(styles, 'padding-right')
    removeStyle(styles, 'padding-bottom')
    removeStyle(styles, 'padding-left')
    removeStyle(styles, 'background-color')
    removeStyle(styles, 'background-image')
    removeStyle(styles, 'font-size')
    removeStyle(styles, 'line-height')
    removeStyle(styles, 'color')
    removeStyle(styles, 'overflow-x')
    removeStyle(styles, 'border-radius')
    setStyle(styles, 'border', 'none')
    setStyle(styles, 'border-top', `1px solid ${dividerColor}`)
    setStyle(styles, 'display', 'block')
    setStyle(styles, 'height', '0')
    setStyle(styles, 'padding', '0')
    setStyle(styles, 'background-color', 'transparent')
    setStyle(styles, 'overflow-x', 'visible')
    setStyle(styles, 'margin', '2em 0')
    return
  }

  if (outTagName === 'table') {
    clearTextFrame()
    setStyle(styles, 'font-family', fontFamily)
    setStyle(styles, 'font-size', '15px')
    setStyle(styles, 'line-height', '1.75')
    setStyle(styles, 'letter-spacing', '0.02em')
    setStyle(styles, 'width', '100%')
    setStyle(styles, 'margin', '1.4em 0')
    setStyle(styles, 'border-collapse', 'collapse')
    return
  }

  if (outTagName === 'th' || outTagName === 'td') {
    clearTextFrame()
    setStyle(styles, 'font-family', fontFamily)
    setStyle(styles, 'font-size', '15px')
    setStyle(styles, 'line-height', '1.72')
    setStyle(styles, 'letter-spacing', '0.02em')
    setStyle(styles, 'padding', '10px 12px')
    setStyle(styles, 'border', `1px solid ${dividerColor}`)
    if (outTagName === 'th') {
      setStyle(styles, 'font-weight', '700')
      setStyle(styles, 'background-color', 'rgba(72, 107, 88, 0.06)')
      setStyle(styles, 'color', primaryColor)
    }
    else {
      setStyle(styles, 'color', bodyColor)
      setStyle(styles, 'background-color', '#ffffff')
    }
  }
}

/**
 * 生成自定义的上标 HTML (用于替代 sup 标签)
 */
function getSupHtml(content: string): string {
  // 微信公众号不支持伪元素(inline style无法定义)，且 position: relative 兼容性不佳
  // 改用 vertical-align: super 配合 line-height: 0
  return `<span style="font-size: 0.75em; vertical-align: super; line-height: 0; margin: 0 2px;">${content}</span>`
}

/**
 * 获取单个 DOM 的带内联样式的 HTML (所见即所得模式)
 * @param node 要处理的节点
 * @param references 链接引用数组
 * @param targetStyles 目标样式属性列表
 * @param isInCodeBlock 是否在代码块内 (用于空格处理)
 */
function getOneDomCssStyle(
  node: Node,
  references: LinkReference[] = [],
  theme: WechatExportTheme = {},
  targetStyles?: string[],
  isInCodeBlock: boolean = false,
): string {
  if (!node)
    return ''

  // 文本节点
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.nodeValue || ''
    const textParent = node.parentElement
    const shouldPreserveWhitespace = isInCodeBlock || hasBlockCodeAncestor(textParent)
    // 在代码块内,保留所有空格和换行
    // 先转义 HTML 特殊字符，防止代码块内的 <img>, ![ ]( ) 等被下游正则误匹配
    if (shouldPreserveWhitespace && text) {
      return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/ /g, '\u00A0')
        .replace(/\t/g, '\u00A0\u00A0\u00A0\u00A0')
    }
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')

  }

  // 注释节点
  if (node.nodeType === Node.COMMENT_NODE) {
    return ''
  }

  // 只处理元素节点
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return ''
  }

  const el = node as HTMLElement
  const tagName = el.tagName.toLowerCase()

  // 标记代码块容器，用于后续压缩时保护
  let isCodeBlockContainer = false
  if (el.classList.contains('milkdown-code-block')) {
    isCodeBlockContainer = true
  }

  // 判断当前是否进入代码块区域（用于子节点的空格保护）
  // 包括 milkdown-code-block、CodeMirror 容器(cm-content、cm-editor)、以及传统的 pre/code
  const currentIsInCodeBlock = isInCodeBlock
    || isCodeContextElement(el)
    || hasPreformattedComputedStyle(el)

  // 降级兼容易处理：列表项 (LI) 统一转为 "- 文本" 形式
  // 解决微信端列表渲染的各种对齐、间距和兼容性问题
  if (tagName === 'li') {
    let contentHtml = ''
    let nestedListHtml = ''

    // 辅助函数：提取子元素内容，尽可能扁平化 Block 元素 (P, DIV, SECTION) 为 Inline，以保持文本流
    const extractInlineContent = (target: Node): string => {
      let resHtml = ''
      if (target.hasChildNodes()) {
        Array.from(target.childNodes).forEach((child) => {
          if (child.nodeType === Node.TEXT_NODE) {
            // 文本节点直接处理
            resHtml += getOneDomCssStyle(child, references, theme, [], isInCodeBlock)
          }
          else if (child.nodeType === Node.ELEMENT_NODE) {
            const cEl = child as HTMLElement
            const cTag = cEl.tagName.toLowerCase()

            // 忽略图标容器
            if (cEl.classList.contains('label-wrapper'))
              return

            // 嵌套列表稍后单独处理
            if (['ul', 'ol'].includes(cTag))
              return

            // 遇到 Block 容器，递归提取内容 (剥离外壳)
            if (['p', 'div', 'section', 'article', 'aside'].includes(cTag)) {
              resHtml += extractInlineContent(child)
            }
            else {
              // Inline 元素 (span, strong, code, a...), 保留样式
              resHtml += getOneDomCssStyle(child, references, theme, [], isInCodeBlock)
            }
          }
        })
      }
      return resHtml
    }

    // 1. 尝试获取 Milkdown/Crepe 的内容容器 (.content-dom)
    const contentDom = el.querySelector('.content-dom')
    if (contentDom) {
      contentHtml = extractInlineContent(contentDom)
    }
    else {
      // 2. 非 Standard Milkdown 结构，直接处理 li 子元素
      contentHtml = extractInlineContent(el)
    }

    // 3. 处理嵌套列表 (递归)
    const nestedLists = el.querySelectorAll(':scope > ul, :scope > ol')
    nestedLists.forEach((list) => {
      nestedListHtml += getOneDomCssStyle(list, references, theme, [], isInCodeBlock)
    })

    // 构造最终 HTML - 文本缩进布局 (Hanging Indent)
    // 摒弃 Flex，使用 margin/padding/text-indent 组合，兼容性最好
    const rowStyle = [
      'margin: 0.32em 0',
      `line-height: ${theme.bodyLineHeight ?? '1.92'}`,
      `color: ${theme.bodyColor ?? '#2f3a33'}`,
      'font-size: 15px',
      `font-family: ${theme.fontFamily ?? "'SweiCurveLeg', 'PingFang SC', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"}`,
      'padding-left: 1.35em',
      'text-indent: -0.92em',
      `letter-spacing: ${theme.bodyLetterSpacing ?? '0.03em'}`,
    ].join('; ')

    let rowHtml = ''
    if (contentHtml.trim()) {
      rowHtml = `<p style="${rowStyle}">- ${contentHtml}</p>`
    }

    return rowHtml + nestedListHtml
  }

  // 任务列表 checkbox 处理
  if (tagName === 'input' && (el.getAttribute('type') === 'checkbox' || el.classList.contains('task-list-item-checkbox'))) {
    const isChecked = el.hasAttribute('checked') || (el as HTMLInputElement).checked
    // 使用 emoji 替代 checkbox
    // 强制使用 inline-flex 并垂直居中，确保在 flex 容器中对齐
    return `<span style="display: inline-flex; align-items: center; justify-content: center; margin-right: 6px; width: 1.2em; height: 1.2em; font-size: 1em;">${isChecked ? '✅' : '❌'}</span>`
  }

  // sup 标签处理 (使用自定义样式替代)
  if (tagName === 'sup') {
    // 递归处理子元素以保留内部样式
    let childrenHtml = ''
    if (el.hasChildNodes()) {
      Array.from(el.childNodes).forEach((child) => {
        childrenHtml += getOneDomCssStyle(child, references, theme, undefined, currentIsInCodeBlock)
      })
    }
    else {
      childrenHtml = el.innerHTML
    }
    return getSupHtml(childrenHtml)
  }

  // Crepe 列表图标 (SVG) 处理 - 转为 Base64 图片
  // 宽松匹配：只要包含了 SVG 的 milkdown-icon (bullet 或 label) 都进行处理
  if (tagName === 'span' && el.classList.contains('milkdown-icon') && (el.classList.contains('bullet') || el.classList.contains('label'))) {
    try {
      const svg = el.querySelector('svg')
      if (svg) {
        const serializer = new XMLSerializer()
        const svgString = serializer.serializeToString(svg)
        // 修正颜色：强制使用黑色或深色
        // 对于 checkbox (label)，如果是 checked 状态，路径通常是 filled
        // 这里统一将 currentColor 替换为 #333333
        const fixedSvgString = svgString.replace(/currentColor/g, '#333333')

        const base64 = window.btoa(unescape(encodeURIComponent(fixedSvgString)))
        const imgSrc = `data:image/svg+xml;base64,${base64}`

        // 根据类型调整尺寸和位置
        let iconStyle = 'display: inline-block; flex-shrink: 0;'

        // 普通行高假设为 1.6 * 16px ≈ 25.6px 或 24px。视实际编辑器样式而定。
        // 这里按常见的 line-height: 1.6 (约 26px) 或 1.5 (24px) 来计算对齐。
        // 假设行高为 24px。

        if (el.classList.contains('label')) {
          // Task list checkbox (增大至 22px)
          iconStyle += 'width: 22px; height: 22px; margin-right: 4px;'
          // 垂直偏移：(24 - 22) / 2 = 1px。
          iconStyle += 'margin-top: 1px;'
        }
        else {
          // Bullet point (增大至 12px)
          iconStyle += 'width: 12px; height: 12px; margin-right: 6px;'
          // 垂直偏移：(24 - 12) / 2 = 6px。
          iconStyle += 'margin-top: 6px;'
        }

        // 返回 img
        return `<img src="${imgSrc}" style="${iconStyle}" />`
      }
    }
    catch (e) {
      console.error('List icon conversion failed', e)
    }
  }

  // Mermaid 图表处理 (转为图片)
  if (el.classList.contains('md-editor-mermaid')) {
    try {
      const svg = el.querySelector('svg')
      if (svg) {
        // 获取 SVG 的实际渲染宽度，避免图片过大
        const rect = svg.getBoundingClientRect()
        const width = rect.width

        const serializer = new XMLSerializer()
        const svgString = serializer.serializeToString(svg)
        // 处理 Unicode 字符
        const base64 = window.btoa(unescape(encodeURIComponent(svgString)))
        const imgSrc = `data:image/svg+xml;base64,${base64}`

        // 设置宽度样式，如果获取到了有效宽度
        const widthStyle = width ? `width: ${width}px;` : ''
        return `<img src="${imgSrc}" style="display: block; margin: 14px auto; max-width: 100%; ${widthStyle} height: auto;" />`
      }
    }
    catch (e) {
      console.error('Mermaid SVG conversion failed:', e)
    }
  }

  // 忽略无效标签 (Crepe caption-input 除外)
  if (['script', 'style', 'button', 'link', 'meta', 'input', 'textarea', 'select'].includes(tagName)) {
    // 特殊处理 Crepe 图片描述输入框
    if (tagName === 'input' && el.classList.contains('caption-input')) {
      const val = (el as HTMLInputElement).value
      if (!val)
        return ''
      // 返回居中的 figcaption（小号文字，无装饰符号）
      return `<figcaption style="margin-top: 8px; text-align: center; color: #8c8c8c; font-size: 12px; line-height: 1.6;">${val}</figcaption>`
    }
    return ''
  }

  // 检查排除的 class
  if (el.classList && Array.from(el.classList).some(c => EXCLUDE_CLASS_LIST.includes(c))) {
    return ''
  }

  // 标签过滤
  let outTagName = tagName
  if (!ALLOWED_TAGS.includes(tagName)) {
    if (el.hasChildNodes()) {
      let childrenHtml = ''
      Array.from(el.childNodes).forEach((child) => {
        childrenHtml += getOneDomCssStyle(child, references, theme, undefined, currentIsInCodeBlock)
      })
      return childrenHtml
    }
    return ''
  }

  // div -> section
  if (outTagName === 'div') {
    outTagName = 'section'
  }

  // h1-h6 -> section (避免移动端编辑器覆盖标题标签的默认样式)
  if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(outTagName)) {
    outTagName = 'section'
  }

  // 链接处理 (a -> span + sup)
  let linkSupHtml = ''
  if (outTagName === 'a') {
    const href = el.getAttribute('href')
    // 简单的外部链接判断 (包含 http 且不是锚点)
    if (href && (href.startsWith('http') || href.startsWith('//'))) {
      const text = el.textContent || ''
      references.push({ text, url: href })
      const index = references.length
      linkSupHtml = getSupHtml(`[${index}]`)
      // 将 a 标签转换为 span，保留样式但移除链接功能
      outTagName = 'span'
    }
  }
  // 获取计算样式
  const computedStyle = window.getComputedStyle(el)
  const styles: string[] = []

  // 确定要提取的属性列表
  const attrsToExtract = (targetStyles && targetStyles.length > 0) ? targetStyles : [...STYLE_WHITELIST]

  // Crepe 列表项 (List Item) 特殊处理
  if (el.classList.contains('list-item')) {
    // 强制使用 flex 布局，确保图标/序号和内容在同一行
    if (!attrsToExtract.includes('display'))
      attrsToExtract.push('display')
    if (!attrsToExtract.includes('align-items'))
      attrsToExtract.push('align-items')
    // 移除可能导致换行的属性
    // flex-direction 默认为 row
  }

  // Crepe 列表 Label (序号/图标容器) 特殊处理
  if (el.classList.contains('label-wrapper')) {
    if (!attrsToExtract.includes('display'))
      attrsToExtract.push('display')
    // 确保不换行
    if (!attrsToExtract.includes('white-space'))
      attrsToExtract.push('white-space')
  }

  // Crepe Image Wrapper 特殊处理：强制居中对齐
  if (el.classList.contains('image-wrapper')) {
    // 强制使用 flex 居中
    if (!attrsToExtract.includes('display'))
      attrsToExtract.push('display')
    if (!attrsToExtract.includes('justify-content'))
      attrsToExtract.push('justify-content')
    if (!attrsToExtract.includes('align-items'))
      attrsToExtract.push('align-items')
    if (!attrsToExtract.includes('flex-direction'))
      attrsToExtract.push('flex-direction')
  }

  // 特殊处理：对于任务列表项、代码块头部、代码块内容，保留 display 属性以维持布局
  if (el.classList.contains('task-list-item')
    || el.classList.contains('md-editor-code-head')
    || el.classList.contains('md-editor-code-flag') // 圆点容器
    || el.classList.contains('md-editor-code-action') // 语言标识容器
    || tagName === 'pre'
    || tagName === 'code') {
    if (!attrsToExtract.includes('display'))
      attrsToExtract.push('display')
    if (!attrsToExtract.includes('align-items'))
      attrsToExtract.push('align-items')
    if (!attrsToExtract.includes('justify-content'))
      attrsToExtract.push('justify-content')
    if (!attrsToExtract.includes('flex-direction'))
      attrsToExtract.push('flex-direction')
    if (!attrsToExtract.includes('flex-wrap'))
      attrsToExtract.push('flex-wrap')
  }

  // 特殊处理：代码块头部的圆点需要 height 和 width
  const parent = el.parentElement
  // 注意：实际类名是 md-editor-code-flag，不是 md-editor-code-head-dots
  const isCodeHeadDot = parent && parent.classList.contains('md-editor-code-flag') && tagName === 'span'
  // 如果是代码块头部的圆点，直接返回固定样式的 span，避免样式丢失
  if (isCodeHeadDot) {
    const computedDotStyle = window.getComputedStyle(el)
    const bgColor = computedDotStyle.backgroundColor || '#ff5f56'
    // 强制设置圆点样式：固定 12px 圆形，带背景色和右间距
    return `<span style="display: inline-block; width: 12px; height: 12px; border-radius: 50%; background-color: ${bgColor}; margin-right: 8px;"></span>`
  }

  attrsToExtract.forEach((attr) => {
    const camelAttr = attr.replace(/-([a-z])/g, g => (g[1] ? g[1].toUpperCase() : ''))
    let value = computedStyle[camelAttr as any]

    // 过滤无效值
    if (!value || value === 'initial' || value === 'none' || value === 'normal' || value === 'auto') {
      // 保留 display 的特殊情况
      if (attr === 'display') {
        // 忽略默认的 display
      }
      else {
        // 颜色透明忽略
        if (value === 'rgba(0, 0, 0, 0)')
          return
        // 0px 忽略
        if (value === '0px')
          return
        // 过滤 border: 0px ...
        if (attr.startsWith('border') && value && value.startsWith('0px') && attr !== 'border-radius')
          return
      }
    }

    // 强制保留的属性 (demo 逻辑)
    if (outTagName === 'pre') {
      if (attr === 'white-space')
        value = 'pre-wrap'
      if (attr === 'word-break')
        value = 'break-all'
      if (attr === 'overflow-x')
        value = 'auto'
    }

    // code 标签样式处理 (根据上下文判断)
    if (outTagName === 'code') {
      // 注意: 这里在提取样式阶段,具体处理在后面的专门代码块中
      // 此处先保留原逻辑,避免过早干预
      if (attr === 'white-space') {
        // 暂不强制设置,留给后续判断
        // value = 'pre-wrap'
      }
    }

    // 微信公众号不支持 grid 布局，转换为 flex
    if (attr === 'display' && value === 'grid') {
      value = 'flex'
    }

    if (value) {
      styles.push(`${attr}:${value}`)
    }
  })

  // Crepe 列表项强制样式修正
  if (el.classList.contains('list-item')) {
    // 强制 Flex Row
    // 移除可能存在的 block
    const displayIdx = styles.findIndex(s => s.startsWith('display:'))
    if (displayIdx > -1)
      styles.splice(displayIdx, 1)
    styles.push('display: flex')

    // 顶部对齐或基线对齐，防止文字过多时图标位置奇怪
    styles.push('align-items: flex-start')

    // 间距
    if (!styles.some(s => s.startsWith('margin-bottom:'))) {
      styles.push('margin-bottom: 2px')
    }
  }

  // Crepe 列表 Label 修正
  if (el.classList.contains('label-wrapper')) {
    styles.push('flex-shrink: 0') // 防止被压缩
    styles.push('margin-right: 6px') // 和内容的间距
    // 移除了 margin-top: 2px，因为现在通过 icon 的 margin-top 来控制精确对齐
  }

  // Crepe 列表内容修正
  if (el.classList.contains('content-dom')) {
    styles.push('flex: 1') // 占据剩余空间
    styles.push('min-width: 0') // 防止溢出
    // 强制移除 content-dom 可能存在的 margin，防止多行列表间距过大
    const marginIdx = styles.findIndex(s => s.startsWith('margin:'))
    if (marginIdx > -1)
      styles.splice(marginIdx, 1)
    styles.push('margin: 0')
  }

  // Crepe Image Wrapper 强制修正样式
  if (el.classList.contains('image-wrapper')) {
    // 强制宽度100%或居中
    const widthIdx = styles.findIndex(s => s.startsWith('width:'))
    if (widthIdx > -1)
      styles.splice(widthIdx, 1)
    styles.push('width: 100%') // 铺满容器，配合内部 img 的 margin: auto 或 flex center

    // 强制 margin: 0
    const marginIdx = styles.findIndex(s => s.startsWith('margin:'))
    if (marginIdx > -1)
      styles.splice(marginIdx, 1)
    styles.push('margin: 0')
  }

  // Blockquote 引用块特殊处理
  if (outTagName === 'blockquote') {
    // 移除原有 border-left (如果有)
    const borderLeftIdx = styles.findIndex(s => s.startsWith('border-left:'))
    if (borderLeftIdx > -1)
      styles.splice(borderLeftIdx, 1)

    // 移除原有 padding-left
    const paddingLeftIdx = styles.findIndex(s => s.startsWith('padding-left:'))
    if (paddingLeftIdx > -1)
      styles.splice(paddingLeftIdx, 1)

    // 移除原有 color
    const colorIdx = styles.findIndex(s => s.startsWith('color:'))
    if (colorIdx > -1)
      styles.splice(colorIdx, 1)

    // 注入模拟的引用条样式 (Github 风格)
    styles.push(`border-left: 4px solid ${theme.blockquoteBorderColor ?? '#9cb2a3'}`)
    styles.push('padding-left: 16px')
    styles.push(`color: ${theme.mutedColor ?? '#66756b'}`)
    // 确保有垂直间距
    if (!styles.some(s => s.startsWith('margin:'))) {
      styles.push('margin-top: 1.2em')
      styles.push('margin-bottom: 1.2em')
    }
  }

  // 列表项特殊处理 (li)
  if (outTagName === 'li') {
    // 强制移除 li 自身的 margin/padding，防止额外间距
    const marginIdx = styles.findIndex(s => s.startsWith('margin:'))
    if (marginIdx > -1)
      styles.splice(marginIdx, 1)

    // 只保留极小的底部间距
    const marginBottomIdx = styles.findIndex(s => s.startsWith('margin-bottom:'))
    if (marginBottomIdx > -1)
      styles.splice(marginBottomIdx, 1)
    styles.push('margin-bottom: 2px')

    const paddingIdx = styles.findIndex(s => s.startsWith('padding:'))
    if (paddingIdx > -1)
      styles.splice(paddingIdx, 1)
    styles.push('padding: 0')

    // 强制移除 list-style，防止任务列表出现双重标记
    if (el.classList.contains('task-list-item')) {
      styles.push('list-style: none')

      // 强制 Flex 布局
      // 先移除可能存在的 display (比如 block)
      const displayIdx = styles.findIndex(s => s.startsWith('display:'))
      if (displayIdx > -1)
        styles.splice(displayIdx, 1)
      styles.push('display: flex')

      // 强制移除可能存在的 align-items: normal，然后设置为 flex-start 以确保多行文本时图标顶对齐
      const alignIdx = styles.findIndex(s => s.startsWith('align-items:'))
      if (alignIdx > -1)
        styles.splice(alignIdx, 1)
      styles.push('align-items: flex-start')
    }
  }

  // 代码块头部特殊处理 (grid -> flex 布局兼容)
  if (el.classList.contains('md-editor-code-head')) {
    // 确保使用 flex 布局
    const displayIdx = styles.findIndex(s => s.startsWith('display:'))
    if (displayIdx > -1)
      styles.splice(displayIdx, 1)
    styles.push('display: flex')
    // 强制横向排列
    const flexDirIdx = styles.findIndex(s => s.startsWith('flex-direction:'))
    if (flexDirIdx > -1)
      styles.splice(flexDirIdx, 1)
    styles.push('flex-direction: row')
    // 左右分布
    if (!styles.some(s => s.startsWith('justify-content:'))) {
      styles.push('justify-content: space-between')
    }
    // 垂直居中
    if (!styles.some(s => s.startsWith('align-items:'))) {
      styles.push('align-items: center')
    }
    // 移除固定宽度，让内容自适应
    const widthIdx = styles.findIndex(s => s.startsWith('width:'))
    if (widthIdx > -1)
      styles.splice(widthIdx, 1)
    styles.push('width: 100%')
    // 强制高度为紧凑的小细条
    const heightIdx = styles.findIndex(s => s.startsWith('height:'))
    if (heightIdx > -1)
      styles.splice(heightIdx, 1)
    // 移除可能导致高度问题的 line-height
    const lineHeightIdx = styles.findIndex(s => s.startsWith('line-height:'))
    if (lineHeightIdx > -1)
      styles.splice(lineHeightIdx, 1)
    styles.push('height: 32px')
    styles.push('line-height: 32px')
    styles.push('padding: 0 12px')
  }

  // 代码块头部的圆点容器特殊处理
  if (el.classList.contains('md-editor-code-flag')) {
    // 移除固定宽度，使用自适应
    const widthIdx = styles.findIndex(s => s.startsWith('width:'))
    if (widthIdx > -1)
      styles.splice(widthIdx, 1)
    styles.push('width: auto')
    // 确保是 flex
    const displayIdx = styles.findIndex(s => s.startsWith('display:'))
    if (displayIdx > -1)
      styles.splice(displayIdx, 1)
    styles.push('display: flex')
    styles.push('align-items: center')
    styles.push('flex-direction: row')
  }

  // 代码块头部的语言标识容器特殊处理
  if (el.classList.contains('md-editor-code-action')) {
    // 移除固定宽度，使用自适应
    const widthIdx = styles.findIndex(s => s.startsWith('width:'))
    if (widthIdx > -1)
      styles.splice(widthIdx, 1)
    styles.push('width: auto')
    // 确保是 flex 横向排列
    const displayIdx = styles.findIndex(s => s.startsWith('display:'))
    if (displayIdx > -1)
      styles.splice(displayIdx, 1)
    styles.push('display: flex')
    styles.push('align-items: center')
    styles.push('flex-direction: row')
  }

  // Milkdown 代码块容器特殊处理
  if (el.classList.contains('milkdown-code-block')) {
    // 移除原有 padding (工具栏相关的大 padding)
    const paddingIdx = styles.findIndex(s => s.startsWith('padding:'))
    if (paddingIdx > -1)
      styles.splice(paddingIdx, 1)
    // 强制设置紧凑的 padding
    styles.push('padding: 10px')
  }

  // 语言标识 span 特殊处理
  if (el.classList.contains('md-editor-code-lang')) {
    // 移除固定宽度
    const widthIdx = styles.findIndex(s => s.startsWith('width:'))
    if (widthIdx > -1)
      styles.splice(widthIdx, 1)
    styles.push('width: auto')
    // 确保横向显示
    const displayIdx = styles.findIndex(s => s.startsWith('display:'))
    if (displayIdx > -1)
      styles.splice(displayIdx, 1)
    styles.push('display: inline-block')
    // 调整行高
    const lineHeightIdx = styles.findIndex(s => s.startsWith('line-height:'))
    if (lineHeightIdx > -1)
      styles.splice(lineHeightIdx, 1)
    styles.push('line-height: 1')
  }

  // code 标签特殊处理
  if (outTagName === 'code') {
    // 判断是否为行内 code (父元素不是 pre)
    const isInlineCode = !parent || parent.tagName.toLowerCase() !== 'pre'

    if (isInlineCode) {
      // 行内 code: 作为强调样式,允许正常折行
      // 移除可能导致不换行的样式
      const whiteSpaceIdx = styles.findIndex(s => s.startsWith('white-space:'))
      if (whiteSpaceIdx > -1)
        styles.splice(whiteSpaceIdx, 1)
      styles.push('white-space: normal')

      // 允许单词内断行,避免单词过长撑破布局
      if (!styles.some(s => s.startsWith('word-break:')))
        styles.push('word-break: break-word')

      // 移除固定宽度,防止安卓机型显示异常
      const widthIdx = styles.findIndex(s => s.startsWith('width:'))
      if (widthIdx > -1)
        styles.splice(widthIdx, 1)

      const maxWidthIdx = styles.findIndex(s => s.startsWith('max-width:'))
      if (maxWidthIdx > -1)
        styles.splice(maxWidthIdx, 1)

      // 确保 inline 显示,不独占一行
      const displayIdx = styles.findIndex(s => s.startsWith('display:'))
      if (displayIdx > -1)
        styles.splice(displayIdx, 1)
      styles.push('display: inline')

      // 移除可能存在的固定高度
      const heightIdx = styles.findIndex(s => s.startsWith('height:'))
      if (heightIdx > -1)
        styles.splice(heightIdx, 1)
    }
    else {
      // 代码块内的 code: 保留空格和换行
      if (!styles.some(s => s.startsWith('white-space:')))
        styles.push('white-space: pre-wrap')
      if (!styles.some(s => s.startsWith('word-break:')))
        styles.push('word-break: break-all')
    }
  }

  // pre 标签特殊处理 (确保空格和换行保留)
  if (outTagName === 'pre') {
    if (!styles.some(s => s.startsWith('white-space:'))) {
      styles.push('white-space: pre-wrap')
    }
  }

  // 图片特殊处理
  if (outTagName === 'img') {
    // 获取图片在页面上的实际渲染尺寸
    const rect = el.getBoundingClientRect()
    const renderedWidth = rect.width
    const renderedHeight = rect.height

    // 移除可能存在的固定宽高
    const widthIdx = styles.findIndex(s => s.startsWith('width:'))
    if (widthIdx > -1)
      styles.splice(widthIdx, 1)
    const heightIdx = styles.findIndex(s => s.startsWith('height:'))
    if (heightIdx > -1)
      styles.splice(heightIdx, 1)
    const maxWidthIdx = styles.findIndex(s => s.startsWith('max-width:'))
    if (maxWidthIdx > -1)
      styles.splice(maxWidthIdx, 1)

    styles.push(...resolveImageDimensionStyles({
      attrWidth: el.getAttribute('width'),
      attrHeight: el.getAttribute('height'),
      styleWidth: el.style.width,
      styleHeight: el.style.height,
      dataHeight: el.getAttribute('data-height'),
      renderedWidth,
      renderedHeight,
    }))

    if (!styles.some(s => s.startsWith('display:'))) {
      styles.push('display: block')
      styles.push('margin: 14px auto')
    }
  }

  normalizeTypography(styles, tagName, outTagName, theme, el, currentIsInCodeBlock)

  const styleStr = styles.join(';')

  // 递归处理子元素
  let childrenHtml = ''
  if (el.childNodes && el.childNodes.length > 0) {
    Array.from(el.childNodes).forEach((child) => {
      // 针对 pre/code 的子元素进行样式精简，防止污染
      // 如果当前是 pre，子元素只保留颜色等基本属性？
      // demo 逻辑：child.tagName === 'pre' ? ['color'] : []
      // 这里我们采用更智能的策略：如果父级是 pre/code，子级 span (通常是高亮) 只保留颜色和字体样式
      let childTargetStyles: string[] | undefined
      if (['pre', 'code'].includes(outTagName) && child.nodeName === 'SPAN') {
        childTargetStyles = ['color', 'font-weight', 'font-style', 'text-decoration', 'background-color', 'white-space']
      }

        childrenHtml += getOneDomCssStyle(child, references, theme, childTargetStyles, currentIsInCodeBlock)
    })
  }
  else {
    // 如果没有子节点 (可能是空标签，或者某些特殊情况)，尝试使用 innerHTML 作为兜底
    // 注意：这可能会导致内部标签没有被内联样式处理，但至少能保留内容
    if (el.innerHTML) {
      childrenHtml = el.innerHTML
    }
  }

  // 组装属性
  const attrs: string[] = []
  if (styleStr) {
    // 修复 font-family 等可能包含双引号导致 style 属性截断的问题
    const safeStyleStr = styleStr.replace(/"/g, '\'')
    attrs.push(`style="${safeStyleStr}"`)
  }

  // 添加代码块标记
  if (isCodeBlockContainer) {
    attrs.push('data-code-block="true"')
  }

  const allowedForTag = ALLOWED_ATTRS[outTagName] || []
  const globalAllowed = ALLOWED_ATTRS['*'] || []
  const allAllowed = new Set([...allowedForTag, ...globalAllowed])

  Array.from(el.attributes).forEach((attr) => {
    if (allAllowed.has(attr.name)) {
      if (attr.name === 'style')
        return
      attrs.push(`${attr.name}="${attr.value}"`)
    }
  })

  if (['img', 'br', 'hr'].includes(outTagName)) {
    return `<${outTagName} ${attrs.join(' ')} />`
  }

  // 如果是链接，在内容后面追加上标
  return `<${outTagName} ${attrs.join(' ')}>${childrenHtml}</${outTagName}>${linkSupHtml}`
}

/**
 * 生成微信公众号格式的 HTML
 */
export const getWeChatStyledHTML = (rootEl: HTMLElement, theme: WechatExportTheme = {}): string => {
  if (!rootEl)
    return ''

  // 清空缓存 (如果启用了缓存)
  // htmlCache = {}
  // styleValueCache = {}

  // 外层容器样式
  const containerStyle = theme.containerStyle || `
    padding: 20px 16px;
    background-size: 20px 20px;
    background-position: center center;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    font-size: 16px;
    color: #333;
    word-wrap: break-word;
    letter-spacing: 2px;
  `.replace(/\s+/g, ' ').trim()

  const references: LinkReference[] = []
  let contentHtml = ''
  Array.from(rootEl.childNodes).forEach((child) => {
      contentHtml += getOneDomCssStyle(child, references, theme)
  })

  // 生成相关链接部分
  let referencesHtml = ''
  if (references.length > 0) {
    const refList = references.map((ref, index) => {
      return `<li style="margin-bottom: 5px;">[${index + 1}] ${ref.text}: ${ref.url}</li>`
    }).join('')

    referencesHtml = `
      <section style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee;">
        <h3 style="font-size: 16px; font-weight: bold; margin-bottom: 10px;">相关链接</h3>
        <ul style="font-size: 14px; color: #666; padding-left: 20px; margin: 0;">
          ${refList}
        </ul>
      </section>
    `
  }

  const footerText = theme.footerText ?? 'Powered by ZotePad'
  const footerStyle = theme.footerStyle || 'margin-top: 32px; text-align: center; font-size: 12px; color: #999;'
  const footer = footerText
    ? `
    <section style="${footerStyle}">
      <p style="margin: 0;">${escapeHtml(footerText)}</p>
    </section>
  `
    : ''

  return `<section style="${containerStyle}">${contentHtml}${referencesHtml}${footer}</section>`
}

/**
 * 生成压缩版微信公众号格式的 HTML (适用于手机端公众号助手)
 */
export const getWeChatMinimalHTML = (rootEl: HTMLElement, theme: WechatExportTheme = {}): string => {
  if (!rootEl)
    return ''

  // 获取完整版 HTML
  let result = getWeChatStyledHTML(rootEl, theme)

  // 压缩 HTML：移除标签之间纯装饰性的空白文本节点，
  // 但保留 data-code-block / pre / code 内部的空格和换行。
  result = minifyHtmlPreservingCodeBlocks(result)

  return normalizeHrStyles(normalizeLinkStyles(normalizeInlineEmphasisStyles(result)))
}

/**
 * 复制 HTML 到剪贴板 (使用 ClipboardItem 以支持富文本)
 */
export const copyToClipboard = async (html: string) => {
  try {
    const blobHtml = new Blob([html], { type: 'text/html' })
    const blobText = new Blob([html], { type: 'text/plain' })
    const item = new ClipboardItem({
      'text/html': blobHtml,
      'text/plain': blobText,
    })
    await navigator.clipboard.write([item])
    return true
  }
  catch (e) {
    console.error('Copy failed:', e)
    return false
  }
}
