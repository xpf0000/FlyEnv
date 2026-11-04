//go:build windows

package utils

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"unsafe"

	"golang.org/x/sys/windows"
)

var windowsSystemExeNamePattern = regexp.MustCompile(`(?i)^[a-z0-9-]+\.exe$`)

// WindowsSystemRoot 使用系统 API 返回实际安装目录，忽略可被覆盖的 SystemRoot、
// windir、ComSpec、PATH 和当前工作目录；支持非 C 盘系统，无硬编码目录回退。
// API 失败必须传回调用者，不能缩小敏感路径范围或转而信任环境变量。
func WindowsSystemRoot() (string, error) {
	root, err := windows.GetSystemWindowsDirectory()
	if err != nil {
		return "", fmt.Errorf("failed to query Windows system root: %w", err)
	}
	if err := ValidateWindowsAbsolutePath(root, false); err != nil {
		return "", fmt.Errorf("invalid Windows system root: %w", err)
	}
	return filepath.Clean(root), nil
}

// windowsSystemDirectory 与当前 Go 进程位数一致；当前发行目标为 amd64。
// 不无条件使用 Sysnative：64 位进程不能通过该 32 位重定向别名启动程序。
func windowsSystemDirectory() (string, error) {
	directory, err := windows.GetSystemDirectory()
	if err != nil {
		return "", fmt.Errorf("failed to query Windows system directory: %w", err)
	}
	if err := ValidateWindowsAbsolutePath(directory, false); err != nil {
		return "", fmt.Errorf("invalid Windows system directory: %w", err)
	}
	return filepath.Clean(directory), nil
}

// requireWindowsSystemFile 区分真实常规文件、目录、缺失与不可访问；不再使用
// ExistsSync（它将权限/其他 stat 错误也当成存在），也不回退裸命令或 PATH。
// 检查与启动不是原子事务，实际执行仍必须处理失败；这里不替代签名/系统 ACL 校验。
func requireWindowsSystemFile(executable string) (string, error) {
	info, err := os.Stat(executable)
	if err != nil {
		return "", fmt.Errorf("Windows system executable unavailable: %w", err)
	}
	if !info.Mode().IsRegular() {
		return "", fmt.Errorf("Windows system executable is not a regular file: %s", executable)
	}
	return executable, nil
}

// GetWindowsSystemExe 只接受固定工具的文件名，拒绝目录跳转、设备命名空间和 ADS。
// 统一用于 certutil/taskkill/netstat/schtasks；缺失明确失败，不搜索同名替代程序。
func GetWindowsSystemExe(name string) (string, error) {
	if !strings.HasSuffix(strings.ToLower(name), ".exe") {
		name += ".exe"
	}
	if !windowsSystemExeNamePattern.MatchString(name) {
		return "", fmt.Errorf("invalid Windows system executable name")
	}
	directory, err := windowsSystemDirectory()
	if err != nil {
		return "", err
	}
	return requireWindowsSystemFile(filepath.Join(directory, name))
}

// GetPowerShellExe 返回系统 Windows PowerShell；不替换成用户 PowerShell 7 或 PATH
// 中的同名文件。返回 error 迫使所有调用点在执行前显式处理程序缺失/策略失败。
func GetPowerShellExe() (string, error) {
	directory, err := windowsSystemDirectory()
	if err != nil {
		return "", err
	}
	return requireWindowsSystemFile(filepath.Join(directory, "WindowsPowerShell", "v1.0", "powershell.exe"))
}

// windowsPathIsReparsePoint 检查实际标签，不只检查 Go 的 ModeSymlink。
// junction、挂载点、未知标签均拒绝；仅允许不具有 Name Surrogate 位的标准 Cloud
// 标签，保留既有 OneDrive profile 的 provider 写入支持；这不会放宽业务范围/ACL。
// 标签定义见 Windows SDK WinNT.h 与微软 Reparse Point Tags 文档。
func windowsPathIsReparsePoint(path string) (bool, error) {
	encoded, err := windows.UTF16PtrFromString(path)
	if err != nil {
		return false, fmt.Errorf("invalid Windows path: %w", err)
	}
	attributes, err := windows.GetFileAttributes(encoded)
	if err != nil {
		return false, fmt.Errorf("failed to inspect Windows path attributes: %w", err)
	}
	if attributes&windows.FILE_ATTRIBUTE_REPARSE_POINT == 0 {
		return false, nil
	}
	// 打开重解析对象自身（包括目录），只读取元数据，不跟随其目标、不请求写权限。
	handle, err := windows.CreateFile(encoded, windows.FILE_READ_ATTRIBUTES,
		windows.FILE_SHARE_READ|windows.FILE_SHARE_WRITE|windows.FILE_SHARE_DELETE, nil,
		windows.OPEN_EXISTING, windows.FILE_FLAG_OPEN_REPARSE_POINT|windows.FILE_FLAG_BACKUP_SEMANTICS, 0)
	if err != nil {
		return false, fmt.Errorf("failed to open Windows reparse metadata: %w", err)
	}
	defer windows.CloseHandle(handle)
	tagInfo := struct {
		Attributes uint32
		Tag        uint32
	}{}
	if err := windows.GetFileInformationByHandleEx(handle, windows.FileAttributeTagInfo,
		(*byte)(unsafe.Pointer(&tagInfo)), uint32(unsafe.Sizeof(tagInfo))); err != nil {
		return false, fmt.Errorf("failed to read Windows reparse tag: %w", err)
	}
	// CLOUD 与 CLOUD_1..F 只在 0x0000f000 范围不同。显式检查 N 位，不能
	// 按“所有微软标签”或“所有非 symlink 标签”宽泛放行其他重解析对象。
	const cloudTag = uint32(0x9000001a)
	const cloudVariantMask = uint32(0x0000f000)
	const nameSurrogateBit = uint32(0x20000000)
	allowedCloud := tagInfo.Tag&^cloudVariantMask == cloudTag && tagInfo.Tag&nameSurrogateBit == 0
	return !allowedCloud, nil
}
