//go:build darwin

package main

import (
	"context"
	"fmt"
	"golang.org/x/sys/unix"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"syscall"
	"time"
)

func buildDarwinFTPDatabase(p darwinPolicy, pw, users, dir string) (resultErr error) {
	// Root creates staging under a protected parent. Only this account can write
	// stage contents; root reads the final file with no-follow/type/size checks.
	stage, err := os.MkdirTemp(dir, ".users-")
	if err != nil {
		return err
	}
	defer os.RemoveAll(stage)
	if err = os.Chown(stage, p.UID, p.GID); err != nil {
		return err
	}
	if err = os.Chmod(dir, 0711); err != nil {
		return err
	}
	defer func() {
		if err := os.Chmod(dir, 0700); err != nil {
			resultErr = fmt.Errorf("FTP database result %v; cannot restore protected runtime permissions: %w", resultErr, err)
		}
	}()
	input := filepath.Join(stage, "users.passwd")
	if err = os.WriteFile(input, []byte(users), 0600); err != nil {
		return err
	}
	if err = os.Chown(input, p.UID, p.GID); err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	output := &boundedToolOutput{}
	cmd := exec.CommandContext(ctx, pw, "mkdb", filepath.Join(stage, "users.pdb"), "-f", input)
	cmd.Env = []string{"PATH=/usr/bin:/bin:/usr/sbin:/sbin", "LANG=C"}
	cmd.Dir = "/"
	cmd.SysProcAttr = &syscall.SysProcAttr{Credential: &syscall.Credential{Uid: uint32(p.UID), Gid: uint32(p.GID), Groups: []uint32{uint32(p.GID)}}}
	cmd.Stdout, cmd.Stderr = output, output
	if err = cmd.Run(); err != nil {
		return fmt.Errorf("ordinary FTP database generation failed: %w: %s", err, output.String())
	}
	if output.overflow {
		return fmt.Errorf("FTP database output exceeded limit")
	}
	f, err := openNoSymlinks(filepath.Join(stage, "users.pdb"), unix.O_RDONLY|unix.O_NONBLOCK, 0)
	if err != nil {
		return err
	}
	defer f.Close()
	st, err := f.Stat()
	if err != nil {
		return err
	}
	if !st.Mode().IsRegular() || st.Sys().(*syscall.Stat_t).Nlink != 1 || st.Sys().(*syscall.Stat_t).Uid != uint32(p.UID) || st.Size() > hostsLimit {
		return fmt.Errorf("unsafe FTP database output")
	}
	data, err := io.ReadAll(io.LimitReader(f, hostsLimit+1))
	if err != nil {
		return err
	}
	if len(data) > hostsLimit {
		return fmt.Errorf("FTP database exceeds size limit")
	}
	return writeProtectedFile(filepath.Join(dir, "users.pdb"), data, 0600, 0)
}
