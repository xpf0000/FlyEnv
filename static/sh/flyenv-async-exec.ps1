[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Set-Location -Path "#CWD#"
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = "#BIN#"
$psi.Arguments = "#ARGS#"
$psi.UseShellExecute = $false
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true
$psi.StandardOutputEncoding = [Text.Encoding]::UTF8
$psi.StandardErrorEncoding = [Text.Encoding]::UTF8
$psi.WindowStyle = [Diagnostics.ProcessWindowStyle]::Hidden
$process = [Diagnostics.Process]::Start($psi)
$outputTask = $process.StandardOutput.ReadToEndAsync()
$errorTask = $process.StandardError.ReadToEndAsync()
$process.EnableRaisingEvents = $true
$process.Exited += {
    try {
        [IO.File]::WriteAllText("#OUTLOG#", $outputTask.Result)
        [IO.File]::WriteAllText("#ERRLOG#", $errorTask.Result)
    }
    catch {
    }
}
Write-Host "$($process.Id)"
