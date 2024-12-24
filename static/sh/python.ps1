function env($name,$global,$val='__get') {
  $target = 'User'; if($global) {$target = 'Machine'}
  if($val -eq '__get') { [environment]::getEnvironmentVariable($name,$target) }
  else { [environment]::setEnvironmentVariable($name,$val,$target) }
}

#DARK# -nologo -x "#TMPL#" "#EXE#"
Start-Sleep -Seconds 1
@('path.msi', 'pip.msi') | ForEach-Object {
  Remove-Item "#TMPL#\AttachedContainer\$_"
}
(Get-ChildItem "#TMPL#\AttachedContainer\*.msi").FullName | ForEach-Object {
  if($((Get-Item $_).Basename) -eq 'appendpath') { return }
  try {
    # 启动安装过程
    $process = Start-Process msiexec.exe -ArgumentList "/a `"$_`" /qn TARGETDIR=`"#APPDIR#`"" -NoNewWindow -Wait -PassThru
    # 等待安装完成
    $process.WaitForExit()
    # 获取退出代码
    $exitCode = $process.ExitCode
    # 检查退出代码
    if ($exitCode -eq 0) {
      Write-Output "安装成功: $_"
    } else {
      Write-Output "安装失败，退出代码: $exitCode"
      exit 1
    }
  } catch {
    Write-Output "安装过程中发生错误: $_"
    exit 1
  }
}
Start-Sleep -Seconds 1
$pathext = (env 'PATHEXT' $true) -replace ';.PYW?', ''
env 'PATHEXT' $true "$pathext;.PY;.PYW"
