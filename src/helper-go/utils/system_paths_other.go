//go:build !windows

package utils

import "fmt"

// Windows 专用入口在非 Windows 构建中明确不可用；不能为了链接成功返回裸命令。
// Unix 业务继续使用原有各自的执行路径，不引用这些入口。
func WindowsSystemRoot() (string, error) {
	return "", fmt.Errorf("Windows system root is unavailable on this platform")
}

func GetWindowsSystemExe(name string) (string, error) {
	return "", fmt.Errorf("Windows system executable is unavailable on this platform")
}

func GetPowerShellExe() (string, error) {
	return "", fmt.Errorf("Windows PowerShell is unavailable on this platform")
}

func windowsPathIsReparsePoint(path string) (bool, error) {
	return false, nil
}
