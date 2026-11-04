//go:build darwin

package utils

import (
	"fmt"
	"net"

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
		cred    *unix.Xucred
		credErr error
		peerPID int
		pidErr  error
	)
	if err := raw.Control(func(fd uintptr) {
		cred, credErr = unix.GetsockoptXucred(int(fd), unix.SOL_LOCAL, unix.LOCAL_PEERCRED)
		peerPID, pidErr = unix.GetsockoptInt(int(fd), unix.SOL_LOCAL, unix.LOCAL_PEERPID)
	}); err != nil {
		return PeerInfo{}, err
	}
	if credErr != nil {
		return PeerInfo{}, credErr
	}
	if pidErr != nil || peerPID <= 0 {
		return PeerInfo{}, fmt.Errorf("cannot establish peer PID: %v", pidErr)
	}
	if cred == nil {
		return PeerInfo{}, fmt.Errorf("missing Unix peer credentials")
	}

	gid := -1
	if len(cred.Groups) > 0 {
		gid = int(cred.Groups[0])
	}
	return PeerInfo{
		PID: peerPID,
		UID: int(cred.Uid),
		GID: gid,
	}, nil
}

func CurrentUserSID() (string, error) {
	return "", fmt.Errorf("Windows SID is unavailable on macOS")
}
