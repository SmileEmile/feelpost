# FeelPost 版本与发布管理

## 单一版本源

版本号以 `package.json` 的 `version` 为唯一来源。

当前版本：

```text
0.1.0
```

版本号遵循语义化版本：

- `PATCH`：修复 bug；
- `MINOR`：新增兼容功能；
- `MAJOR`：不兼容变更。

## 升级功能点

所有用户可感知的升级点写在 [`CHANGELOG.md`](CHANGELOG.md)。

发布前必须：

1. 更新 `package.json` 的 `version`；
2. 在 `CHANGELOG.md` 新增同版本章节；
3. 聚合为此版本编写 Added / Changed / Fixed；
4. 保证 GitHub tag 为 `v<version>`。

示例：

```markdown
## [0.2.0] - 2026-12-01

### Added

- 新增 xxx。

### Changed

- 调整 xxx。

### Fixed

- 修复 xxx。
```

## 本地生成 Release 说明

```bash
npm run release:check
```

会校验版本章节并生成：

```text
release-notes.md
```

如果 `package.json` 与 `CHANGELOG.md` 版本不一致，命令会失败。

## 发布流程

推荐使用 tag：

```bash
# 1. 更新 package.json 和 CHANGELOG.md
# 2. 提交
git add package.json CHANGELOG.md
git commit -m "release: v0.2.0"

# 3. 打 tag 并推送
git tag v0.2.0
git push origin main
git push origin v0.2.0
```

推送 tag 后 GitHub Actions 会：

1. 校验 tag 与 `package.json` 一致；
2. 构建 macOS DMG/ZIP；
3. 构建 Windows NSIS/Portable；
4. 上传 workflow artifacts；
5. 读取 `CHANGELOG.md` 对应版本章节；
6. 创建或更新 GitHub Release，版本名使用 `v<version>`，正文使用该章节。

也可以在 Actions 页面手动执行 `workflow_dispatch`，此时使用 `package.json` 当前版本作为 Release 版本。

## 产物命名

```text
FeelPost-<version>-arm64.dmg
FeelPost-<version>-x64.dmg
FeelPost-<version>-arm64.zip
FeelPost-<version>-x64.zip
FeelPost-<version>-x64-Setup.exe
FeelPost-<version>-x64-Portable.exe
```

## 注意事项

- `release-notes.md` 是生成文件，不提交；
- 不要在未更新 `CHANGELOG.md` 的情况下发布新版本；
- tag 与 package 版本不一致时，发布 job 会失败；
- macOS 未签名、Windows 未签名，正式分发前需补签名与公证。
