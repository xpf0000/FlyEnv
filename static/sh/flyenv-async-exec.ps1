[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::InputEncoding = [System.Text.Encoding]::UTF8

$env:LC_ALL = 'en_US.UTF-8'
$env:LANG = 'en_US.UTF-8'

$BIN = "#BIN#"
$ARGS = "#ARGS#"
$OUTLOG = "#OUTLOG#"
$ERRLOG = "#ERRLOG#"

"" | Out-File -FilePath $OUTLOG -Encoding UTF8
"" | Out-File -FilePath $ERRLOG -Encoding UTF8

$process = Start-Process -FilePath "$BIN" `
    -ArgumentList "$ARGS" `
    -WindowStyle Hidden `
    -PassThru `
    -RedirectStandardOutput "$OUTLOG" `
    -RedirectStandardError "$ERRLOG"

if ($process) {
    Write-Host "$($process.Id)"
}
else {
    Write-Error "Exec Failed"
    exit 1
}
