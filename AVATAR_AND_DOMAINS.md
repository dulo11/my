# 雲博客动态头像与备用域名说明

本次修改 Butterfly 作者卡片头像的轮播速度，并继续保留既有首页公告和《联系》文章中的双域名；Hexo 首页布局、背景、樱花效果、站点规范域名和邮件地址没有改变。

## 动态头像

在 `source/img/avatar/` 下保留四款粉紫配色原 GIF（当前网站优先使用相应的 `*-smooth.webp` 修复版）：

- `star.gif` — 紫晶星芒
- `sakura.gif` — 水晶樱花
- `moon.gif` — 月亮星空
- `heart.gif` — 爱心云朵

`source/js/yun-avatar-cycle.js` 现在将四款做成**同一头像位置的慢速四合一轮播**：星芒 → 樱花 → 月亮 → 爱心云朵，每款停留 **4 秒**，完整一轮约 **16 秒**。每次完整刷新还会更换开始时显示的那一款；PJAX 导航不会重复开启定时器。网页现由 JS 依次显示四个修复版 WebP 动图，切换时使用淡入淡出。\n\n另提供离线下载用的 **真正四合一 GIF**（淡粉紫、深紫晶两套，每套可从不同图案开始），单个 GIF 16 帧、每帧 1 秒、完整循环 16 秒。

修改 `_config.butterfly.yml` 的 `avatar.img` 提供静态路径备用；只替换作者卡片图片，不替换文章内容。

## 2026-11-23 动态头像抖动修复

之前四款 `star.gif`、`sakura.gif`、`moon.gif`、`heart.gif` 是 **104×104 像素、2 帧、每帧 400ms** 的缩略动图。放大到手机作者卡片时容易锯齿；帧内容还存在轻微的上下位移，视觉上会出现一跳一跳的感觉。JavaScript 在两款之间直接更换 `img.src` 也会造成突然跳变。

为保留原图并减少跳动：

- 旧的四张 GIF 仍在 `source/img/avatar/`，没有删除。
- 新增 `scripts/build_smooth_avatars.py`，以原 GIF 为输入，归一化画面位置并补充渐变过渡帧。
- 新增 `star-smooth.webp`、`sakura-smooth.webp`、`moon-smooth.webp`、`heart-smooth.webp` 四张 **320×320、8 帧** 动态 WebP，每帧约 260ms。
- `_config.butterfly.yml` 的默认头像切换为 `star-smooth.webp`；`yun-avatar-cycle.js` 每 **4 秒**切换图案时，添加约 **620ms** 淡入淡出。
- 手机上仍可能看到少量由旧 104px 像素源产生的原始细节损失，WebP 无法凭空增加原图纹理。若以后需要完全高清，可将生成脚本改为使用更高分辨率的原始动图。
- 新 `.github/workflows/repair-avatar-assets.yml` 用于在更新生成脚本后自动构建动画文件（会提交生成的资源）；无需在访客浏览器运行 Python。

## 域名双入口

- 主站：`https://966405.xyz/`
- 备用：`https://zhou.com.jm/`
- Cloudflare 默认：`https://my-99d.pages.dev/`

相关链接添加在首页作者卡片下方的「公告」和 `source/_posts/联系.md` 中。没有修改 `_config.yml` 的 `url`（仍为 `966405.xyz`），也没有设置强制跳转。备用域名过期不会自动跳转，因此建议访客收藏主站和 Cloudflare 默认入口。

##部署和还原

仍然使用原有构建命令 `npm run build`，输出 `public`。更新源代码推送到 GitHub 后，Cloudflare Pages 自动部署。如果静态头像仍然是原来的蝴蝶，请先确认最新部署成功，检查 `/img/avatar/star.gif` 能否打开，再强制刷新清除缓存。

## 注意事项

作者卡片需要 Butterfly 主题正常渲染；如果你使用的 Theme 版本修改了头像 DOM 类名，需要同步修改 `yun-avatar-cycle.js` 中的选择器。

## 图案来源及使用说明

紫晶星芒、樱花、月亮、爱心云朵图案由对话中的 AI 图像生成工具根据需求产生，不是从图片网站下载的现成图库作品。按照 OpenAI 使用条款，在法律允许的范围内，用户拥有自己生成的输出，可用于网站头像。纯 AI 生成图案能否取得可对抗第三方的著作权、是否具有排他性，取决于适用法律与人类创作贡献，不能保证自动取得独占版权。
