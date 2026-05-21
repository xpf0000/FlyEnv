//go:build windows

package utils

import (
	"fmt"
	"net"
	"unsafe"

	"golang.org/x/sys/windows"
)

var procGetNamedPipeClientProcessId = windows.NewLazySystemDLL("kernel32.dll").NewProc("GetNamedPipeClientProcessId")

func PeerInfoFromConn(conn net.Conn) (PeerInfo, error) {
	fdConn, ok := conn.(interface{ Fd() uintptr })
	if !ok {
		return PeerInfo{}, fmt.Errorf("expected fd-backed named pipe connection, got %T", conn)
	}

	var pid uint32
	r1, _, callErr := procGetNamedPipeClientProcessId.Call(
		fdConn.Fd(),
		uintptr(unsafe.Pointer(&pid)),
	)
	if r1 == 0 {
		return PeerInfo{}, fmt.Errorf("GetNamedPipeClientProcessId failed: %w", callErr)
	}

	exe, _ := processImagePath(pid)
	sid, sidErr := processUserSID(pid)
	if sidErr != nil {
		return PeerInfo{}, sidErr
	}

	return PeerInfo{
		PID:     int(pid),
		UID:     -1,
		GID:     -1,
		Exe:     exe,
		UserSID: sid,
	}, nil
}

func processImagePath(pid uint32) (string, error) {
	handle, err := windows.OpenProcess(windows.PROCESS_QUERY_LIMITED_INFORMATION, false, pid)
	if err != nil {
		return "", err
	}
	defer windows.CloseHandle(handle)

	buffer := make([]uint16, windows.MAX_PATH)
	size := uint32(len(buffer))
	for {
		err = windows.QueryFullProcessImageName(handle, 0, &buffer[0], &size)
		if err == nil {
			return windows.UTF16ToString(buffer[:size]), nil
		}
		if len(buffer) > 32768 {
			return "", err
		}
		buffer = make([]uint16, len(buffer)*2)
		size = uint32(len(buffer))
	}
}

func processUserSID(pid uint32) (string, error) {
	handle, err := windows.OpenProcess(windows.PROCESS_QUERY_LIMITED_INFORMATION, false, pid)
	if err != nil {
		return "", err
	}
	defer windows.CloseHandle(handle)

	var token windows.Token
	if err := windows.OpenProcessToken(handle, windows.TOKEN_QUERY, &token); err != nil {
		return "", err
	}
	defer token.Close()

	user, err := token.GetTokenUser()
	if err != nil {
		return "", err
	}
	return user.User.Sid.String(), nil
}
