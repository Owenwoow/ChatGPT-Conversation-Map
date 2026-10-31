# 项目协作

使用简体中文。原生 JavaScript、Manifest V3，无运行时依赖、无远程脚本、无聊天数据上传。

核心模块：src/adapter.js（页面适配）、src/model.js（历史记录）、src/content.js（同步与导航）。

## 常用命令

- 安装开发依赖：npm install
- 单元测试：npm test
- 浏览器测试：npm run test:browser（先 npx playwright install chromium）
- 真实扩展测试：npm run test:extension（独立临时档案）
- 打包：npm run package

扩展直接加载仓库根目录。修改页面选择器集中在 adapter.js；扩展 UI 使用 Shadow DOM，聊天文本只能通过 textContent 渲染。
