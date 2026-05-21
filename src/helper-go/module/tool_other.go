//go:build !windows

package module

import "fmt"

func windowsGetMachineEnv(name string) (string, error) {
	return "", fmt.Errorf("Windows registry is not available")
}

func windowsSetMachineEnv(name, value string) error {
	return fmt.Errorf("Windows registry is not available")
}

func windowsSetMachineEnvExpandString(name, value string) error {
	return fmt.Errorf("Windows registry is not available")
}

func windowsNotifyEnvironmentChanged() {}
