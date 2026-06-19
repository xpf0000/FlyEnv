import type { AfterPackContext } from 'electron-builder'
import { join, relative, dirname, basename } from 'node:path'
import { spawnSync } from 'node:child_process'
import _fs from 'fs-extra'

const { readdirSync, statSync, removeSync, writeFileSync } = _fs

// 需要送 SignPath 签名的 PE 后缀
const SIGN_EXTS = ['.exe', '.dll', '.node']

interface SignOpts {
  orgId: string
  projectSlug: string
  policySlug: string
  artifactConfigSlug: string
}


function collectPeFiles(root: string): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name)
      const st = statSync(full)
      if (st.isDirectory()) {
        walk(full)
      } else if (SIGN_EXTS.some((e) => name.toLowerCase().endsWith(e))) {
        out.push(full)
      }
    }
  }
  walk(root)
  return out
}

// 生成在 Windows runner 上执行的 PowerShell 脚本:
// 1) 用 .NET ZipFile 按相对路径名打包收集到的 PE 文件(保留嵌套目录)
// 2) Submit-SigningRequest 提交 SignPath,等待完成,下载签名后的 zip
// 3) 逐 entry 解压覆盖回 appOutDir
function buildPsScript(appOutDir: string, relPaths: string[], opts: SignOpts, workName: string): string {
  const list = relPaths.map((p) => `'${p.replace(/'/g, "''")}'`).join(',\n    ')
  return `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$appDir = '${appOutDir.replace(/'/g, "''")}'
$work   = Join-Path $env:RUNNER_TEMP '${workName}'
$inZip  = Join-Path $work 'unsigned.zip'
$outZip = Join-Path $work 'signed.zip'
if (Test-Path $work) { Remove-Item -Recurse -Force $work }
New-Item -ItemType Directory -Path $work | Out-Null

# Relative paths (relative to appDir), used as zip entry names so structure can be restored
$rel = @(
    ${list}
)

# Pack by explicit entry name via .NET to avoid Compress-Archive flattening nested dirs.
# Two filters before packing:
#   1) Skip non-PE files (must start with 'MZ' header) - e.g. darwin/linux .node prebuilds
#      whose extension matches but content is Mach-O/ELF, which SignPath rejects.
#   2) Skip files already validly signed (e.g. Microsoft-signed dll).
function Test-IsPeFile {
  param([string]$Path)
  try {
    $fs = [System.IO.File]::OpenRead($Path)
    try {
      if ($fs.Length -lt 2) { return $false }
      $b0 = $fs.ReadByte(); $b1 = $fs.ReadByte()
      return ($b0 -eq 0x4D -and $b1 -eq 0x5A)
    } finally { $fs.Dispose() }
  } catch { return $false }
}

$zip = [System.IO.Compression.ZipFile]::Open($inZip, [System.IO.Compression.ZipArchiveMode]::Create)
$packed = 0
$skipped = 0
$nonpe = 0
try {
  foreach ($r in $rel) {
    $src = Join-Path $appDir $r
    if (-not (Test-IsPeFile $src)) {
      Write-Host ("[skip non-PE] {0}" -f $r)
      $nonpe++
      continue
    }
    $sig = Get-AuthenticodeSignature -FilePath $src
    if ($sig.Status -eq 'Valid') {
      Write-Host ("[skip already-signed] {0}" -f $r)
      $skipped++
      continue
    }
    $entryName = $r -replace '\\\\', '/'
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $src, $entryName) | Out-Null
    Write-Host ("[pack] {0}" -f $r)
    $packed++
  }
} finally {
  $zip.Dispose()
}
Write-Host ("[signpath] pack {0} file(s), skip {1} already-signed, skip {2} non-PE." -f $packed, $skipped, $nonpe)
if ($packed -eq 0) {
  Write-Host '[signpath] nothing to sign.'
  Remove-Item -Recurse -Force $work
  return
}

Import-Module SignPath
Submit-SigningRequest \`
  -InputArtifactPath $inZip \`
  -OutputArtifactPath $outZip \`
  -OrganizationId '${opts.orgId}' \`
  -ApiToken $env:SIGNPATH_API_TOKEN \`
  -ProjectSlug '${opts.projectSlug}' \`
  -SigningPolicySlug '${opts.policySlug}' \`
  -ArtifactConfigurationSlug '${opts.artifactConfigSlug}' \`
  -WaitForCompletion -Force \`
  -WaitForCompletionTimeoutInSeconds 1800

# Extract signed result entry by entry back into appDir (preserving original relative paths)
$signed = [System.IO.Compression.ZipFile]::OpenRead($outZip)
try {
  foreach ($e in $signed.Entries) {
    if ([string]::IsNullOrEmpty($e.Name)) { continue }
    $dest = Join-Path $appDir ($e.FullName -replace '/', '\\')
    $destDir = Split-Path $dest -Parent
    if (-not (Test-Path $destDir)) { New-Item -ItemType Directory -Path $destDir -Force | Out-Null }
    [System.IO.Compression.ZipFileExtensions]::ExtractToFile($e, $dest, $true)
  }
} finally {
  $signed.Dispose()
}

Remove-Item -Recurse -Force $work
Write-Host 'SignPath app-signing done.'
`
}

function resolveOpts(): SignOpts {
  return {
    orgId: process.env.SIGNPATH_ORGANIZATION_ID || '4db4007d-ac9e-4889-a8d5-52d4a421d989',
    projectSlug: process.env.SIGNPATH_PROJECT_SLUG || 'FlyEnv',
    policySlug: process.env.SIGNPATH_POLICY_SLUG || 'test-signing',
    artifactConfigSlug: process.env.SIGNPATH_APP_ARTIFACT_CONFIG_SLUG || 'windows-app'
  }
}

// 在 baseDir 内对给定相对路径集合做 SignPath 批量签名(生成 ps 脚本并执行)
function signViaSignPath(baseDir: string, relPaths: string[], opts: SignOpts, workName: string, tag: string) {
  const script = buildPsScript(baseDir, relPaths, opts, workName)
  const scriptPath = join(baseDir, '..', `${workName}-${tag}.ps1`)
  writeFileSync(scriptPath, script, 'utf-8')
  try {
    const res = spawnSync(
      'pwsh',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath],
      { stdio: 'inherit', env: process.env }
    )
    if (res.status !== 0) {
      throw new Error(`SignPath signing failed (exit ${res.status}, signal ${res.signal})`)
    }
  } finally {
    removeSync(scriptPath)
  }
}

export default async function (context: AfterPackContext) {
  if (context.electronPlatformName !== 'windows' && context.electronPlatformName !== 'win32') {
    return
  }

  // 本钩子由 electron-builder.win.ts 在 afterSign 阶段调用(rcedit 之后、NSIS 打包之前),
  // 确保对 FlyEnv.exe 的签名不会被 signApp 里的 rcedit 改写抹掉。
  // 守卫:本地构建(无 token)直接跳过,不影响开发
  const apiToken = process.env.SIGNPATH_API_TOKEN
  if (!apiToken) {
    console.log('[signpath] SIGNPATH_API_TOKEN not set, skip app code signing.')
    return
  }

  const opts = resolveOpts()
  const appOutDir = context.appOutDir
  const peFiles = collectPeFiles(appOutDir)
  if (peFiles.length === 0) {
    console.warn('[signpath] no PE files found under appOutDir, skip.')
    return
  }

  const relPaths = peFiles.map((f) => relative(appOutDir, f))
  console.log(`[signpath] submitting ${relPaths.length} PE files for app signing (policy=${opts.policySlug})`)
  signViaSignPath(appOutDir, relPaths, opts, 'signpath-app', `${context.arch}`)
}

// NSIS 阶段才生成的 PE(elevate.exe / 卸载器),afterPack/afterSign 钩子够不着。
// electron-builder 复制 elevate.exe 后会调 signIf → 触发 win.signtoolOptions.sign 自定义钩子。
// 该钩子对**所有** PE 都会触发,这里只对白名单内的文件真签,其余 no-op
// (FlyEnv.exe / dll 等由 afterSign 批量签;安装器外壳由 workflow 第二段签)。
const CUSTOM_SIGN_WHITELIST = ['elevate.exe', 'uninstall.exe']

export async function customSign(configuration: { path: string; isNest?: boolean }) {
  // electron-builder 默认对每个文件按 [sha1, sha256] 调用两次(isNest: false→true);
  // SignPath 一次签名即为双签,只在第一次(isNest=false)处理,避免重复请求。
  if (configuration.isNest) {
    return
  }
  const filePath = configuration.path
  const name = basename(filePath).toLowerCase()
  const hit =
    CUSTOM_SIGN_WHITELIST.includes(name) || name.includes('uninstall')
  if (!hit) {
    return // 非白名单文件:交给其它流程,这里不处理
  }

  if (!process.env.SIGNPATH_API_TOKEN) {
    console.log(`[signpath] SIGNPATH_API_TOKEN not set, skip signing ${name}.`)
    return
  }

  const opts = resolveOpts()
  const baseDir = dirname(filePath)
  console.log(`[signpath] custom-signing NSIS artifact: ${name}`)
  // 以该文件所在目录为基准,只把这一个文件送签;zip 内 entry 名即文件名,windows-app 配置的 *.exe 可匹配
  signViaSignPath(baseDir, [basename(filePath)], opts, 'signpath-nsis', name.replace(/[^a-z0-9]/g, '_'))
}


