# 给 SignPath 的验收回复邮件(草稿)

回复 Phillip 那封"项目已批准"的邮件即可(保持同一邮件线程)。
发送前请确认两条 Signing Request URL:application binaries 那条已填入最近一次成功构建的请求;installer 那条 `[...]` 请在 SignPath 后台点开对应请求,复制浏览器地址栏补上(若想用最新一次构建的 installer 请求,两条都可替换成同一次构建的)。

---

**Subject:** Re: SignPath Foundation program — FlyEnv setup complete

Hi Phillip,

Thanks again for accepting FlyEnv into the SignPath Foundation program.

The setup is now complete and working end-to-end with the self-signed test certificate. Our GitHub Actions pipeline signs every Windows PE we ship, via two SignPath signing requests:

1. **All application binaries** (artifact configuration: `windows-app`) — signed during packaging, before the installer is built. This single request covers the main executable `FlyEnv.exe`, all bundled DLLs, native `.node` modules, the Go helper `flyenv-helper.exe`, and the NSIS-generated `elevate.exe` (UAC) and uninstaller. Files that already carry a valid signature (e.g. Microsoft-signed system DLLs) are detected and skipped.
2. **The installer and portable executables** (artifact configuration: `windows-installer`) — `FlyEnv-Setup-*.exe` and `FlyEnv-Portable-*.exe`, signed after packaging.

Both signing requests completed successfully under the `test-signing` policy, with origin verification and malware scanning passing:

- Application binaries signing request:
  [https://app.signpath.io/Web/4db4007d-ac9e-4889-a8d5-52d4a421d989/SigningRequests/90fc55a3-7fc4-416c-8638-57f078313339]
  [https://app.signpath.io/Web/4db4007d-ac9e-4889-a8d5-52d4a421d989/SigningRequests/9f40b667-ae15-4849-bc9c-529ee6ce0678]
  [https://app.signpath.io/Web/4db4007d-ac9e-4889-a8d5-52d4a421d989/SigningRequests/c0c78846-aca8-4718-b188-1e366a251a84]
- Installer signing request: [https://app.signpath.io/Web/4db4007d-ac9e-4889-a8d5-52d4a421d989/SigningRequests/973c08a3-c26f-428b-853c-0d6395b67d05]

Could you please review the setup and proceed with ordering and importing the production certificate? Once `release-signing` is active, we'll switch the pipeline over to the production policy.

Let me know if you need anything else from our side.

Best regards,
Pengfei
