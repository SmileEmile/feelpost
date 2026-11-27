# FeelPost Changelog

版本来源：`package.json` 的 `version`。每次发布必须同时更新版本号和本文件对应章节，GitHub Actions 会使用该章节作为 Release 更新说明。

## [Unreleased]

## [0.1.0] - 2026-11-27

首个内部 Alpha 版本。

### Added

- 本地 Spring Boot 源码扫描：Controller、路径、方法、参数、DTO、Javadoc、校验注解；
- 扫描任务使用独立 `worker_threads`，支持进度、取消、候选 diff 与入库；
- 接口资产树、模块/包/手工目录、搜索、方法筛选、人工校正；
- 环境、全局参数、TLS、代理、超时与生效参数预览；
- HTTP 请求调试：Headers / Query / Path / Body / Cookies、响应示例、JSON 简化、请求取消；
- 用例快照、标签、搜索、详情、复制、删除、按标签批量删除；
- Markdown 文档：项目接口文档、单接口导出、筛选、复制、导出、渐进加载；
- 字段说明：请求体与响应 JSON 字段路径、类型、示例、手工说明；
- AI 字段说明：OpenAI-compatible、流式生成、Diff 应用、失败重试；
- AI 用例：场景选择、候选预览、标签编辑、导入当前环境；
- AI 用例文档：按接口分批、上下文超限拆分、单个 Markdown 合并、缓存复用、失败批次重试；
- AI 服务商预设：DeepSeek、通义千问、智谱 GLM、Kimi、MiniMax、Ollama、OpenAI、Anthropic Claude、Google Gemini、OpenRouter；
- 模型列表获取：通过兼容 `/models` 接口拉取并选择；
- AI 设置页状态校验、API Key 安全存储、连接测试失败重试；
- macOS DMG/ZIP、Windows NSIS/Portable 打包配置与 GitHub Actions 构建；
- 应用内 Message 提示、统一设置侧栏、接口 Tab 右键关闭、目录快捷操作。

### Changed

- 产品展示名统一为 FeelPost，技术标识保持 `feelpost`；
- 用例导出必须以标签为范围，AI 导出与普通导出并存；
- 文档页 AI 接入文档入口下线，统一使用「用例 → AI 导出」；
- 设置页采用与文档/环境一致的白色侧栏；
- 新建 HTTP 直接打开请求面板，不再经过额外表单。

### Fixed

- AI 测试连接偶发误报失败：HTTP 2xx 即视为连接成功；
- 响应示例变化后 AI 缓存正确失效；
- 请求方式/路径保存后接口 Tab 与左侧菜单同步更新；
- 加载计时固定宽度显示，避免页面晃动；
- 模型与服务商切换后连接验证状态正确失效；
- 修复 Windows CI 非法文件名；
- 修复 GitHub Actions 自动发布缺少 Token 的问题。
