param(
  [string]$FixturePath = (Join-Path $PSScriptRoot '../tmp/windows-privilege-timing/timing-powershell-fixtures.json')
)

# 此回归只使用内存流、生产短引导及生产 JSON 读取语句，不弹 UAC、不写系统文件。
# 先运行 timing-test 的 --self-check 生成计划；AST/编译通过无法发现 StreamReader 预读丢失，
# 因此这里使用真实 .NET 读取器验证代码帧、JSON 帧和父存活帧共用同一缓冲。
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$plans = Get-Content -LiteralPath $FixturePath -Encoding UTF8 -Raw | ConvertFrom-Json
$loader = $null
$jsonAssignment = $null
$nativeSource = $null
foreach ($plan in $plans) {
  $tokens = $null
  $errors = $null
  $ast = [System.Management.Automation.Language.Parser]::ParseInput($plan, [ref]$tokens, [ref]$errors)
  if ($errors.Count) { throw ($errors | Out-String) }
  if ($plan.Contains('[Console]::OpenStandardInput()')) { $loader = $plan }
  $assignment = $ast.Find({ param($item)
    $item -is [System.Management.Automation.Language.AssignmentStatementAst] -and
      $item.Left.Extent.Text -eq '$inputData'
  }, $true)
  if ($assignment) { $jsonAssignment = $assignment.Extent.Text }
  $compile = $ast.Find({ param($item)
    $item -is [System.Management.Automation.Language.CommandAst] -and
      $item.GetCommandName() -eq 'Add-Type'
  }, $true)
  if ($compile) { $nativeSource = $compile.CommandElements[2].Value }
}
if (-not $loader -or -not $jsonAssignment -or -not $nativeSource) {
  throw 'Missing production stdin/broker plans; run the current --self-check first'
}
if ($loader -match '\[Console\]::InputEncoding' -or $jsonAssignment -match '\[Console\]::ReadLine') {
  throw 'Production frames must use the shared explicit UTF-8 reader'
}
# 编译实际 native pipe/启动器代码，但不调用 Create、Launch 或 WatchParent。
Add-Type -TypeDefinition $nativeSource -ErrorAction Stop

$utf8 = [Text.UTF8Encoding]::new($false, $true)
$caseCount = 0
$prefetchCount = 0
$recreatedReaderLostFrames = 0
# Windows PowerShell 5.1 的无 BOM .ps1 默认代码页可能不是 UTF-8；显式码点保证
# 测到的确实是中文和 surrogate pair，不能因脚本本身被误解码而变成另一组字符串。
$unicodePath = [string][char]0x4E2D + [char]0x6587 + '/' + [char]0x8DEF + [char]0x5F84
# 按码点构造“开发环境”和“用户目录”，确保系统 PowerShell 5.1 下也测试真实中文 Windows 路径。
$envDirectory = -join (@(0x5F00, 0x53D1, 0x73AF, 0x5883) | ForEach-Object { [char]$_ })
$userDirectory = -join (@(0x7528, 0x6237, 0x76EE, 0x5F55) | ForEach-Object { [char]$_ })
$machinePath = 'D:\' + $envDirectory + '\PHP 8.3\bin'
$userPath = 'C:\Users\' + $userDirectory + '\AppData\Local\FlyEnv'
$systemPath = $machinePath + ';' + $userPath + ';%SystemRoot%\System32'
foreach ($padding in @(0, 31, 12000, 32000)) {
  foreach ($payloadSize in @(0, 6000, 100000)) {
    foreach ($withBom in @($false, $true)) {
    # 中文、emoji、路径转义、引号、反引号、百分号及换行均属于数据，不变成 shell 语法。
    $payload = @{
      payload = @{
        script = "protectedPath=$unicodePath; systemPath=$systemPath; emoji=$([char]0xD83D)$([char]0xDE42); quote='`"; literal=%PATH%; newline=`r`n" + ('x' * $payloadSize)
        paths = @($machinePath, $userPath)
        systemPath = $systemPath
        otherVars = @{ PHPROOT = $machinePath }
      }
      launchArguments = '-NoProfile -EncodedCommand FIXED_TEST_BOOTSTRAP'
    }
    $json = $payload | ConvertTo-Json -Depth 8 -Compress
    # 执行真实读取语句；其前后的观察语句仅记录输入位置和后续帧，不模拟读取算法。
    $body = '# ' + ('p' * $padding) + "`n" +
      '$script:StdinPrefetchPosition=$script:FlyEnvBrokerInput.BaseStream.Position; ' +
      $jsonAssignment + '; $script:StdinReadback=$inputData; ' +
      '$script:StdinHeartbeat=$script:FlyEnvBrokerInput.ReadLine(); ' +
      '$script:StdinEnd=$script:FlyEnvBrokerInput.ReadLine()'
    $code = [Convert]::ToBase64String($utf8.GetBytes($body))
    $codeFrame = $code
    if ($withBom) { $codeFrame = [string][char]0xFEFF + $code }
    $frame = $codeFrame + "`n" + $json + "`nPARENT_HEARTBEAT`n"
    $bytes = $utf8.GetBytes($frame)
    $testInputStream = [IO.MemoryStream]::new($bytes, $false)
    try {
      # 只替换 OS 输入句柄来源；生产短引导的建 reader、读代码、解码及调用原样执行。
      $testLoader = $loader.Replace('[Console]::OpenStandardInput()', '$testInputStream')
      & ([ScriptBlock]::Create($testLoader))
      if ($script:StdinReadback.payload.script -cne $payload.payload.script -or
          $script:StdinReadback.payload.paths[0] -cne $machinePath -or
          $script:StdinReadback.payload.paths[1] -cne $userPath -or
          $script:StdinReadback.payload.systemPath -cne $systemPath -or
          $script:StdinReadback.payload.otherVars.PHPROOT -cne $machinePath -or
          $script:StdinReadback.launchArguments -cne $payload.launchArguments -or
          $script:StdinHeartbeat -cne 'PARENT_HEARTBEAT' -or $null -ne $script:StdinEnd) {
        throw "Production stdin frame mismatch: padding=$padding, payloadSize=$payloadSize"
      }
      if ($script:StdinPrefetchPosition -gt $utf8.GetByteCount($codeFrame + "`n")) { $prefetchCount++ }
    } finally {
      if ($script:FlyEnvBrokerInput) { $script:FlyEnvBrokerInput.Dispose() }
      $testInputStream.Dispose()
    }

    # 对照复现旧问题：第一行后重建 reader，底层流位置已经越过被预读的 JSON 前缀。
    # 不需要修改实际 Console.In；使用相同内存流即可确认旧运输方式会丢数据。
    $oldStream = [IO.MemoryStream]::new($bytes, $false)
    $firstReader = [IO.StreamReader]::new($oldStream, $utf8, $false, 4096, $true)
    $secondReader = $null
    try {
      $null = $firstReader.ReadLine()
      $secondReader = [IO.StreamReader]::new($oldStream, $utf8, $false, 4096, $true)
      if ($secondReader.ReadLine() -cne $json) { $recreatedReaderLostFrames++ }
    } finally {
      if ($secondReader) { $secondReader.Dispose() }
      $firstReader.Dispose()
      $oldStream.Dispose()
    }
    $caseCount++
    }
  }
}
if ($prefetchCount -eq 0 -or $recreatedReaderLostFrames -eq 0) {
  throw 'Tests did not exercise prefetched frames or reproduce the old reader-reset failure'
}
# 不合法的 UTF-8 不应悄悄替换字符后执行；直接验证生产同样的严格 decoder 设置。
$invalidStream = [IO.MemoryStream]::new([byte[]](0xC3, 0x28, 0x0A), $false)
$invalidReader = [IO.StreamReader]::new($invalidStream, $utf8, $false, 4096, $true)
$invalidRejected = $false
try { $null = $invalidReader.ReadLine() } catch { $invalidRejected = $true }
finally { $invalidReader.Dispose(); $invalidStream.Dispose() }
if (-not $invalidRejected) { throw 'Invalid UTF-8 was accepted' }
Write-Output "Production stdin transport passed: $caseCount cases; prefetched=$prefetchCount; old-reader failures=$recreatedReaderLostFrames"
Write-Output "PowerShell AST plans passed: $($plans.Count); native C# compilation passed"
Write-Output 'Chinese Windows paths, PATH list and environment-variable values round-trip verified'
Write-Output "PowerShell version: $($PSVersionTable.PSVersion)"
