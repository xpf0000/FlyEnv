//go:build linux || darwin

package main

import "testing"

func TestManagedHostsStartQuitCyclesPreserveWhitespace(t *testing.T) {
	for _, original := range []string{"", "127.0.0.1 localhost\n", "127.0.0.1 localhost\n\n\n", "127.0.0.1 localhost\r\n\r\n"} {
		t.Run(original, func(t *testing.T) {
			content := original
			for cycle := 0; cycle < 10; cycle++ {
				started, err := mergeManagedHosts(content, "127.0.0.1 demo.test\n")
				if err != nil {
					t.Fatal(err)
				}
				again, err := mergeManagedHosts(started, "127.0.0.1 demo.test\n")
				if err != nil || again != started {
					t.Fatalf("startup must be idempotent: %q, %v", again, err)
				}
				content, err = mergeManagedHosts(started, "")
				if err != nil || content != original {
					t.Fatalf("quit cycle %d left whitespace: got %q, want %q, %v", cycle, content, original, err)
				}
				clearedAgain, err := mergeManagedHosts(content, "")
				if err != nil || clearedAgain != original {
					t.Fatalf("repeated quit changed content: %q, %v", clearedAgain, err)
				}
			}
		})
	}
}

func TestManagedHostsClearRemovesOnlyBlockLineEnding(t *testing.T) {
	for _, tc := range []struct{ name, content, want string }{
		{"lf", "before\n#X-HOSTS-BEGIN#\nold\n#X-HOSTS-END#\n\nafter\n", "before\n\nafter\n"},
		{"crlf", "before\r\n#X-HOSTS-BEGIN#\r\nold\r\n#X-HOSTS-END#\r\n\r\nafter\r\n", "before\r\n\r\nafter\r\n"},
		{"no final newline", "before\n#X-HOSTS-BEGIN#\nold\n#X-HOSTS-END#", "before\n"},
		{"block only without newline", "#X-HOSTS-BEGIN#\nold\n#X-HOSTS-END#", ""},
		{"block only with newline", "#X-HOSTS-BEGIN#\nold\n#X-HOSTS-END#\n", ""},
		{"blank lines before block", "before\n\n\n#X-HOSTS-BEGIN#\nold\n#X-HOSTS-END#", "before\n\n\n"},
		{"empty block", "before\n#X-HOSTS-BEGIN##X-HOSTS-END#\n", "before\n"},
		{"inline tail", "before\n#X-HOSTS-BEGIN#\nold\n#X-HOSTS-END#tail\n", "before\ntail\n"},
		{"inline prefix", "before#X-HOSTS-BEGIN#\nold\n#X-HOSTS-END#\nafter\n", "before\nafter\n"},
		{"indented marker", "before\n  #X-HOSTS-BEGIN#\nold\n#X-HOSTS-END#\nafter\n", "before\n  \nafter\n"},
		{"lone carriage return", "before\n#X-HOSTS-BEGIN#\nold\n#X-HOSTS-END#\r", "before\n\r"},
		{"adjacent blocks", "before\n#X-HOSTS-BEGIN#\nold\n#X-HOSTS-END##X-HOSTS-BEGIN#\nold2\n#X-HOSTS-END#\n", "before\n"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got, err := mergeManagedHosts(tc.content, "")
			if err != nil || got != tc.want {
				t.Fatalf("got %q, want %q, %v", got, tc.want, err)
			}
		})
	}
}

func TestManagedHostsDuplicateReplacementKeepsTailSeparate(t *testing.T) {
	content := "before\n#X-HOSTS-BEGIN#\nold\n#X-HOSTS-END##X-HOSTS-BEGIN#\nold2\n#X-HOSTS-END#\nafter\n"
	want := "before\n#X-HOSTS-BEGIN#\n127.0.0.1 demo.test\n#X-HOSTS-END#\nafter\n"
	got, err := mergeManagedHosts(content, "127.0.0.1 demo.test")
	if err != nil || got != want {
		t.Fatalf("duplicate removal joined managed and user lines: got %q, want %q, %v", got, want, err)
	}
}

func TestManagedHostsInitiallyUnterminatedFileStaysStable(t *testing.T) {
	content := "127.0.0.1 localhost"
	for cycle := 0; cycle < 10; cycle++ {
		started, err := mergeManagedHosts(content, "127.0.0.1 demo.test")
		if err != nil {
			t.Fatal(err)
		}
		content, err = mergeManagedHosts(started, "")
		// Appending a separate hosts entry requires terminating the original line.
		// That separator must remain stable, never grow on subsequent cycles.
		if err != nil || content != "127.0.0.1 localhost\n" {
			t.Fatalf("cycle %d: got %q, %v", cycle, content, err)
		}
	}
}

func TestManagedHostsReplacementPreservesLineEndings(t *testing.T) {
	for _, ending := range []string{"", "\n", "\r\n", "\n\n# tail\n"} {
		content := "before\n\n#X-HOSTS-BEGIN#\nold\n#X-HOSTS-END#" + ending
		want := "before\n\n#X-HOSTS-BEGIN#\n127.0.0.1 demo.test\n#X-HOSTS-END#" + ending
		got, err := mergeManagedHosts(content, "127.0.0.1 demo.test")
		if err != nil || got != want {
			t.Fatalf("replacement changed outside whitespace: got %q, want %q, %v", got, want, err)
		}
	}
}

func TestManagedHostsRejectsAmbiguousMarkers(t *testing.T) {
	for _, content := range []string{
		"before\n#X-HOSTS-BEGIN#\nold\n",
		"before\n#X-HOSTS-END#\nafter\n",
		"#X-HOSTS-END#\n#X-HOSTS-BEGIN#\n",
		"#X-HOSTS-BEGIN#\n#X-HOSTS-BEGIN#\n#X-HOSTS-END#\n",
		"#X-HOSTS-BEGIN#\nold\n#X-HOSTS-END#\n#X-HOSTS-END#\n",
	} {
		for _, entries := range []string{"", "127.0.0.1 demo.test"} {
			if _, err := mergeManagedHosts(content, entries); err == nil {
				t.Fatalf("ambiguous markers must reject the whole write: %q", content)
			}
		}
	}
}
