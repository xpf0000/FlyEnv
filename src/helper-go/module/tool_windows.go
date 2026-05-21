//go:build windows

package module

import (
	"strings"
	"unsafe"

	"golang.org/x/sys/windows"
	"golang.org/x/sys/windows/registry"
)

const machineEnvRegistryPath = `SYSTEM\CurrentControlSet\Control\Session Manager\Environment`

func windowsOpenMachineEnv(access uint32) (registry.Key, error) {
	return registry.OpenKey(registry.LOCAL_MACHINE, machineEnvRegistryPath, access)
}

func windowsGetMachineEnv(name string) (string, error) {
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

func windowsNotifyEnvironmentChanged() {
	user32 := windows.NewLazySystemDLL("user32.dll")
	sendMessageTimeout := user32.NewProc("SendMessageTimeoutW")
	environment, err := windows.UTF16PtrFromString("Environment")
	if err != nil {
		return
	}
	var result uintptr
	sendMessageTimeout.Call(
		0xffff, // HWND_BROADCAST
		0x001a, // WM_SETTINGCHANGE
		0,
		uintptr(unsafe.Pointer(environment)),
		0x0002, // SMTO_ABORTIFHUNG
		5000,
		uintptr(unsafe.Pointer(&result)),
	)
}
