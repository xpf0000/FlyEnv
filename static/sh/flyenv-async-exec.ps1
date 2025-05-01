[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$BIN = "#BIN#"
$ARGS = "#ARGS#"
$OUTLOG = "#OUTLOG#"
$ERRLOG = "#ERRLOG#"

$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = $BIN
$psi.Arguments = $ARGS
$psi.UseShellExecute = $false
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true
$psi.StandardOutputEncoding = [System.Text.Encoding]::UTF8
$psi.StandardErrorEncoding = [System.Text.Encoding]::UTF8
$psi.WindowStyle = [Diagnostics.ProcessWindowStyle]::Hidden

$process = New-Object System.Diagnostics.Process
$process.StartInfo = $psi

try {
    $process.Start() | Out-Null
    $processId = $process.Id
    Write-Host "$($processId)"

    $output = $process.StandardOutput.ReadToEndAsync()
    $error = $process.StandardError.ReadToEndAsync()

    [IO.File]::WriteAllText($OUTLOG, $output)
    [IO.File]::WriteAllText($ERRLOG, $error)
}
catch {
    $errorMessage = "$($_.Exception.Message)"
    Write-Error $errorMessage
    [IO.File]::AppendAllText($ERRLOG, $errorMessage)
    exit 1
}
finally {
    $process.Close()
}
