//go:build !windows

package utils

func ValidateWindowsProfileOwner(path, targetSID string) error { return nil }
