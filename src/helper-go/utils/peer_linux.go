//go:build linux

package utils

import (
	"fmt"
	"net"
	"os"

	"golang.org/x/sys/unix"
)

func PeerInfoFromConn(conn net.Conn) (PeerInfo, error) {
	unixConn, ok := conn.(*net.UnixConn)
	if !ok {
		return PeerInfo{}, fmt.Errorf("expected Unix socket connection, got %T", conn)
	}

	raw, err := unixConn.SyscallConn()
	if err != nil {
		return PeerInfo{}, err
	}

	var (
		cred    *unix.Ucred
		credErr error
	)
	if err := raw.Control(func(fd uintptr) {
		cred, credErr = unix.GetsockoptUcred(int(fd), unix.SOL_SOCKET, unix.SO_PEERCRED)
	}); err != nil {
		return PeerInfo{}, err
	}
	if credErr != nil {
		return PeerInfo{}, credErr
	}
	if cred == nil {
		return PeerInfo{}, fmt.Errorf("missing Unix peer credentials")
	}

	exe, _ := os.Readlink(fmt.Sprintf("/proc/%d/exe", cred.Pid))
	return PeerInfo{
		PID: int(cred.Pid),
		UID: int(cred.Uid),
		GID: int(cred.Gid),
		Exe: exe,
	}, nil
}

func CurrentUserSID() (string, error) {
	return "", fmt.Errorf("Windows SID is unavailable on Linux")
}
