package utils

import (
	"fmt"
	"regexp"
	"strings"
)

var windowsDrivePathPattern = regexp.MustCompile(`(?i)^[a-z]:\\`)
var windowsDeviceNamePattern = regexp.MustCompile(`(?i)^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³]) *(?:\.|$)`)

// ValidateWindowsAbsolutePath 只验证 Windows 路径语法，不查询文件系统，也不证明 ACL。
// 独立于宿主 filepath 语义，保证 Unix 上构造 Windows 每 SID 实例时也拒绝设备路径。
// allowUNC 仅用于已授权的业务/重定向 Documents；系统程序与 ProgramData 必须在本机。
func ValidateWindowsAbsolutePath(value string, allowUNC bool) error {
	if value == "" || strings.TrimSpace(value) != value {
		return fmt.Errorf("Windows path is empty or has surrounding whitespace")
	}
	// 正斜杠可作为普通分隔符，但不得把盘符相对/根相对路径变成绝对路径。
	canonical := strings.ReplaceAll(value, "/", `\`)
	var remainder string
	switch {
	case windowsDrivePathPattern.MatchString(canonical):
		remainder = canonical[3:]
	case allowUNC && strings.HasPrefix(canonical, `\\`):
		parts := strings.Split(canonical[2:], `\`)
		if len(parts) < 2 || parts[0] == "" || parts[1] == "" || parts[0] == "." || parts[0] == "?" {
			return fmt.Errorf("Windows UNC path must contain server and share")
		}
		remainder = canonical[2:]
	default:
		return fmt.Errorf("Windows path must be a full drive path or an allowed UNC path")
	}
	// 盘符冒号已被移除；后续冒号代表 ADS。拒绝所有控制/Win32 无效字符，
	// 避免 Go、PowerShell、Win32 打开不同的对象；普通空格和合法特殊字符仍可使用。
	for _, r := range remainder {
		if r < 32 || r == 127 || strings.ContainsRune(`<>"|?*:`, r) {
			return fmt.Errorf("Windows path contains control characters, invalid characters or an alternate data stream")
		}
	}
	for _, component := range strings.Split(remainder, `\`) {
		if component == ".." || (component != "." && (strings.HasSuffix(component, ".") || strings.HasSuffix(component, " "))) {
			return fmt.Errorf("Windows path contains traversal or a trailing dot/space")
		}
		if windowsDeviceNamePattern.MatchString(component) {
			return fmt.Errorf("Windows path contains a reserved device name")
		}
	}
	return nil
}
