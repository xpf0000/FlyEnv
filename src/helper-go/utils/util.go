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
	return os.WriteFile(path, data, 0644)
}

// WriteFileString 写入字符串到文件
func WriteFileString(path string, content string) error {
	return os.WriteFile(path, []byte(content), 0644)
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

// ExecCommand 执行命令并返回输出
// 不经过 shell 解析，直接调用可执行文件，参数以数组传递
func ExecCommand(name string, args []string, options map[string]interface{}) (string, string, error) {
	if IsWindows() {
		// SYSTEM 执行层再兜底：Windows 上不接受裸命令、相对路径或网络程序。
		// 即使新调用点遗漏系统定位，也必须失败，不能由 exec.Command 搜索 PATH。
		if err := ValidateWindowsAbsolutePath(name, false); err != nil {
			return "", "", fmt.Errorf("Windows executable path is invalid: %w", err)
		}
	}
	cmd := exec.Command(name, args...)

	// 设置工作目录
	if cwd, ok := options["cwd"].(string); ok {
		if IsWindows() {
			// 工作目录也必须是完整业务路径；不让进程目录改变相对目标的含义。
			if err := ValidateWindowsAbsolutePath(cwd, true); err != nil {
				return "", "", fmt.Errorf("Windows command working directory is invalid: %w", err)
			}
		}
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

	if IsWindows() {
		SetHideWindow(cmd)
		if strings.EqualFold(filepath.Base(name), "powershell.exe") {
			// 所有内联系统脚本使用系统内置模块，移除任意大小写的继承/覆盖键。
			// 保留其他环境及原 env 覆盖语义，避免用户模块遮蔽系统 cmdlet。
			env := cmd.Environ()
			filtered := make([]string, 0, len(env)+1)
			for _, entry := range env {
				key, _, _ := strings.Cut(entry, "=")
				if !strings.EqualFold(key, "PSModulePath") {
					filtered = append(filtered, entry)
				}
			}
			cmd.Env = append(filtered, "PSModulePath="+filepath.Join(filepath.Dir(name), "Modules"))
		}
	}

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	err := cmd.Run()

	if IsWindows() {
		// EncodedCommand 仍可解码；不把脚本载荷、环境值或文件内容写入公共调试日志。
		fmt.Printf("ExecCommand: %s, error: %v\n", name, err)
	} else {
		fmt.Printf("ExecCommand: %s %v, error: %v, stdout: %s, stderr: %s\n", name, args, err, stdout.String(), stderr.String())
	}

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
