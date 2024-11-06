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
  msiexec.exe /a $_ /qn TARGETDIR="#APPDIR#"
}
Start-Sleep -Seconds 1
$pathext = (env 'PATHEXT' $true) -replace ';.PYW?', ''
env 'PATHEXT' $true "$pathext;.PY;.PYW"
