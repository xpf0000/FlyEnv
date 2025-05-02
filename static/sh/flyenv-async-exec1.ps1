[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::InputEncoding = [System.Text.Encoding]::UTF8

$env:LC_ALL = 'en_US.UTF-8'
$env:LANG = 'en_US.UTF-8'

#ENV#

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

try {
    $process = [System.Diagnostics.Process]::Start($psi)

    $outputBuilder = [System.Text.StringBuilder]::new()
    $errorBuilder = [System.Text.StringBuilder]::new()

    $outputTask = $process.StandardOutput.ReadToEndAsync()
    $errorTask = $process.StandardError.ReadToEndAsync()

    $output = $outputBuilder.Append($outputTask.Result).ToString()
    $error = $errorBuilder.Append($errorTask.Result).ToString()

    [IO.File]::WriteAllText($OUTLOG, $output)
    [IO.File]::WriteAllText($ERRLOG, $error)

    Write-Host "##FlyEnv-Process-ID$($process.Id)FlyEnv-Process-ID##"
}
catch {
    Write-Error "$($_.Exception.Message)"
    [IO.File]::AppendAllText($ERRLOG, $_.Exception.Message)
    exit 1
}
finally {
    if ($process) { $process.Close() }
}
