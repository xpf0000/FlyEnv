//go:build linux || darwin

package main

import (
	"context"
	"fmt"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

type boundedToolOutput struct {
	strings.Builder
	overflow bool
}

func (output *boundedToolOutput) Write(data []byte) (int, error) {
	n := len(data)
	remaining := 1024*1024 - output.Len()
	if n > remaining {
		data = data[:remaining]
		output.overflow = true
	}
	output.Builder.Write(data)
	return n, nil
}

func runTrustedTool(path string, args ...string) error {
	trusted, err := openProtectedFile(path, 128*1024*1024)
	if err != nil {
		return err
	}
	trusted.Close()
	_, err = runFixedTool(path, 20*time.Second, args...)
	return err
}

// Internal execution only. Business callers validate the executable and arguments.
func runFixedTool(path string, timeout time.Duration, args ...string) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, path, args...)
	cmd.Env = []string{"PATH=/usr/sbin:/usr/bin:/sbin:/bin", "LANG=C"}
	cmd.Dir = "/"
	output := &boundedToolOutput{}
	cmd.Stdout, cmd.Stderr = output, output
	err := cmd.Run()
	if output.overflow {
		return "", fmt.Errorf("%s output exceeded limit", filepath.Base(path))
	}
	if ctx.Err() != nil {
		err = ctx.Err()
	}
	if err != nil {
		return "", fmt.Errorf("%s: %w: %s", filepath.Base(path), err, strings.TrimSpace(output.String()))
	}
	return output.String(), nil
}
