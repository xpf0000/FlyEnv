function env($name,$global,$val='__get') {
  $target = 'User'; if($global) {$target = 'Machine'}
  if($val -eq '__get') { [environment]::getEnvironmentVariable($name,$target) }
  else { [environment]::setEnvironmentVariable($name,$val,$target) }
}

#DARK# -nologo -x "#TMPL#" "#EXE#"
@('path.msi', 'pip.msi') | ForEach-Object {
  Remove-Item "#TMPL#\AttachedContainer\$_"
}
(Get-ChildItem "#TMPL#\AttachedContainer\*.msi").FullName | ForEach-Object {
  if($((Get-Item $_).Basename) -eq 'appendpath') { return }
  msiexec.exe /a $_ /qn TARGETDIR="#APPDIR#"
}
Remove-Item "#TMPL#" -Force -Recurse
$pathext = (env 'PATHEXT' $true) -replace ';.PYW?', ''
env 'PATHEXT' $true "$pathext;.PY;.PYW"
