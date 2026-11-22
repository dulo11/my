# 雲博客动态头像与备用域名说明

本次仅修改 Butterfly 作者卡片头像、博客首页公告和《联系》文章；Hexo 首页布局、背景、樱花效果、站点规范域名和邮件地址没有改变。

## 动态头像

在 `source/img/avatar/` 下保存四款粉紫配色 GIF：

- `star.gif` — 紫晶星芒
- `sakura.gif` — 水晶樱花
- `moon.gif` — 月亮星空
- `heart.gif` — 爱心云朵

`source/js/yun-avatar-cycle.js` 会在**每次完整刷新页面**时按顺序切换下一款；同一次打开页面内只显示一款，不做定时轮播。使用 `sessionStorage` 记住上次的序号，避免刷新后随机碰巧重复。PJAX 页面局部切换时会保留当前头像。

修改 `_config.butterfly.yml` 的 `avatar.img` 提供静态路径备用；只替换作者卡片图片，不替换文章内容。

## 域名双入口

- 主站：`https://966405.xyz/`
- 备用：`https://zhou.com.jm/`
- Cloudflare 默认：`https://my-99d.pages.dev/`

相关链接添加在首页作者卡片下方的「公告」和 `source/_posts/联系.md` 中。没有修改 `_config.yml` 的 `url`（仍为 `966405.xyz`），也没有设置强制跳转。备用域名过期不会自动跳转，因此建议访客收藏主站和 Cloudflare 默认入口。

##部署和还原

仍然使用原有构建命令 `npm run build`，输出 `public`。更新源代码推送到 GitHub 后，Cloudflare Pages 自动部署。如果静态头像仍然是原来的蝴蝶，请先确认最新部署成功，检查 `/img/avatar/star.gif` 能否打开，再强制刷新清除缓存。

## 注意事项

作者卡片需要 Butterfly 主题正常渲染；如果你使用的 Theme 版本修改了头像 DOM 类名，需要同步修改 `yun-avatar-cycle.js` 中的选择器。
