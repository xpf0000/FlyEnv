//go:build linux || darwin

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

func generateUnixFTPDatabase(p unixPolicy, pw, users string) ([]byte, error) {
	// Use a separate private scratch directory: the ordinary child must not need
	// permission changes on an existing helper/FTP runtime directory.
	tempRoot, err := filepath.EvalSymlinks("/tmp")
	if err != nil {
		return nil, err
	}
	parent, err := openNoSymlinks(tempRoot, unix.O_RDONLY|unix.O_DIRECTORY, 0)
	if err != nil {
		return nil, err
	}
	defer parent.Close()
	stage, err := os.MkdirTemp(tempRoot, "flyenv-ftp-users-")
	if err != nil {
		return nil, err
	}
	folder, err := openNoSymlinks(stage, unix.O_RDONLY|unix.O_DIRECTORY, 0)
	if err != nil {
		return nil, err
	}
	defer folder.Close()
	folderFD, parentFD := int(folder.Fd()), int(parent.Fd())
	var original unix.Stat_t
	if err = unix.Fstat(folderFD, &original); err != nil {
		return nil, err
	}
	ownsContents := false
	defer func() {
		// Only remove the operation's fixed files in the pinned original directory.
		// Never recursively traverse a path that the ordinary account can replace.
		if ownsContents {
			_ = unix.Unlinkat(folderFD, "users.passwd", 0)
			_ = unix.Unlinkat(folderFD, "users.pdb", 0)
		}
		var current unix.Stat_t
		if unix.Fstatat(parentFD, filepath.Base(stage), &current, unix.AT_SYMLINK_NOFOLLOW) == nil &&
			current.Dev == original.Dev && current.Ino == original.Ino {
			_ = unix.Unlinkat(parentFD, filepath.Base(stage), unix.AT_REMOVEDIR)
		}
	}()
	if original.Uid != uint32(os.Geteuid()) {
		return nil, fmt.Errorf("FTP scratch directory changed during creation")
	}
	err = clearInheritedACL(folder)
	if err != nil {
		return nil, err
	}
	if err = folder.Chmod(0700); err != nil {
		return nil, err
	}
	for _, name := range []string{"users.passwd", "users.pdb"} {
		var existing unix.Stat_t
		if err = unix.Fstatat(folderFD, name, &existing, unix.AT_SYMLINK_NOFOLLOW); err != unix.ENOENT {
			return nil, fmt.Errorf("FTP scratch is not empty: %v", err)
		}
	}
	ownsContents = true
	input := filepath.Join(stage, "users.passwd")
	inputFD, err := unix.Openat(folderFD, "users.passwd", unix.O_WRONLY|unix.O_CREAT|unix.O_EXCL|unix.O_NOFOLLOW|unix.O_CLOEXEC, 0600)
	if err != nil {
		return nil, err
	}
	inputFile := os.NewFile(uintptr(inputFD), input)
	if err = inputFile.Chown(p.UID, p.GID); err == nil {
		_, err = inputFile.WriteString(users)
	}
	closeErr := inputFile.Close()
	if err != nil {
		return nil, err
	}
	if closeErr != nil {
		return nil, closeErr
	}
	// Hand the private directory to the child only after root has finished writing.
	if err = folder.Chown(p.UID, p.GID); err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	output := &boundedToolOutput{}
	cmd := exec.CommandContext(ctx, pw, "mkdb", filepath.Join(stage, "users.pdb"), "-f", input)
	cmd.Env = []string{"PATH=/usr/bin:/bin:/usr/sbin:/sbin", "LANG=C"}
	cmd.Dir = "/"
	credential, err := unixUserCredential(p)
	if err != nil {
		return nil, err
	}
	cmd.SysProcAttr = &syscall.SysProcAttr{Credential: credential}
	cmd.Stdout, cmd.Stderr = output, output
	if err = cmd.Run(); err != nil {
		return nil, fmt.Errorf("ordinary FTP database generation failed: %w: %s", err, output.String())
	}
	if output.overflow {
		return nil, fmt.Errorf("FTP database output exceeded limit")
	}
	outputFD, err := unix.Openat(folderFD, "users.pdb", unix.O_RDONLY|unix.O_NONBLOCK|unix.O_NOFOLLOW|unix.O_CLOEXEC, 0)
	if err != nil {
		return nil, err
	}
	f := os.NewFile(uintptr(outputFD), "users.pdb")
	defer f.Close()
	st, err := f.Stat()
	if err != nil {
		return nil, err
	}
	if !st.Mode().IsRegular() || st.Sys().(*syscall.Stat_t).Nlink != 1 || st.Sys().(*syscall.Stat_t).Uid != uint32(p.UID) || st.Size() > hostsLimit {
		return nil, fmt.Errorf("unsafe FTP database output")
	}
	data, err := io.ReadAll(io.LimitReader(f, hostsLimit+1))
	if err != nil {
		return nil, err
	}
	if len(data) > hostsLimit {
		return nil, fmt.Errorf("FTP database exceeds size limit")
	}
	return data, nil
}

func buildUnixFTPDatabase(p unixPolicy, pw, users, dir string) error {
	data, err := generateUnixFTPDatabase(p, pw, users)
	if err != nil {
		return err
	}
	return writeProtectedFile(filepath.Join(dir, "users.pdb"), data, 0600, 0)
}
