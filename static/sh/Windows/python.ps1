[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function env($name, $global, $val = '__get') {
  $target = 'User'
  if ($global) { $target = 'Machine' }
  if ($val -eq '__get') {
    [environment]::getEnvironmentVariable($name, $target)
  }
  else {
    [environment]::setEnvironmentVariable($name, $val, $target)
  }
}

cd "#DARKDIR#"
./dark.exe -nologo -x "#TMPL#" "#EXE#"
Start-Sleep -Seconds 1

@('path.msi', 'pip.msi') | ForEach-Object {
  Remove-Item "#TMPL#\AttachedContainer\$_"
}

(Get-ChildItem "#TMPL#\AttachedContainer\*.msi").FullName | ForEach-Object {
  if($((Get-Item $_).Basename) -eq 'appendpath') { return }
  try {
    $msiPath = $_
    $targetDir = "#APPDIR#"
    $arguments = "/a `"$msiPath`" /qn TARGETDIR=`"$targetDir`""
    Write-Output "Arguments: $arguments"
    $process = Start-Process msiexec.exe -ArgumentList $arguments -NoNewWindow -Wait -PassThru
    $process.WaitForExit()
    $exitCode = $process.ExitCode
    if ($exitCode -eq 0) {
      Write-Output "Installation successful: $_"
    } else {
      Write-Output "Installation failed with exit code: $exitCode"
      exit 1
    }
  } catch {
    Write-Output "Installation failed with error: $_"
    exit 1
  }
}
Start-Sleep -Seconds 1
$pathext = (env 'PATHEXT' $true) -replace ';.PYW?', ''
env 'PATHEXT' $true "$pathext;.PY;.PYW"
