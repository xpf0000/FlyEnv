package module

import (
	"runtime"
	"testing"
	"time"
)

func TestParseProcessListCreation(t *testing.T) {
	rows, err := parseProcessList("user 4200 1 Tue Oct  6 08:09:10 2026 /Applications/My Service/bin/server\nroot 4201 1 Tue Oct  6 08:09:11 2026\n")
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 2 || rows[0].CREATED != "2026-10-06T08:09:10.000Z" || rows[0].COMMAND != "/Applications/My Service/bin/server" || rows[1].COMMAND != "" {
		t.Fatalf("unexpected process rows: %+v", rows)
	}
	for _, input := range []string{"", "user 4200 1 not a start time server", "user x 1 Tue Oct 6 08:09:10 2026 server"} {
		if _, err := parseProcessList(input); err == nil {
			t.Fatalf("accepted invalid process list: %q", input)
		}
	}
}

func TestProcessListCreation(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("Unix process provider")
	}
	rows, err := (&ToolManager{}).ProcessList()
	if err != nil {
		t.Fatal(err)
	}
	for _, row := range rows {
		if _, err := time.Parse(time.RFC3339Nano, row.CREATED); err != nil {
			t.Fatalf("invalid creation time for PID %s: %q", row.PID, row.CREATED)
		}
	}
}
