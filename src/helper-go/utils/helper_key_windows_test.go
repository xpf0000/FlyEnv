//go:build windows

package utils

import (
	"golang.org/x/sys/windows"
	"testing"
)

func TestWindowsHelperKeyACL(t *testing.T) {
	target := "S-1-5-21-100-200-300-400"
	for _, tc := range []struct {
		sddl    string
		allowed bool
	}{
		{"D:P(A;;FA;;;SY)(A;;FA;;;BA)(A;;FR;;;" + target + ")", true},
		{"D:P(A;;FA;;;SY)(A;;FR;;;WD)(A;;FR;;;" + target + ")", false},
		{"D:P(A;;FA;;;SY)(A;;FA;;;" + target + ")", false},
		{"D:P(A;;FA;;;SY)(A;;FR;;;S-1-5-21-100-200-300-500)", false},
		{"D:P(A;;FA;;;SY)", false},
	} {
		sd, err := windows.SecurityDescriptorFromString(tc.sddl)
		if err != nil {
			t.Fatal(err)
		}
		dacl, _, err := sd.DACL()
		if err != nil {
			t.Fatal(err)
		}
		err = validateWindowsKeyACL(dacl, target)
		if (err == nil) != tc.allowed {
			t.Fatalf("%s: %v", tc.sddl, err)
		}
	}
}
