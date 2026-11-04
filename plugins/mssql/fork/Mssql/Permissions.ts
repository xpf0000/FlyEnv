const psString = (value: string) => `'${value.replaceAll("'", "''")}'`

/** Windows-only primitives; callers provide the SID captured before elevation. */
export const windowsAccessFunctions = String.raw`
function Assert-FlyEnvSqlPath($Path, $Root) {
  $full=[IO.Path]::GetFullPath($Path)
  $base=[IO.Path]::GetFullPath($Root).TrimEnd('\')
  if (!$full.StartsWith($base+'\', [StringComparison]::OrdinalIgnoreCase)) { throw "Path outside this FlyEnv installation: $full" }
  $entry=Get-Item -LiteralPath $full -Force
  while ($entry) {
    if ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Reparse target is not supported: $($entry.FullName)" }
    if ($entry.FullName.Equals($base, [StringComparison]::OrdinalIgnoreCase)) { break }
    $parent=[IO.Path]::GetDirectoryName($entry.FullName)
    if (!$parent) { throw 'Target parent could not be verified' }
    $entry=Get-Item -LiteralPath $parent -Force
  }
}
function Assert-FlyEnvSqlServiceSelector($Arguments, $Instance) {
  if ($Arguments -notmatch '^\s*-s\s*(?:"([^"]+)"|([^\s"]+))\s*$') { throw 'SQL Server service arguments are not a single instance selector' }
  $selected=if ($Matches[1]) { $Matches[1] } else { $Matches[2] }
  if (!$selected.Equals($Instance,[StringComparison]::OrdinalIgnoreCase)) { throw 'SQL Server service instance selector does not match' }
}
function Get-FlyEnvSqlAccessTargets($Name, $AppRoot, $ServerRoot) {
  if ($Name -notmatch '^MSSQL\$FLYENV(2019|2022|2025)$') { throw 'Only FlyEnv SQL Server instances can be granted access' }
  $year=$Matches[1]
  $major=@{'2019'='15';'2022'='16';'2025'='17'}[$year]
  $instance=$Name.Substring(6)
  $registry=[Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::LocalMachine,[Microsoft.Win32.RegistryView]::Registry64)
  $names=$null; $setup=$null; $parameters=$null
  try {
    $names=$registry.OpenSubKey('SOFTWARE\Microsoft\Microsoft SQL Server\Instance Names\SQL')
    if (!$names) { throw 'SQL Server instance registry is missing' }
    $id=[string]$names.GetValue($instance)
    if ($id -notmatch ('^MSSQL'+$major+'\.'+[regex]::Escape($instance)+'$')) { throw 'SQL Server instance mapping does not match' }
    $key='SOFTWARE\Microsoft\Microsoft SQL Server\'+$id
    $setup=$registry.OpenSubKey($key+'\Setup')
    if (!$setup -or !([string]$setup.GetValue('Version')).StartsWith($major+'.')) { throw 'SQL Server product version does not match' }
    $bin=[IO.Path]::GetFullPath([IO.Path]::Combine([string]$setup.GetValue('SQLBinRoot'),'sqlservr.exe'))
    $ownedBin=$false
    foreach ($edition in @('express','developer')) {
      $expected=[IO.Path]::GetFullPath([IO.Path]::Combine([string[]]@($AppRoot,'mssql',($year+'-'+$edition),$id,'MSSQL','Binn','sqlservr.exe')))
      if ($bin.Equals($expected,[StringComparison]::OrdinalIgnoreCase)) { $ownedBin=$true }
    }
    if (!$ownedBin) { throw 'SQL Server executable is not in its own FlyEnv instance directory' }
    Assert-FlyEnvSqlPath $bin ([IO.Path]::Combine($AppRoot,'mssql'))
    $service=Get-CimInstance Win32_Service -Filter ("Name='"+$Name+"'")
    if (!$service -or $service.PathName -notmatch '^\s*(?:"([^"]+)"|([^\s]+))') { throw 'SQL Server service executable is unknown' }
    $arguments=$service.PathName.Substring($Matches[0].Length)
    $serviceBin=if ($Matches[1]) { $Matches[1] } else { $Matches[2] }
    if (![IO.Path]::GetFullPath($serviceBin).Equals($bin,[StringComparison]::OrdinalIgnoreCase)) { throw 'SQL Server service executable does not match' }
    Assert-FlyEnvSqlServiceSelector $arguments $instance
    $data=[IO.Path]::GetFullPath([string]$setup.GetValue('SQLDataRoot'))
    $expectedData=[IO.Path]::GetFullPath([IO.Path]::Combine($ServerRoot,'mssql',$id,'MSSQL'))
    if (!$data.TrimEnd('\').Equals($expectedData.TrimEnd('\'),[StringComparison]::OrdinalIgnoreCase)) { throw 'SQL Server data directory does not match its own instance' }
    Assert-FlyEnvSqlPath $data ([IO.Path]::Combine($ServerRoot,'mssql'))
    $file=[IO.Path]::Combine($data,'Log','ERRORLOG')
    $parameters=$registry.OpenSubKey($key+'\MSSQLServer\Parameters')
    if ($parameters) {
      foreach ($value in $parameters.GetValueNames()) {
        if ($value -match '^SQLArg\d+$') {
          $arg=([string]$parameters.GetValue($value)).Trim().Trim('"')
          if ($arg.StartsWith('-e',[StringComparison]::OrdinalIgnoreCase)) { $file=$arg.Substring(2).Trim().Trim('"'); break }
        }
      }
    }
    $file=[IO.Path]::GetFullPath($file)
    $logRoot=[IO.Path]::Combine($data,'Log')
    Assert-FlyEnvSqlPath $file $logRoot
    $dir=[IO.Path]::GetDirectoryName($file)
    if (!(Get-Item -LiteralPath $dir -Force).PSIsContainer -or (Get-Item -LiteralPath $file -Force).PSIsContainer) { throw 'Invalid SQL Server log target' }
    return @{Service=$Name; Directory=$dir; File=$file; Parameters=$key+'\MSSQLServer\Parameters'}
  } finally {
    if ($parameters) { $parameters.Dispose() }; if ($setup) { $setup.Dispose() }; if ($names) { $names.Dispose() }; $registry.Dispose()
  }
}
function Assert-FlyEnvSqlGrantedAccess($Dacl, $Required, $Kind) {
  if ($null -eq $Dacl) { return }
  $remaining=[long]$Required
  $principals=@($callerSid)+@($callerGroupSids)
  $generic=switch ($Kind) {
    'service' { @(0x2008d,0x20002,0x20170,0xf01ff) }
    'file' { @(0x120089,0x120116,0x1200a0,0x1f01ff) }
    'registry' { @(0x20019,0x20006,0x20019,0xf003f) }
  }
  foreach ($ace in $Dacl) {
    if ([int]$ace.AceFlags -band [int][Security.AccessControl.AceFlags]::InheritOnly) { continue }
    if ($principals -notcontains $ace.SecurityIdentifier.Value) { continue }
    $mask=[long]$ace.AccessMask -band 0xffffffffL
    foreach ($bit in @(0,1,2,3)) {
      if ($mask -band @(0x80000000L,0x40000000L,0x20000000L,0x10000000L)[$bit]) { $mask=$mask -bor $generic[$bit] }
    }
    if (!($remaining -band $mask)) { continue }
    if ($ace.IsCallback) { throw 'Conditional access rule cannot be verified for the initiating user' }
    if ($ace.AceQualifier.ToString() -eq 'AccessDenied') { throw 'Existing permissions deny the initiating user or one of their groups access' }
    if ($ace.AceQualifier.ToString() -eq 'AccessAllowed' -and ($ace.SecurityIdentifier.Value -eq $callerSid -or @($callerAllowGroupSids) -contains $ace.SecurityIdentifier.Value)) { $remaining=$remaining -band (-bnot $mask) }
    if (!$remaining) { return }
  }
  throw 'Required access could not be verified for the initiating user'
}
function Grant-FlyEnvSqlServiceAccess($Name, $Sid) {
  $sc=Join-Path $env:SystemRoot 'System32\sc.exe'
  $output=(& $sc sdshow $Name | Out-String)
  if ($LASTEXITCODE -ne 0) { throw "Reading service permissions failed: $output" }
  $sddl=($output -split '\r?\n' | Where-Object { $_.Trim() -match '^(O:|G:|D:|S:)' } | Select-Object -First 1).Trim()
  $sd=[Security.AccessControl.RawSecurityDescriptor]::new($sddl)
  if ($null -eq $sd.DiscretionaryAcl) { return }
  $identity=[Security.Principal.SecurityIdentifier]::new($Sid)
  $mask=0x35
  $covered=0
  $index=$sd.DiscretionaryAcl.Count
  for ($i=0; $i -lt $sd.DiscretionaryAcl.Count; $i++) {
    $ace=$sd.DiscretionaryAcl[$i]
    if (([int]$ace.AceFlags -band [int][Security.AccessControl.AceFlags]::Inherited) -and $index -eq $sd.DiscretionaryAcl.Count) { $index=$i }
    if ($ace -is [Security.AccessControl.CommonAce] -and $ace.SecurityIdentifier.Equals($identity) -and !$ace.IsCallback) {
      if ($ace.AceQualifier -eq [Security.AccessControl.AceQualifier]::AccessAllowed -and $ace.AceFlags -eq [Security.AccessControl.AceFlags]::None) { $covered=$covered -bor $ace.AccessMask }
    }
  }
  if (($covered -band $mask) -eq $mask) { Assert-FlyEnvSqlGrantedAccess $sd.DiscretionaryAcl $mask 'service'; return }
  $grant=[Security.AccessControl.CommonAce]::new([Security.AccessControl.AceFlags]::None,[Security.AccessControl.AceQualifier]::AccessAllowed,($mask -band (-bnot $covered)),$identity,$false,$null)
  $sd.DiscretionaryAcl.InsertAce($index,$grant)
  Assert-FlyEnvSqlGrantedAccess $sd.DiscretionaryAcl $mask 'service'
  $updated=$sd.GetSddlForm([Security.AccessControl.AccessControlSections]::All)
  $output=(& $sc sdset $Name $updated | Out-String)
  if ($LASTEXITCODE -ne 0) { throw "Writing service permissions failed: $output" }
}
function Grant-FlyEnvSqlLogAccess($Path, $Sid, $Directory) {
  $acl=Get-Acl -LiteralPath $Path
  $identity=[Security.Principal.SecurityIdentifier]::new($Sid)
  $rights=[Security.AccessControl.FileSystemRights]::Read -bor [Security.AccessControl.FileSystemRights]::Write
  $inheritance=[Security.AccessControl.InheritanceFlags]::None
  if ($Directory) {
    $rights=$rights -bor [Security.AccessControl.FileSystemRights]::ReadAndExecute
    $inheritance=[Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [Security.AccessControl.InheritanceFlags]::ObjectInherit
  }
  $rule=[Security.AccessControl.FileSystemAccessRule]::new($identity,$rights,$inheritance,[Security.AccessControl.PropagationFlags]::None,[Security.AccessControl.AccessControlType]::Allow)
  [void]$acl.AddAccessRule($rule)
  $sd=[Security.AccessControl.RawSecurityDescriptor]::new($acl.GetSecurityDescriptorSddlForm([Security.AccessControl.AccessControlSections]::Access))
  Assert-FlyEnvSqlGrantedAccess $sd.DiscretionaryAcl $rule.FileSystemRights 'file'
  Set-Acl -LiteralPath $Path -AclObject $acl
}
function Grant-FlyEnvSqlParameterRead($Path, $Sid) {
  $registry=[Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::LocalMachine,[Microsoft.Win32.RegistryView]::Registry64)
  $key=$null
  try {
    $key=$registry.OpenSubKey($Path,[Microsoft.Win32.RegistryKeyPermissionCheck]::ReadWriteSubTree,[Security.AccessControl.RegistryRights]::ReadKey -bor [Security.AccessControl.RegistryRights]::ChangePermissions)
    if (!$key) { throw 'SQL Server startup parameters are missing' }
    $acl=$key.GetAccessControl()
    $rule=[Security.AccessControl.RegistryAccessRule]::new([Security.Principal.SecurityIdentifier]::new($Sid),[Security.AccessControl.RegistryRights]::ReadKey,[Security.AccessControl.InheritanceFlags]::None,[Security.AccessControl.PropagationFlags]::None,[Security.AccessControl.AccessControlType]::Allow)
    [void]$acl.AddAccessRule($rule)
    $sd=[Security.AccessControl.RawSecurityDescriptor]::new($acl.GetSecurityDescriptorSddlForm([Security.AccessControl.AccessControlSections]::Access))
    Assert-FlyEnvSqlGrantedAccess $sd.DiscretionaryAcl ([Security.AccessControl.RegistryRights]::ReadKey) 'registry'
    $key.SetAccessControl($acl)
  } finally { if ($key) { $key.Dispose() }; $registry.Dispose() }
}
function Grant-FlyEnvSqlAccess($Name, $CallerSid, $AppRoot, $ServerRoot) {
  if ($CallerSid -notmatch '^S-1-\d+(?:-\d+)+$') { throw 'Invalid initiating user SID' }
  $targets=Get-FlyEnvSqlAccessTargets $Name $AppRoot $ServerRoot
  $errors=@(); $result.access=@{}
  foreach ($part in @('service','directory','file','parameters')) {
    try {
      switch ($part) {
        'service' { Grant-FlyEnvSqlServiceAccess $targets.Service $CallerSid }
        'directory' { Grant-FlyEnvSqlLogAccess $targets.Directory $CallerSid $true }
        'file' { Grant-FlyEnvSqlLogAccess $targets.File $CallerSid $false }
        'parameters' { Grant-FlyEnvSqlParameterRead $targets.Parameters $CallerSid }
      }
      $result.access[$part]='completed'
    } catch { $result.access[$part]='failed'; $errors+=($part+': '+$_.Exception.Message) }
  }
  if ($errors.Count) { throw ($errors -join '; ') }
}
`

export function windowsGrantAccessBody(service: string, appRoot: string, serverRoot: string) {
  if (!/^MSSQL\$FLYENV(?:2019|2022|2025)$/.test(service)) {
    throw new Error('Only FlyEnv SQL Server instances can be granted access')
  }
  return `${windowsAccessFunctions}\nGrant-FlyEnvSqlAccess ${psString(service)} $callerSid ${psString(appRoot)} ${psString(serverRoot)}`
}

/** Open and close a handle with the exact requested rights; never control a service. */
export function windowsServiceAccessCheckScript(service: string): string {
  if (!/^MSSQL\$FLYENV(?:2019|2022|2025)$/.test(service)) {
    throw new Error('Only FlyEnv SQL Server instances can be checked')
  }
  return `$ErrorActionPreference='Stop'; Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
public static class FlyEnvSqlServiceAccess {
  [DllImport("advapi32.dll", CharSet=CharSet.Unicode, ExactSpelling=true, SetLastError=true)]
  static extern IntPtr OpenSCManagerW(string machine, string database, uint access);
  [DllImport("advapi32.dll", CharSet=CharSet.Unicode, ExactSpelling=true, SetLastError=true)]
  static extern IntPtr OpenServiceW(IntPtr manager, string name, uint access);
  [DllImport("advapi32.dll", SetLastError=true)]
  static extern bool CloseServiceHandle(IntPtr handle);
  public static bool Check(string name) {
    IntPtr manager=OpenSCManagerW(null,null,1);
    if(manager==IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error());
    try {
      IntPtr service=OpenServiceW(manager,name,0x35);
      if(service==IntPtr.Zero) {
        int code=Marshal.GetLastWin32Error();
        if(code==5) return false;
        throw new Win32Exception(code);
      }
      CloseServiceHandle(service);
      return true;
    } finally { CloseServiceHandle(manager); }
  }
}
'@; [FlyEnvSqlServiceAccess]::Check(${psString(service)}).ToString().ToLowerInvariant()`
}

/** Only instances created by this plugin are offered an access repair. */
export function canRepairWindowsPermissions(version: {
  version?: string | null
  serviceName?: string
  instanceName?: string
}): boolean {
  const service = version.serviceName ?? `MSSQL$${version.instanceName ?? ''}`
  const year = service.match(/^MSSQL\$FLYENV(2019|2022|2025)$/)?.[1]
  return (
    !!year &&
    ({ '2019': '15', '2022': '16', '2025': '17' } as Record<string, string>)[year] ===
      version.version?.split('.')[0]
  )
}
