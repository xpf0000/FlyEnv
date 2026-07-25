//go:build !windows

package utils

// This fallback is only referenced from the Windows runtime branch in
// whitelist.go. It keeps non-Windows cross-compilation independent of Win32.
func commonApplicationDataPath() string {
	return `C:\ProgramData`
}
