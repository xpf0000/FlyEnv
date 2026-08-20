package module

import (
	"encoding/base64"
	"strings"
	"testing"
)

func TestFlyEnvDataDirectoryRecoveryScriptUsesEncodedArgumentsAndInheritedAccess(t *testing.T) {
	dataDirectory := `C:\Program Files\FlyEnv-Data`
	userSID := "S-1-5-21-100-200-300-400"
	script := flyEnvDataDirectoryRecoveryScript(dataDirectory, userSID)

	if strings.Contains(script, dataDirectory) || strings.Contains(script, userSID) {
		t.Fatal("the recovery PowerShell script must not interpolate path or SID text directly")
	}
	if !strings.Contains(script, base64.StdEncoding.EncodeToString([]byte(dataDirectory))) ||
		!strings.Contains(script, base64.StdEncoding.EncodeToString([]byte(userSID))) {
		t.Fatal("the recovery PowerShell script must decode its path and SID from base64")
	}
	if !strings.Contains(script, "FullControl") ||
		!strings.Contains(script, "ContainerInherit,ObjectInherit") {
		t.Fatal("the recovery script must restore inherited full control for the Helper user")
	}
}
