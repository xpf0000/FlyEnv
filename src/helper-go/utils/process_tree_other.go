//go:build !windows

package utils

import "fmt"

// 树模式仅由 Windows 服务调用；其他平台保持原有信号/服务生命周期，误调明确失败。
func KillWindowsProcessTrees(pids []string, identities []ProcessStartIdentity) error {
	return fmt.Errorf("Windows process tree stop is unavailable on this platform")
}

// KillWindowsProcesses is available only to the Windows Helper implementation.
func KillWindowsProcesses(pids []string, identities []ProcessStartIdentity) error {
	return fmt.Errorf("Windows process stop is unavailable on this platform")
}
