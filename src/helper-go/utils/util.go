package utils

import (
	"bytes"
	"fmt"
	"math/rand"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"
)

// Mkdirp 创建目录（包括所有必要父目录）
func Mkdirp(path string) error {
	return os.MkdirAll(path, os.ModePerm)
}

// Remove 删除文件或目录
func Remove(path string) error {
	return os.RemoveAll(path)
}

// ExistsSync 检查文件/目录是否存在
func ExistsSync(path string) bool {
	_, err := os.Stat(path)
	return !os.IsNotExist(err)
}

// ReadFile 读取文件内容并返回字符串
func ReadFile(path string) (string, error) {
	data, err := os.ReadFile(path)
	return string(data), err
}

// ReadFileBytes 读取文件内容并返回字节切片（如果需要原始字节）
func ReadFileBytes(path string) ([]byte, error) {
	return os.ReadFile(path)
}

// WriteFile 写入文件内容
func WriteFile(path string, data []byte) error {
	return os.WriteFile(path, data, os.ModePerm)
}

// WriteFileString 写入字符串到文件
func WriteFileString(path string, content string) error {
	return os.WriteFile(path, []byte(content), os.ModePerm)
}

var debugLogMutex sync.Mutex

// AppDebugLog 参照 src/shared/utils.ts 的 appDebugLog 方法
// 同时输出到控制台和临时日志文件
func AppDebugLog(flag string, info string) {
	fmt.Printf("appDebugLog: %s %s\n", flag, info)
	debugLogMutex.Lock()
	defer debugLogMutex.Unlock()
	debugFile := filepath.Join(os.TempDir(), "flyenv-debug.log")
	f, err := os.OpenFile(debugFile, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		return
	}
	defer f.Close()
	timestamp := time.Now().Format("2006-01-02 15:04:05")
	f.WriteString(fmt.Sprintf("[%s] %s: %s\n", timestamp, flag, info))
}

// getPowerShellExe 获取 Windows 下 PowerShell 的完整路径
// 如果文件存在则返回完整路径，否则回退到命令名本身
func getPowerShellExe() string {
	if !IsWindows() {
		AppDebugLog("getPowerShellExe", "Not Windows, fallback to 'powershell'")
		return "powershell"
	}
	systemRoot := os.Getenv("SystemRoot")
	AppDebugLog("getPowerShellExe", fmt.Sprintf("SystemRoot env raw value: %q", systemRoot))
	if systemRoot == "" {
		systemRoot = `C:\Windows`
		AppDebugLog("getPowerShellExe", "SystemRoot empty, fallback to C:\\Windows")
	}
	fullPath := filepath.Join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe")
	AppDebugLog("getPowerShellExe", fmt.Sprintf("Checking System32 path: %s", fullPath))
	if ExistsSync(fullPath) {
		AppDebugLog("getPowerShellExe", fmt.Sprintf("Found PowerShell at: %s", fullPath))
		return fullPath
	}
	// 32-bit process on 64-bit Windows 会被文件系统重定向到 SysWOW64
	// PowerShell 不在 SysWOW64 中，需要显式检查 Sysnative
	sysnativePath := filepath.Join(systemRoot, "Sysnative", "WindowsPowerShell", "v1.0", "powershell.exe")
	AppDebugLog("getPowerShellExe", fmt.Sprintf("Checking Sysnative path: %s", sysnativePath))
	if ExistsSync(sysnativePath) {
		AppDebugLog("getPowerShellExe", fmt.Sprintf("Found PowerShell at Sysnative: %s", sysnativePath))
		return sysnativePath
	}
	AppDebugLog("getPowerShellExe", "PowerShell not found at expected paths, fallback to 'powershell'")
	return "powershell"
}

// 对应 execPromise
// ExecPromise 执行 shell 命令并返回输出
func ExecPromise(command string, options map[string]interface{}) (string, string, error) {
	var cmd *exec.Cmd

	if IsMacOS() {
		cmd = exec.Command("/bin/zsh", "-c", command)
	} else if IsLinux() {
		cmd = exec.Command("/bin/bash", "-c", command)
	} else if IsWindows() {
		cmd = exec.Command(getPowerShellExe(), "-NoProfile", "-ExecutionPolicy", "Bypass", "-NonInteractive", "-Command", command)
		SetHideWindow(cmd)
	} else {
		return "", "", fmt.Errorf("unsupported operating system")
	}

	// 设置工作目录
	if cwd, ok := options["cwd"].(string); ok {
		cmd.Dir = cwd
	}

	// 设置环境变量
	if env, ok := options["env"].(map[string]string); ok {
		var envVars []string
		for k, v := range env {
			envVars = append(envVars, k+"="+v)
		}
		cmd.Env = envVars
	}

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	err := cmd.Run()

	fmt.Printf("ExecPromise command: %s, error: %v, stdout: %s, stderr: %s\n", command, err, stdout.String(), stderr.String())

	return stdout.String(), stderr.String(), err
}

// 对应 waitTime
func WaitTime(duration time.Duration) <-chan bool {
	ch := make(chan bool)
	go func() {
		time.Sleep(duration)
		ch <- true
	}()
	return ch
}

// 对应 uuid
func UUID(length int) string {
	rand.New(rand.NewSource(time.Now().UnixNano()))
	const num = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890"
	var str strings.Builder
	for i := 0; i < length; i++ {
		str.WriteByte(num[rand.Intn(len(num))])
	}
	return str.String()
}

// 操作系统判断
var osType = runtime.GOOS

func IsWindows() bool {
	return osType == "windows"
}

func IsMacOS() bool {
	return osType == "darwin"
}

func IsLinux() bool {
	return osType == "linux"
}
