[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$regPath = "SYSTEM\CurrentControlSet\Control\Session Manager\Environment"
try {
    $regKey = [Microsoft.Win32.RegistryKey]::OpenBaseKey('LocalMachine', [Microsoft.Win32.RegistryView]::Registry64)
    if ($regKey) {
        $subKey = $regKey.OpenSubKey($regPath, $false)
        if ($subKey) {
            $rawValue = $subKey.GetValue("Path", $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
            $subKey.Close()
	          $regKey.Close()
	          Write-Host "##FlyEnv-PATH-GET"
            $rawValue
            Write-Host "FlyEnv-PATH-GET##"
        } else {
            $regKey.Close()
            exit 1
        }
    } else {
        exit 1
    }
}
catch {
	exit 1
}
