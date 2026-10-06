//go:build darwin

package main

import (
	"fmt"
	"os"
	"strings"
	"testing"
)

func TestDarwinFTPStartupAndStopFailures(t *testing.T) {
	savedWrite, savedRead, savedCommand, savedTable, savedRemove := ftpWriteState, ftpReadState, ftpJobCommand, ftpProcessTable, ftpRemoveState
	defer func() {
		ftpWriteState, ftpReadState, ftpJobCommand, ftpProcessTable, ftpRemoveState = savedWrite, savedRead, savedCommand, savedTable, savedRemove
	}()
	p := darwinPolicy{UID: 501}
	var state *darwinFTPState
	job := false
	bootoutFailure := false
	observationFailure := false
	mainAlive := true
	childAlive := true
	ftpWriteState = func(_ darwinPolicy, value darwinFTPState) error { copy := value; state = &copy; return nil }
	ftpReadState = func(darwinPolicy) (darwinFTPState, error) {
		if state == nil {
			return darwinFTPState{}, os.ErrNotExist
		}
		return *state, nil
	}
	ftpRemoveState = func(darwinPolicy) error { state = nil; return nil }
	ftpProcessTable = func() (map[int]darwinFTPProcess, error) {
		if observationFailure {
			return nil, fmt.Errorf("table unavailable")
		}
		result := map[int]darwinFTPProcess{}
		if mainAlive {
			result[101] = darwinFTPProcess{101, 1, 101, "birth-main"}
		}
		if childAlive {
			result[202] = darwinFTPProcess{202, 101, 202, "birth-child"}
		}
		return result, nil
	}
	ftpJobCommand = func(args ...string) (string, error) {
		switch args[0] {
		case "bootstrap":
			job = true
			return "", fmt.Errorf("bootstrap acknowledgement failed")
		case "print":
			if !job {
				return "", fmt.Errorf("Could not find service")
			}
			return "pid = 101", nil
		case "bootout":
			if bootoutFailure {
				return "", fmt.Errorf("bootout failed")
			}
			job = false
			mainAlive = false
			return "", nil
		}
		return "", fmt.Errorf("unexpected command")
	}
	if _, err := beginDarwinFTPJob(p, "/user/pure-ftpd", "/fixed/job.plist"); err == nil || !strings.Contains(err.Error(), "intent retained") || !strings.Contains(err.Error(), "bootstrap acknowledgement failed") {
		t.Fatal("bootstrap failure must retain the actual error and describe its recovery state", err)
	}
	if state == nil || state.PID != 0 {
		t.Fatal("intent missing after failed bootstrap")
	}
	bootoutFailure = true
	if _, err := stopDarwinFTPJob(p); err == nil {
		t.Fatal("bootout failure reported success")
	}
	if state == nil || state.PID != 101 || state.Members[202] != "birth-child" {
		t.Fatal("PID/session identity not retained", state)
	}
	bootoutFailure = false
	calls := 0
	table := ftpProcessTable
	ftpProcessTable = func() (map[int]darwinFTPProcess, error) {
		calls++
		if calls > 1 {
			return nil, fmt.Errorf("verification unavailable after bootout")
		}
		return table()
	}
	if _, err := stopDarwinFTPJob(p); err == nil {
		t.Fatal("unknown post-bootout result reported success")
	}
	if job || state == nil {
		t.Fatal("expected absent job with retained state")
	}
	ftpProcessTable = table
	childAlive = false
	if pid, err := stopDarwinFTPJob(p); err != nil || pid != 101 {
		t.Fatal("retry after absent job failed", pid, err)
	}
	if state != nil {
		t.Fatal("successful stop retained state")
	}
	job = true
	if _, err := stopDarwinFTPJob(p); err == nil {
		t.Fatal("unregistered loaded job reported stopped")
	}
	if _, err := refreshDarwinFTPUsers(p); err == nil {
		t.Fatal("unregistered loaded job reported refreshed")
	}
	state = &darwinFTPState{Bin: "/user/pure-ftpd", PID: 101, Birth: "old-birth"}
	mainAlive = true
	if _, err := stopDarwinFTPJob(p); err == nil || !strings.Contains(err.Error(), "reused") {
		t.Fatal("PID reuse accepted", err)
	}
	if state == nil || !job {
		t.Fatal("PID reuse changed managed state")
	}
}

func TestDarwinFTPStopRetainsUnknownSessionIdentity(t *testing.T) {
	savedWrite, savedRead, savedCommand, savedTable, savedRemove := ftpWriteState, ftpReadState, ftpJobCommand, ftpProcessTable, ftpRemoveState
	defer func() {
		ftpWriteState, ftpReadState, ftpJobCommand, ftpProcessTable, ftpRemoveState = savedWrite, savedRead, savedCommand, savedTable, savedRemove
	}()
	state := darwinFTPState{Bin: "/user/pure-ftpd", PID: 101, Birth: "main", Members: map[int]string{202: "child"}}
	removed := false
	ftpReadState = func(darwinPolicy) (darwinFTPState, error) { return state, nil }
	ftpWriteState = func(_ darwinPolicy, next darwinFTPState) error { state = next; return nil }
	ftpRemoveState = func(darwinPolicy) error { removed = true; return nil }
	ftpJobCommand = func(...string) (string, error) { return "", fmt.Errorf("Could not find service") }
	ftpProcessTable = func() (map[int]darwinFTPProcess, error) {
		return map[int]darwinFTPProcess{202: {PID: 202, PGID: 202}}, nil
	}
	if _, err := stopDarwinFTPJob(darwinPolicy{UID: 501}); err == nil {
		t.Fatal("a tracked PID with unreadable identity was reported stopped")
	}
	if removed || state.Members[202] != "child" {
		t.Fatal("unknown session identity discarded recovery state")
	}
}
