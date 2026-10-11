# travel-album-html

豆包 Agent Skill：将照片、图片文件夹、PDF、Word（DOCX/DOC）或文字生成独立可翻页书籍 HTML。

- 照片采用杂志排版；PDF 保留原页；Word 与文字自动重排
- 支持放大、文件分享、在线发布和翻页视频导出
- 生成的是单个离线 HTML，照片和交互全部内嵌，无需网络即可打开

## 使用

```bash
python3 scripts/build_album.py <照片或文件夹路径...> -o <绝对路径>.html --title <标题> [--album-name <相册名>]
```

需 Pillow。PDF/Word/文字走 `scripts/build_document.py`，详见 `SKILL.md` 与 `references/`。

## 目录结构

```
SKILL.md                    # Skill 说明与使用流程
assets/album-tools.js       # 相册交互脚本（由生成脚本内嵌进 HTML）
scripts/                    # 生成脚本
references/                 # 详细流程参考（书动画、文档转书、分享与视频）
```

## 说明

- 分发相册只需最终生成的 HTML 一个文件；分发本 Skill 需保留完整目录。
- 相册中的地名、日期和文字以用户提供的信息为准。
