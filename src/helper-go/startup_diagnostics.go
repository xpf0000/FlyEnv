package main

import (
	"fmt"
	"io"
	"regexp"
	"runtime"
	"strings"
	"sync"
	"time"

	"helper-go/utils"
)

var (
	startupDiagnosticsMu sync.Mutex
	startupDiagnostics   io.WriteCloser
	startupSecretPattern = regexp.MustCompile(`(?i)(\b(?:helper\s+)?key\s*=\s*|\bargs?\s*=\s*)[^\s,;]+`)
)

func sanitizeStartupDiagnostic(message string) string {
	message = startupSecretPattern.ReplaceAllString(message, "$1[redacted]")
	if len(message) > 4096 {
		message = message[:4096] + "...[truncated]"
	}
	return message
}

func startupDiagnosticf(format string, args ...interface{}) {
	message := sanitizeStartupDiagnostic(fmt.Sprintf(format, args...))
	line := fmt.Sprintf("[%s] %s\n", time.Now().UTC().Format(time.RFC3339), message)
	startupDiagnosticsMu.Lock()
	defer startupDiagnosticsMu.Unlock()
	if startupDiagnostics != nil {
		_, _ = io.WriteString(startupDiagnostics, line)
		return
	}
	if runtime.GOOS != "windows" {
		fmt.Print(line)
	}
}

func setStartupDiagnostics(paths utils.WindowsHelperPaths) func() {
	if runtime.GOOS != "windows" {
		return func() {}
	}
	writer, err := utils.OpenWindowsHelperDiagnostics(paths)
	if err != nil {
		// Diagnostics are best effort and must never prevent the helper from
		// starting when the protected log is unavailable.
		return func() {}
	}
	startupDiagnosticsMu.Lock()
	startupDiagnostics = writer
	startupDiagnosticsMu.Unlock()
	return func() {
		startupDiagnosticsMu.Lock()
		defer startupDiagnosticsMu.Unlock()
		if startupDiagnostics == writer {
			_ = startupDiagnostics.Close()
			startupDiagnostics = nil
		}
	}
}

func expectedSIDArgument(args []string) string {
	for index, arg := range args {
		if arg == "--expected-user-sid" && index+1 < len(args) {
			return args[index+1]
		}
		if strings.HasPrefix(arg, "--expected-user-sid=") {
			return strings.TrimPrefix(arg, "--expected-user-sid=")
		}
	}
	return ""
}

func setStartupDiagnosticsFromArgs(args []string) func() {
	if runtime.GOOS != "windows" {
		return func() {}
	}
	sid := expectedSIDArgument(args)
	if sid == "" {
		return func() {}
	}
	paths, err := utils.CurrentWindowsHelperInstancePaths(sid)
	if err != nil {
		return func() {}
	}
	return setStartupDiagnostics(paths)
}
