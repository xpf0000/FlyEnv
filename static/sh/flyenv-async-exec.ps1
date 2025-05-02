[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::InputEncoding = [System.Text.Encoding]::UTF8

$env:LC_ALL = 'en_US.UTF-8'
$env:LANG = 'en_US.UTF-8'

#ENV#

$BIN = "#BIN#"
$ARGS = "#ARGS#"
$OUTLOG = "#OUTLOG#"
$ERRLOG = "#ERRLOG#"

$process = Start-Process -FilePath "$BIN" `
    -ArgumentList "$ARGS" `
    -WindowStyle Hidden `
    -PassThru `
    -RedirectStandardOutput "$OUTLOG" `
    -RedirectStandardError "$ERRLOG"

if ($process) {
    Write-Host "##FlyEnv-Process-ID$($process.Id)FlyEnv-Process-ID##"
}
else {
    Write-Error "Exec Failed"
    exit 1
}
