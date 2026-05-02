# ascii-portrait-3-4 模板规范

比例：3:4 | 尺寸：900×1200 | 用途：把任意头像转换成多字符亮度映射海报

## 特点

- 输入一张头像，自动采样颜色与亮度
- 使用多字符集合重建轮廓，不是单一字符硬拼
- 保留头像的综合色气质，而不是只做黑白 ASCII
- 适合实验性头像海报、人物封面、账号视觉页

## 适用场景

- 用户要“字符头像海报”或“ASCII 人像海报”
- 用户给出一张头像，希望转成更有风格的视觉页
- 需要把头像做成独立海报，而不是插入长文正文

## 推荐命令

```bash
bun ./scripts/render-ascii-portrait.ts \
  --avatar /absolute/path/to/avatar.jpg \
  --title "Character Portrait" \
  --out tmp/ascii-portrait.png
```

需要更细腻的人像时：

```bash
bun ./scripts/render-ascii-portrait.ts \
  --avatar /absolute/path/to/avatar.jpg \
  --title "Character Portrait" \
  --columns 88 \
  --chars "@#X$%WM*+=-" \
  --out tmp/ascii-portrait-detail.png
```

## 参数说明

- `--avatar`：必填，输入头像
-- `--title`：海报标题
- `--out`：必填，输出 PNG 路径
- `--chars`：字符梯度；`ascii-portrait-3-4` 默认 `@#X$%WM*+=-`，仅使用更厚实的大写字符和符号
- `--columns`：横向采样列数，越大越细；默认 `auto`，按原图尺寸自动计算，并钳制在 `54–84`
- `--font-size`：字符字号；默认 `auto`，根据列数自动推导
- `--line-height`：字符行高；默认 `auto`，根据字号自动推导
- `--bg`：背景色；默认 `auto`，会基于头像中心区与边缘区的亮度差，自动在深底/浅底之间选择

- `--footer`：底部文字，默认 `公众号 · 早早集市`
- `--icon`：底部图标路径
- `--template`：模板名称，支持 `ascii-portrait-3-4`（默认）和 `ascii-portrait-tile`
- `--width`：画布宽度，默认 `900`
- `--height`：画布高度，默认 `1200`

## 使用建议

- 对比度强、人物和背景分离明显的头像效果最好
- 想更抽象：减少 `--columns`
- 想更还原：增加 `--columns` 并使用更长的 `--chars`
