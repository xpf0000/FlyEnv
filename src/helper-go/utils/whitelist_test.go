package utils

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestValidateScalarInputs(t *testing.T) {
	validPorts := []string{"1", "80", "65535"}
	for _, port := range validPorts {
		if err := ValidatePort(port); err != nil {
			t.Fatalf("ValidatePort(%q) returned error: %v", port, err)
		}
	}
	invalidPorts := []string{"0", "65536", "abc", "80\n90"}
	for _, port := range invalidPorts {
		if err := ValidatePort(port); err == nil {
			t.Fatalf("ValidatePort(%q) should fail", port)
		}
	}

	validPids := []string{"2", "12345"}
	for _, pid := range validPids {
		if err := ValidatePID(pid); err != nil {
			t.Fatalf("ValidatePID(%q) returned error: %v", pid, err)
		}
	}
	invalidPids := []string{"0", "1", "-1", "abc", "123\n456"}
	for _, pid := range invalidPids {
		if err := ValidatePID(pid); err == nil {
			t.Fatalf("ValidatePID(%q) should fail", pid)
		}
	}

	validModes := []string{"644", "0755", "777"}
	for _, mode := range validModes {
		if err := ValidateChmodMode(mode); err != nil {
			t.Fatalf("ValidateChmodMode(%q) returned error: %v", mode, err)
		}
	}
	invalidModes := []string{"", "888", "7555", "u+rwx"}
	for _, mode := range invalidModes {
		if err := ValidateChmodMode(mode); err == nil {
			t.Fatalf("ValidateChmodMode(%q) should fail", mode)
		}
	}
}

func TestValidateNamesAndUsers(t *testing.T) {
	if err := ValidateCertificateName("FlyEnv-Root-CA.crt"); err != nil {
		t.Fatalf("ValidateCertificateName returned error: %v", err)
	}
	for _, name := range []string{"../FlyEnv-Root-CA.crt", "FlyEnv.pem", "bad/name.crt"} {
		if err := ValidateCertificateName(name); err == nil {
			t.Fatalf("ValidateCertificateName(%q) should fail", name)
		}
	}

	if err := ValidateCommonName("FlyEnv-Root-CA"); err != nil {
		t.Fatalf("ValidateCommonName returned error: %v", err)
	}
	for _, name := range []string{"bad\nname", strings.Repeat("a", 129)} {
		if err := ValidateCommonName(name); err == nil {
			t.Fatalf("ValidateCommonName(%q) should fail", name)
		}
	}

	for _, user := range []string{"501:20", "mysql:mysql", "www"} {
		if err := ValidateChownUser(user); err != nil {
			t.Fatalf("ValidateChownUser(%q) returned error: %v", user, err)
		}
	}
	for _, user := range []string{"-R", "root;rm", "bad user"} {
		if err := ValidateChownUser(user); err == nil {
			t.Fatalf("ValidateChownUser(%q) should fail", user)
		}
	}
}

func TestValidateSystemEnv(t *testing.T) {
	if err := ValidateSystemEnvKey("FLYENV_ALIAS", false); err != nil {
		t.Fatalf("FLYENV_ALIAS should be allowed: %v", err)
	}
	if err := ValidateSystemEnvKey("JAVA_HOME", true); err != nil {
		t.Fatalf("JAVA_HOME should be allowed when whitelisted: %v", err)
	}
	for _, key := range []string{"PATH", "bad", "BAD-NAME", "1BAD"} {
		if err := ValidateSystemEnvKey(key, false); err == nil {
			t.Fatalf("ValidateSystemEnvKey(%q) should fail", key)
		}
	}
}

func TestValidateSystemPathEntry(t *testing.T) {
	absolutePath := "/usr/local/bin"
	if runtime.GOOS == "windows" {
		absolutePath = `C:\FlyEnv\bin`
	}

	valid := []string{absolutePath, `%SystemRoot%\System32`, `%APPDATA%\Composer\vendor\bin`}
	for _, entry := range valid {
		if err := ValidateSystemPathEntry(entry); err != nil {
			t.Fatalf("ValidateSystemPathEntry(%q) returned error: %v", entry, err)
		}
	}

	invalid := []string{
		"",
		`relative\bin`,
		`$env:SystemRoot\System32`,
		`C:\FlyEnv;"bad"`,
		`C:\FlyEnv\..\Windows`,
		`%BAD`,
		`%BAD%\..\Windows`,
	}
	for _, entry := range invalid {
		if err := ValidateSystemPathEntry(entry); err == nil {
			t.Fatalf("ValidateSystemPathEntry(%q) should fail", entry)
		}
	}
}

func TestAllowedRootsFilePresentDisablesNameFallback(t *testing.T) {
	oldOverride := allowedRootsFilePathForTesting
	defer func() {
		allowedRootsFilePathForTesting = oldOverride
	}()

	dir := t.TempDir()
	managedPath := filepath.Join(dir, "FlyEnv-Data", "app")

	allowedRootsFilePathForTesting = filepath.Join(dir, "missing.allowed-roots")
	if !isBusinessPathAllowed(managedPath) {
		t.Fatal("missing allowed-roots file should keep managed-name fallback")
	}

	allowedRootsFilePathForTesting = filepath.Join(dir, "flyenv.allowed-roots")
	oversized := strings.Repeat("a", 64*1024+1)
	if err := os.WriteFile(allowedRootsFilePathForTesting, []byte(oversized), 0600); err != nil {
		t.Fatal(err)
	}
	if isBusinessPathAllowed(managedPath) {
		t.Fatal("present but invalid allowed-roots file should disable managed-name fallback")
	}
}

func TestUnixPackageManagerBusinessPaths(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("Unix path rules")
	}

	homebrewPHP := []string{
		"/opt/homebrew/etc/php/8.3/php.ini",
		"/usr/local/lib/php/pecl/20230831/xdebug.so",
		"/home/linuxbrew/.linuxbrew/etc/php/8.2/php.ini",
	}
	for _, path := range homebrewPHP {
		if !isHomebrewPHPPath(path) {
			t.Fatalf("Homebrew PHP path should be allowed: %s", path)
		}
	}

	if !isHomebrewPackagePath("/opt/homebrew/Cellar/rabbitmq/3.13.7/sbin", "rabbitmq") {
		t.Fatal("Homebrew rabbitmq package path should be recognized")
	}
	if !isHomebrewPackagePath("/usr/local/Cellar/python@3.12/3.12.4/bin", "python") {
		t.Fatal("Homebrew versioned python package path should be recognized")
	}
	if isHomebrewPackagePath("/opt/homebrew/Cellar/not-python/1.0/bin", "python") {
		t.Fatal("unrelated Homebrew package should not be recognized as python")
	}
}

func TestPythonExecutableSymlinkRule(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("Unix path rules")
	}

	valid := [][2]string{
		{
			"/opt/local/Library/Frameworks/Python.framework/Versions/3.12/bin/python3",
			"/opt/local/Library/Frameworks/Python.framework/Versions/3.12/bin/python",
		},
		{
			"/Library/Frameworks/Python.framework/Versions/3.12/bin/python3",
			"/Library/Frameworks/Python.framework/Versions/3.12/bin/python",
		},
		{
			"/opt/homebrew/Cellar/python@3.12/3.12.4/bin/python3",
			"/opt/homebrew/Cellar/python@3.12/3.12.4/bin/python",
		},
	}
	for _, pair := range valid {
		if !isPythonExecutableSymlink(pair[0], pair[1]) {
			t.Fatalf("python executable symlink pair should be allowed: %s -> %s", pair[0], pair[1])
		}
	}

	if isPythonExecutableSymlink(
		"/opt/homebrew/Cellar/python@3.12/3.12.4/bin/pip3",
		"/opt/homebrew/Cellar/python@3.12/3.12.4/bin/pip",
	) {
		t.Fatal("only python3 -> python should match the Python executable symlink rule")
	}
}

func TestPathHasSymlinkComponentRejectsOrdinarySymlink(t *testing.T) {
	root, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	realDir := filepath.Join(root, "real")
	aliasDir := filepath.Join(root, "alias")
	if err := os.MkdirAll(realDir, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(realDir, aliasDir); err != nil {
		t.Fatal(err)
	}
	hasSymlink, err := PathHasSymlinkComponent(filepath.Join(aliasDir, "start-1.sh"))
	if err != nil {
		t.Fatal(err)
	}
	if !hasSymlink {
		t.Fatal("ordinary symlink component should be rejected")
	}
}

func TestPathSymlinkWalkerSkipsOnlyTrustedComponent(t *testing.T) {
	root, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	realHome := filepath.Join(root, "var-home")
	aliasHome := filepath.Join(root, "home")
	serviceDir := filepath.Join(realHome, "user", "FlyEnv", "server")
	if err := os.MkdirAll(serviceDir, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(realHome, aliasHome); err != nil {
		t.Fatal(err)
	}
	scriptPath := filepath.Join(aliasHome, "user", "FlyEnv", "server", "start-1.sh")
	trustAlias := func(path string, _ os.FileInfo) bool { return pathEqual(path, aliasHome) }
	hasSymlink, err := pathHasSymlinkComponent(scriptPath, trustAlias)
	if err != nil {
		t.Fatal(err)
	}
	if hasSymlink {
		t.Fatal("modeled trusted home alias should be skipped")
	}

	outsideDir := filepath.Join(root, "outside")
	if err := os.MkdirAll(outsideDir, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outsideDir, filepath.Join(serviceDir, "nested")); err != nil {
		t.Fatal(err)
	}
	nestedScriptPath := filepath.Join(aliasHome, "user", "FlyEnv", "server", "nested", "start-2.sh")
	hasSymlink, err = pathHasSymlinkComponent(nestedScriptPath, trustAlias)
	if err != nil {
		t.Fatal(err)
	}
	if !hasSymlink {
		t.Fatal("nested user-controlled symlink should still be rejected")
	}
}
