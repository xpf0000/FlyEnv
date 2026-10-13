# macOS 公证成功后的 stapling 网络失败

2026-10-13 的 x64 Actions 日志中，签名和 notarization 均已成功，随后 `xcrun stapler` 从 `api.apple-cloudkit.com` 获取票据时发生 `NSURLErrorDomain Code=-1005`，退出码 68。当前日志没有证据指向 x64 产物、签名证书或公证凭据错误。

`configs/electron-builder.ts` 的 `afterSign` 调用 `build/notarize.ts`，后者调用 `@electron/notarize`。本地锁定版本 3.1.1 在公证通过后才执行 stapling；其 `promise-retry` 回调未调用传入的 retry 函数，不能依赖该包装自动重试普通 rejection。

## 修复范围与失败边界

- 成功条件：公证通过并成功附加票据，随后交还 electron-builder 继续制作发布包。签名、公证和 stapling 都是必要依赖。
- 归属：仅构建期 `afterSign` hook；不涉及应用运行期模块、IPC 或服务生命周期。
- 初始失败必须同时满足 stapling 错误 68、CloudKit 域名、网络中断 `-1005` 或超时 `-1001`，才启动恢复。
- 保留已完成的签名和公证；恢复仅执行 `xcrun stapler staple -v <appPath>`，不重签、不重传公证、不重跑完整构建。
- 额外最多三次，分别等待 15、30、60 秒，每次命令设置 120 秒超时。后续命令仅在同类错误时继续；其他错误或重试耗尽直接抛出最后错误，阻断依赖它的打包步骤。
- 不变更工作流触发文件，不自动提交、推送或启动远程发布。

## 验证

`scripts/macos-notarize-retry-test.ts` 执行真实 hook，替换外部公证服务、命令与等待边界，覆盖断连恢复、网络超时恢复、连续断连后恢复、重试耗尽、不重复提交、永久错误和命令超时传播、正常成功及原有跳过逻辑。先在原实现上确认断连恢复用例失败，再实施修复。

本地验证不提交实际公证请求，也不能证明 GitHub runner 与 Apple 的实时连接已恢复。最终发布包仍需下一次 macOS Actions 构建验收。

本地已通过：新增恢复回归、现有 `macos-signing-workflow-test.ts`、两处 TypeScript 文件的严格类型检查与 ESLint、生产 `scripts/app-builder.ts` 的 esbuild 编译，以及 `git diff --check`。编译输出放在 `/tmp`，没有修改生成的构建文件。

参考：[Apple 自定义公证流程](https://developer.apple.com/documentation/security/customizing-the-notarization-workflow)、[@electron/notarize 3.1.1 源码](https://github.com/electron/notarize/blob/v3.1.1/src/index.ts)。
