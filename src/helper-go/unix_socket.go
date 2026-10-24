//go:build linux || darwin

package main

import (
	"crypto/rand"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"sync"
	"syscall"

	"golang.org/x/sys/unix"
)

type unixHelperSocketListener struct {
	net.Listener
	path    string
	cleanup func()
}

func (l *unixHelperSocketListener) Addr() net.Addr {
	return &net.UnixAddr{Name: l.path, Net: "unix"}
}

func (l *unixHelperSocketListener) Close() error {
	l.cleanup()
	return l.Listener.Close()
}

// Set metadata while the socket is inside a new private directory, then publish
// it with renameat. Never chown/chmod a pathname in a user-managed directory.
func listenUnixHelperSocket(path string, uid, gid int) (net.Listener, error) {
	parent, err := openNoSymlinks(filepath.Dir(path), unix.O_RDONLY|unix.O_DIRECTORY, 0)
	if err != nil {
		return nil, err
	}
	committed := false
	defer func() {
		if !committed {
			parent.Close()
		}
	}()
	var random [8]byte
	if _, err = rand.Read(random[:]); err != nil {
		return nil, err
	}
	stageLeaf := fmt.Sprintf(".socket-%x", random)
	parentFD := int(parent.Fd())
	if err = unix.Mkdirat(parentFD, stageLeaf, 0700); err != nil {
		return nil, err
	}
	stageFD, err := unix.Openat(parentFD, stageLeaf, unix.O_RDONLY|unix.O_DIRECTORY|unix.O_NOFOLLOW|unix.O_CLOEXEC, 0)
	if err != nil {
		return nil, err
	}
	folder := os.NewFile(uintptr(stageFD), stageLeaf)
	defer folder.Close()
	var stageInfo unix.Stat_t
	if err = unix.Fstat(stageFD, &stageInfo); err != nil {
		return nil, err
	}
	defer func() {
		var current unix.Stat_t
		if unix.Fstatat(parentFD, stageLeaf, &current, unix.AT_SYMLINK_NOFOLLOW) == nil &&
			current.Dev == stageInfo.Dev && current.Ino == stageInfo.Ino {
			_ = unix.Unlinkat(parentFD, stageLeaf, unix.AT_REMOVEDIR)
		}
	}()
	// This resource was just created by the operation, not an existing user dir.
	if stageInfo.Uid != uint32(os.Geteuid()) {
		return nil, fmt.Errorf("socket staging directory changed during creation")
	}
	if err = clearInheritedACL(folder); err != nil {
		return nil, err
	}
	if err = folder.Chmod(0700); err != nil {
		return nil, err
	}
	const name = "helper.sock"
	var before unix.Stat_t
	if err = unix.Fstatat(stageFD, name, &before, unix.AT_SYMLINK_NOFOLLOW); err != unix.ENOENT {
		return nil, fmt.Errorf("socket staging is not empty: %v", err)
	}
	stage := filepath.Join(filepath.Dir(path), stageLeaf)
	listener, err := net.ListenUnix("unix", &net.UnixAddr{Name: filepath.Join(stage, name), Net: "unix"})
	if err != nil {
		return nil, err
	}
	listener.SetUnlinkOnClose(false)
	defer func() {
		if !committed {
			listener.Close()
		}
	}()
	var published unix.Stat_t
	if err = unix.Fstatat(stageFD, name, &published, unix.AT_SYMLINK_NOFOLLOW); err != nil {
		return nil, err
	}
	if published.Mode&unix.S_IFMT != unix.S_IFSOCK {
		return nil, fmt.Errorf("private helper socket was replaced")
	}
	defer func() {
		var current unix.Stat_t
		if unix.Fstatat(stageFD, name, &current, unix.AT_SYMLINK_NOFOLLOW) == nil &&
			current.Dev == published.Dev && current.Ino == published.Ino {
			_ = unix.Unlinkat(stageFD, name, 0)
		}
	}()
	if err = unix.Fchownat(stageFD, name, uid, gid, 0); err != nil {
		return nil, err
	}
	if err = unix.Fchmodat(stageFD, name, 0600, 0); err != nil {
		return nil, err
	}
	leaf := filepath.Base(path)
	if err = unix.Renameat(stageFD, name, parentFD, leaf); err != nil {
		return nil, err
	}
	var cleanupOnce sync.Once
	cleanup := func() {
		cleanupOnce.Do(func() {
			defer parent.Close()
			var current unix.Stat_t
			if unix.Fstatat(parentFD, leaf, &current, unix.AT_SYMLINK_NOFOLLOW) == nil &&
				current.Dev == published.Dev && current.Ino == published.Ino {
				_ = unix.Unlinkat(parentFD, leaf, 0)
			}
		})
	}
	committed = true
	return &unixHelperSocketListener{Listener: listener, path: path, cleanup: cleanup}, nil
}

func unixSocketReady(path string, uid int) error {
	info, err := os.Lstat(path)
	if err != nil {
		return err
	}
	meta := info.Sys().(*syscall.Stat_t)
	if info.Mode()&os.ModeSocket == 0 || info.Mode().Perm() != 0600 || meta.Uid != uint32(uid) {
		return fmt.Errorf("invalid helper socket")
	}
	return nil
}
