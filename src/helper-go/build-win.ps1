#!/usr/bin/env pwsh

<#
.SYNOPSIS
Build script for flyenv-helper Go application with cross-compilation support.
#>

# --- Configuration ---
$BUILD_DIR = "./dist"
$APP_NAME = "flyenv-helper"
$MAIN_PACKAGE = "./main.go" # Or "." if your main.go is in the current directory

# Determine architecture and set TARGET
$ARCH = (Get-WmiObject Win32_Processor).Architecture
switch ($ARCH) {
  0 { $ARCH = "x86" }
  9 { $ARCH = "x64" }
  5 { $ARCH = "arm" }
  12 { $ARCH = "arm64" }
}

if ($ARCH -eq "x64") {
  $TARGET = @("windows", "amd64", "v1")
} elseif ($ARCH -eq "arm64") {
  $TARGET = @("windows", "arm64")
} else {
  Write-Host "Unsupported architecture: $ARCH"
  exit 1
}

# --- Build Process ---

Write-Host "--- Starting Go Cross-Compilation for ${APP_NAME} ---"

# 1. Clean previous builds
Write-Host "Cleaning previous builds in ${BUILD_DIR}..."
Remove-Item -Path $BUILD_DIR -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $BUILD_DIR -Force | Out-Null
if (-not (Test-Path $BUILD_DIR)) {
  Write-Host "Error: Failed to create build directory ${BUILD_DIR}"
  exit 1
}

# Parse target components
$GOOS_VAL = $TARGET[0]
$GOARCH_VAL = $TARGET[1]
$GOAMD64_VAL = $TARGET[2]

$OUTPUT_FILENAME = "${APP_NAME}-${GOOS_VAL}-${GOARCH_VAL}"
if ($GOAMD64_VAL) {
  $OUTPUT_FILENAME = "${OUTPUT_FILENAME}-${GOAMD64_VAL}"
}

# Add .exe extension for Windows builds
if ($GOOS_VAL -eq "windows") {
  $OUTPUT_FILENAME = "${OUTPUT_FILENAME}.exe"
}

Write-Host "Building for ${GOOS_VAL} ${GOARCH_VAL} (GOAMD64=${GOAMD64_VAL})..."

# Set environment variables for cross-compilation
$env:GOOS = $GOOS_VAL
$env:GOARCH = $GOARCH_VAL
if ($GOAMD64_VAL) {
  $env:GOAMD64 = $GOAMD64_VAL
}
$env:CGO_ENABLED = "0"

# Run the build
$buildOutput = Join-Path -Path $BUILD_DIR -ChildPath $OUTPUT_FILENAME
$buildArgs = @(
  "build",
  "-ldflags=`"-H windowsgui`"",
  "-o",
  $buildOutput,
  $MAIN_PACKAGE
)

$process = Start-Process -FilePath "go" -ArgumentList $buildArgs -NoNewWindow -PassThru -Wait
if ($process.ExitCode -ne 0) {
  Write-Host "Error: Build failed for ${GOOS_VAL}/${GOARCH_VAL}"
  exit 1
}

# Set executable permissions if not Windows
if ($GOOS_VAL -ne "windows") {
  chmod +x $buildOutput
}

Write-Host "--- Build complete! ---"
Get-ChildItem -Path $BUILD_DIR | Format-Table Name, Length, LastWriteTime -AutoSize

if ($GOOS_VAL -ne "windows") {
  Write-Host "Remember to set execute permissions (chmod +x) on the binary after copying."
}
