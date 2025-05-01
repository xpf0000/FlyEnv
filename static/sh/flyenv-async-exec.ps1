[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$BIN = "#BIN#"
$ARGS = "#ARGS#"
$OUTLOG = "#OUTLOG#"
$ERRLOG = "#ERRLOG#"

$process = Start-Process -FilePath "$BIN" `
    -ArgumentList "$ARGS" `
    -NoNewWindow `
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
