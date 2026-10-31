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

## 本项目开发流程

- 默认使用本项目的轻量流程，不自动调用 `dev-task`；用户明确指定时按用户要求执行。
- 根据改动范围选择验证：文档改动检查内容和格式；界面改动验证相关浏览器交互；页面适配、历史状态和导航逻辑改动运行相关测试。
- 准备发布或改动核心行为时运行完整测试；测试通过后，若没有新的相关改动或未解决的问题，不重复运行。
- 开发用浏览器直接加载项目根目录；更新代码后重新加载扩展并刷新 ChatGPT 标签页。真实页面验收按改动需要进行，报告中区分自动测试与真实页面验证。
- 用户确认无需保留验收记录时，不重新建立专门的验收记录文件。
