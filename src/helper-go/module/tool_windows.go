//go:build windows

package module

import (
	"strings"

	"golang.org/x/sys/windows/registry"
)

const machineEnvRegistryPath = `SYSTEM\CurrentControlSet\Control\Session Manager\Environment`

func windowsOpenMachineEnv(access uint32) (registry.Key, error) {
	return registry.OpenKey(registry.LOCAL_MACHINE, machineEnvRegistryPath, access)
}

// windowsGetMachineEnvRaw reads a machine environment value without expanding
// REG_EXPAND_SZ variables. registry.GetStringValue reads the registry value
// directly, so the returned text is suitable for byte-for-byte PATH snapshots.
func windowsGetMachineEnvRaw(name string) (string, error) {
	key, err := windowsOpenMachineEnv(registry.QUERY_VALUE)
	if err != nil {
		return "", err
	}
	defer key.Close()

	value, _, err := key.GetStringValue(name)
	return value, err
}

func windowsSetMachineEnv(name, value string) error {
	if strings.Contains(value, "%") {
		return windowsSetMachineEnvExpandString(name, value)
	}
	key, err := windowsOpenMachineEnv(registry.SET_VALUE)
	if err != nil {
		return err
	}
	defer key.Close()
	return key.SetStringValue(name, value)
}

func windowsSetMachineEnvExpandString(name, value string) error {
	key, err := windowsOpenMachineEnv(registry.SET_VALUE)
	if err != nil {
		return err
	}
	defer key.Close()
	return key.SetExpandStringValue(name, value)
}
