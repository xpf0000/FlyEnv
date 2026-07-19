[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('Pack', 'Apply')]
  [string]$Mode,

  [Parameter(Mandatory = $true)]
  [string]$AppDir,

  [Parameter(Mandatory = $true)]
  [string]$BundleDir,

  [Parameter(Mandatory = $true)]
  [string]$ManifestPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$SigningExtensions = @('.exe', '.dll', '.node')

function Get-NormalizedPath {
  param([Parameter(Mandatory = $true)][string]$Path)

  return [System.IO.Path]::GetFullPath($Path)
}

function Assert-PathWithinRoot {
  param(
    [Parameter(Mandatory = $true)][string]$Root,
    [Parameter(Mandatory = $true)][string]$Path
  )

  $trimChars = [char[]]@('\', '/')
  $rootPrefix = $Root.TrimEnd($trimChars) + [System.IO.Path]::DirectorySeparatorChar
  $candidate = Get-NormalizedPath -Path $Path
  if (-not $candidate.StartsWith($rootPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Path escapes root directory: $candidate"
  }
  return $candidate
}

function Test-IsPeFile {
  param([Parameter(Mandatory = $true)][string]$Path)

  try {
    $stream = [System.IO.File]::OpenRead($Path)
    try {
      if ($stream.Length -lt 2) {
        return $false
      }
      return ($stream.ReadByte() -eq 0x4D -and $stream.ReadByte() -eq 0x5A)
    }
    finally {
      $stream.Dispose()
    }
  }
  catch {
    return $false
  }
}

function Get-SigningFiles {
  param([Parameter(Mandatory = $true)][string]$Root)

  return Get-ChildItem -LiteralPath $Root -Recurse -File | Where-Object {
    $SigningExtensions -contains $_.Extension.ToLowerInvariant()
  }
}

$appRoot = Get-NormalizedPath -Path $AppDir
$bundleRoot = Get-NormalizedPath -Path $BundleDir
$manifestFile = Get-NormalizedPath -Path $ManifestPath

if (-not (Test-Path -LiteralPath $appRoot -PathType Container)) {
  throw "Windows app directory not found: $appRoot"
}

if ($Mode -eq 'Pack') {
  if (Test-Path -LiteralPath $bundleRoot) {
    Remove-Item -LiteralPath $bundleRoot -Recurse -Force
  }
  New-Item -ItemType Directory -Path $bundleRoot -Force | Out-Null

  $packed = 0
  $alreadySigned = 0
  $nonPe = 0
  $stagedPaths = [System.Collections.Generic.List[string]]::new()
  foreach ($file in Get-SigningFiles -Root $appRoot) {
    $relativePath = [System.IO.Path]::GetRelativePath($appRoot, $file.FullName)
    if (-not (Test-IsPeFile -Path $file.FullName)) {
      Write-Host "[skip non-PE] $relativePath"
      $nonPe++
      continue
    }

    $signature = Get-AuthenticodeSignature -FilePath $file.FullName
    if ($signature.Status -eq 'Valid') {
      Write-Host "[skip already-signed] $relativePath"
      $alreadySigned++
      continue
    }

    $destination = Assert-PathWithinRoot -Root $bundleRoot -Path (Join-Path $bundleRoot $relativePath)
    $destinationDirectory = Split-Path -Path $destination -Parent
    New-Item -ItemType Directory -Path $destinationDirectory -Force | Out-Null
    Copy-Item -LiteralPath $file.FullName -Destination $destination -Force
    Write-Host "[pack] $relativePath"
    $stagedPaths.Add($relativePath.Replace('\', '/'))
    $packed++
  }

  if ($packed -eq 0) {
    throw 'No unsigned PE files were found for SignPath.'
  }
  $manifestDirectory = Split-Path -Path $manifestFile -Parent
  New-Item -ItemType Directory -Path $manifestDirectory -Force | Out-Null
  $manifest = [ordered]@{
    version = 1
    files = @($stagedPaths | Sort-Object -Unique)
  }
  $manifest | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath $manifestFile -Encoding utf8NoBOM
  Write-Host "[signpath] staged $packed file(s), skipped $alreadySigned already-signed and $nonPe non-PE file(s)."
  exit 0
}

if (-not (Test-Path -LiteralPath $bundleRoot -PathType Container)) {
  throw "Signed SignPath bundle not found: $bundleRoot"
}
if (-not (Test-Path -LiteralPath $manifestFile -PathType Leaf)) {
  throw "SignPath bundle manifest not found: $manifestFile"
}

$manifest = Get-Content -LiteralPath $manifestFile -Raw | ConvertFrom-Json
if ($manifest.version -ne 1 -or $null -eq $manifest.files) {
  throw "Invalid SignPath bundle manifest: $manifestFile"
}
$expectedPaths = @($manifest.files | ForEach-Object { [string]$_ } | Sort-Object -Unique)
$actualPaths = @(
  Get-SigningFiles -Root $bundleRoot | ForEach-Object {
    [System.IO.Path]::GetRelativePath($bundleRoot, $_.FullName).Replace('\', '/')
  } | Sort-Object -Unique
)
$manifestDifference = Compare-Object -ReferenceObject $expectedPaths -DifferenceObject $actualPaths
if ($null -ne $manifestDifference) {
  $details = $manifestDifference | ForEach-Object { "$($_.SideIndicator) $($_.InputObject)" }
  throw "Signed SignPath bundle does not match submitted manifest: $($details -join ', ')"
}

$applied = 0
foreach ($file in Get-SigningFiles -Root $bundleRoot) {
  $relativePath = [System.IO.Path]::GetRelativePath($bundleRoot, $file.FullName)
  if (-not (Test-IsPeFile -Path $file.FullName)) {
    throw "SignPath returned a non-PE signing file: $relativePath"
  }

  $signature = Get-AuthenticodeSignature -FilePath $file.FullName
  if ($signature.Status -ne 'Valid') {
    throw "SignPath returned an invalid signature for $relativePath (status=$($signature.Status))."
  }

  $destination = Assert-PathWithinRoot -Root $appRoot -Path (Join-Path $appRoot $relativePath)
  if (-not (Test-Path -LiteralPath $destination -PathType Leaf)) {
    throw "Signed file has no matching app payload destination: $relativePath"
  }
  Copy-Item -LiteralPath $file.FullName -Destination $destination -Force
  Write-Host "[apply signed] $relativePath"
  $applied++
}

if ($applied -eq 0) {
  throw 'The signed SignPath bundle did not contain any PE files.'
}
Write-Host "[signpath] applied $applied signed file(s) to $appRoot."
