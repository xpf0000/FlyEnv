package utils

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"strconv"
	"strings"
)

const allowedRootsFileUnix = "/usr/local/share/FlyEnv/flyenv.allowed-roots"

var (
	envKeyPattern       = regexp.MustCompile(`^[A-Z][A-Z0-9_]{0,63}$`)
	chownUserPattern    = regexp.MustCompile(`^([0-9]+:[0-9]+|[A-Za-z0-9_.-]+(:[A-Za-z0-9_.-]+)?)$`)
	commonNamePattern   = regexp.MustCompile(`^[A-Za-z0-9_.:@ -]{1,128}$`)
	certNamePattern     = regexp.MustCompile(`^[A-Za-z0-9_.-]{1,128}\.crt$`)
	autoTaskNamePattern = regexp.MustCompile(`^[A-Za-z0-9_. -]{1,64}$`)
)

var allowedRootsFilePathForTesting string

var shellProfileFiles = map[string]bool{
	".bash_login":   true,
	".bash_profile": true,
	".bashrc":       true,
	".profile":      true,
	".zprofile":     true,
	".zshrc":        true,
}

var allowedEnvKeys = map[string]bool{
	"ERLANG_HOME": true,
	"GRADLE_HOME": true,
	"JAVA_HOME":   true,
}

var allowedAutoStartTasks = map[string]bool{
	"FlyEnvHelperTask": true,
	"FlyEnvStartup":    true,
	"flyenv-helper":    true,
}

type configuredAllowedRoots struct {
	roots       []string
	filePresent bool
}

func hasPathTraversal(path string) bool {
	if path == "" {
		return false
	}
	seps := []string{string(filepath.Separator), "/", "\\"}
	for _, sep := range seps {
		parts := strings.Split(path, sep)
		for _, part := range parts {
			if part == ".." {
				return true
			}
		}
	}
	return false
}

func hasControlChars(value string) bool {
	return strings.ContainsAny(value, "\x00\r\n")
}

func cleanAbsPath(path string) (string, error) {
	path = strings.TrimSpace(path)
	if path == "" {
		return "", fmt.Errorf("path is empty")
	}
	if hasControlChars(path) {
		return "", fmt.Errorf("path contains control characters")
	}
	if hasPathTraversal(path) {
		return "", fmt.Errorf("path traversal is not allowed")
	}
	clean := filepath.Clean(path)
	if !filepath.IsAbs(clean) {
		return "", fmt.Errorf("path must be absolute")
	}
	if isRootPath(clean) {
		return "", fmt.Errorf("refusing root path")
	}
	return clean, nil
}

func isRootPath(path string) bool {
	clean := filepath.Clean(path)
	volume := filepath.VolumeName(clean)
	rest := strings.TrimPrefix(clean, volume)
	return rest == string(filepath.Separator) || rest == "" || rest == "."
}

func comparePath(path string) string {
	clean := filepath.ToSlash(filepath.Clean(path))
	clean = strings.TrimRight(clean, "/")
	if runtime.GOOS == "windows" {
		clean = strings.ToLower(clean)
	}
	return clean
}

func pathEqual(a, b string) bool {
	return comparePath(a) == comparePath(b)
}

func pathInDir(path, dir string) bool {
	p := comparePath(path)
	d := comparePath(dir)
	return p == d || strings.HasPrefix(p, d+"/")
}

func allowedRootsFilePath() string {
	if allowedRootsFilePathForTesting != "" {
		return allowedRootsFilePathForTesting
	}
	if runtime.GOOS == "windows" {
		programData := os.Getenv("ProgramData")
		if programData == "" {
			programData = `C:\ProgramData`
		}
		return filepath.Join(programData, "FlyEnv", "flyenv.allowed-roots")
	}
	return allowedRootsFileUnix
}

func readConfiguredAllowedRoots() configuredAllowedRoots {
	path := allowedRootsFilePath()
	info, err := os.Lstat(path)
	if err != nil {
		if !os.IsNotExist(err) {
			fmt.Printf("Warning: failed to inspect FlyEnv allowed roots file '%s': %v\n", path, err)
			return configuredAllowedRoots{filePresent: true}
		}
		return configuredAllowedRoots{}
	}
	if info.Mode()&os.ModeSymlink != 0 || !info.Mode().IsRegular() || info.Size() > 64*1024 {
		fmt.Printf("Warning: ignoring invalid FlyEnv allowed roots file: %s\n", path)
		return configuredAllowedRoots{filePresent: true}
	}
	if err := validateAllowedRootsFileSecurity(path, info); err != nil {
		fmt.Printf("Warning: ignoring insecure FlyEnv allowed roots file '%s': %v\n", path, err)
		return configuredAllowedRoots{filePresent: true}
	}
	data, err := os.ReadFile(path)
	if err != nil {
		fmt.Printf("Warning: failed to read FlyEnv allowed roots file '%s': %v\n", path, err)
		return configuredAllowedRoots{filePresent: true}
	}

	lines := strings.Split(string(data), "\n")
	roots := make([]string, 0, len(lines))
	seen := make(map[string]bool)
	for _, line := range lines {
		line = strings.TrimPrefix(line, "\ufeff")
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		clean, err := cleanAbsPath(line)
		if err != nil {
			fmt.Printf("Warning: ignoring invalid FlyEnv allowed root '%s': %v\n", line, err)
			continue
		}
		key := comparePath(clean)
		if seen[key] {
			continue
		}
		seen[key] = true
		roots = append(roots, clean)
	}
	return configuredAllowedRoots{roots: roots, filePresent: true}
}

func isConfiguredAllowedRoot(path string, roots []string) bool {
	for _, root := range roots {
		if pathInDir(path, root) {
			return true
		}
	}
	return false
}

func windowsHostsPathCandidates() []string {
	systemRoot := os.Getenv("SystemRoot")
	if systemRoot == "" {
		systemRoot = `C:\Windows`
	}
	return []string{
		filepath.Join(systemRoot, "System32", "drivers", "etc", "hosts"),
		`C:\Windows\System32\drivers\etc\hosts`,
		`c:\windows\system32\drivers\etc\hosts`,
	}
}

func isExplicitSystemFile(path string) bool {
	if runtime.GOOS == "windows" {
		for _, candidate := range windowsHostsPathCandidates() {
			if pathEqual(path, candidate) {
				return true
			}
		}
		return false
	}
	allowed := []string{
		"/etc/hosts",
		"/etc/paths",
		"/etc/profile",
		"/private/etc/hosts",
		"/private/etc/paths",
		"/private/etc/profile",
	}
	for _, item := range allowed {
		if pathEqual(path, item) {
			return true
		}
	}
	return false
}

func isSensitiveSystemPath(path string) bool {
	if runtime.GOOS == "windows" {
		systemRoot := os.Getenv("SystemRoot")
		if systemRoot == "" {
			systemRoot = `C:\Windows`
		}
		sensitive := []string{
			filepath.Join(systemRoot, "System32"),
			filepath.Join(systemRoot, "SysWOW64"),
		}
		for _, s := range sensitive {
			if pathInDir(path, s) {
				return true
			}
		}
		return false
	}

	sensitiveFiles := []string{
		"/etc/group",
		"/etc/gshadow",
		"/etc/master.passwd",
		"/etc/passwd",
		"/etc/shadow",
		"/etc/sudoers",
	}
	for _, item := range sensitiveFiles {
		if pathEqual(path, item) {
			return true
		}
	}
	return false
}

func isManagedPathByName(path string) bool {
	p := strings.ToLower(filepath.ToSlash(path))
	fragments := []string{
		"/flyenv",
		"/flyenv.app",
		"/php-web-study",
		"/phpwebstudy",
		"/phpwebstudy-data",
	}
	for _, fragment := range fragments {
		if strings.Contains(p, fragment) {
			return true
		}
	}
	return false
}

func isManagedPathByExecutable(path string) bool {
	exe, err := os.Executable()
	if err != nil {
		return false
	}
	exe = filepath.Clean(exe)
	dir := filepath.Dir(exe)
	for {
		base := strings.ToLower(filepath.Base(dir))
		if strings.Contains(base, "flyenv") || strings.Contains(base, "phpwebstudy") || strings.Contains(base, "php-web-study") {
			return pathInDir(path, dir)
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}
	return false
}

func isWindowsProgramFilesFlyEnvPath(path string) bool {
	if runtime.GOOS != "windows" {
		return false
	}
	candidates := []string{
		os.Getenv("ProgramFiles"),
		os.Getenv("ProgramFiles(x86)"),
	}
	for _, dir := range candidates {
		if dir == "" || !pathInDir(path, dir) {
			continue
		}
		p := strings.ToLower(filepath.ToSlash(path))
		return strings.Contains(p, "/flyenv") || strings.Contains(p, "/phpwebstudy") || strings.Contains(p, "/php-web-study")
	}
	return false
}

func isMacPortsPath(path string) bool {
	if runtime.GOOS == "windows" {
		return false
	}
	allowed := []string{
		"/opt/local/etc/macports",
		"/opt/local/etc",
		"/opt/local/lib",
		"/opt/local/share",
	}
	for _, dir := range allowed {
		if pathInDir(path, dir) {
			return true
		}
	}
	return false
}

func isHomebrewPHPPath(path string) bool {
	if runtime.GOOS == "windows" {
		return false
	}
	allowed := []string{
		"/opt/homebrew/etc/php",
		"/opt/homebrew/lib/php",
		"/usr/local/etc/php",
		"/usr/local/lib/php",
		"/home/linuxbrew/.linuxbrew/etc/php",
		"/home/linuxbrew/.linuxbrew/lib/php",
	}
	for _, dir := range allowed {
		if pathInDir(path, dir) {
			return true
		}
	}
	return false
}

func isHomebrewPackagePath(path, packageName string) bool {
	if runtime.GOOS == "windows" {
		return false
	}
	cellarDirs := []string{
		"/opt/homebrew/Cellar",
		"/usr/local/Cellar",
		"/home/linuxbrew/.linuxbrew/Cellar",
	}
	p := comparePath(path)
	for _, cellar := range cellarDirs {
		c := comparePath(cellar)
		if p != c && !strings.HasPrefix(p, c+"/") {
			continue
		}
		rel := strings.TrimPrefix(p, c)
		rel = strings.TrimPrefix(rel, "/")
		first := strings.Split(rel, "/")[0]
		return first == packageName || strings.HasPrefix(first, packageName+"@")
	}
	return false
}

func isFlyEnvSharedPath(path string) bool {
	if runtime.GOOS == "windows" {
		return false
	}
	allowed := []string{
		"/Applications/FlyEnv.app",
		"/Library/Application Support/FlyEnv",
		"/usr/local/share/FlyEnv",
	}
	for _, dir := range allowed {
		if pathInDir(path, dir) {
			return true
		}
	}
	return false
}

func isUserHomeProfilePath(path string) bool {
	if runtime.GOOS == "windows" {
		return false
	}
	p := filepath.ToSlash(filepath.Clean(path))
	if !(strings.HasPrefix(p, "/Users/") || strings.HasPrefix(p, "/home/")) {
		return false
	}
	base := filepath.Base(p)
	if shellProfileFiles[base] {
		return true
	}
	if base != "config.fish" {
		return false
	}
	fishDir := filepath.Base(filepath.Dir(p))
	configDir := filepath.Base(filepath.Dir(filepath.Dir(p)))
	return fishDir == "fish" && configDir == ".config"
}

func isBusinessPathAllowed(path string) bool {
	configured := readConfiguredAllowedRoots()
	if isConfiguredAllowedRoot(path, configured.roots) ||
		isExplicitSystemFile(path) ||
		isFlyEnvSharedPath(path) ||
		isMacPortsPath(path) ||
		isHomebrewPHPPath(path) ||
		isUserHomeProfilePath(path) {
		return true
	}
	if !configured.filePresent {
		return isManagedPathByName(path) ||
			isManagedPathByExecutable(path) ||
			isWindowsProgramFilesFlyEnvPath(path)
	}
	return false
}

func PathHasSymlinkComponent(path string) (bool, error) {
	clean, err := cleanAbsPath(path)
	if err != nil {
		return false, err
	}
	for {
		info, statErr := os.Lstat(clean)
		if statErr == nil {
			if info.Mode()&os.ModeSymlink != 0 {
				return true, nil
			}
		} else if !os.IsNotExist(statErr) {
			return false, statErr
		}

		parent := filepath.Dir(clean)
		if parent == clean {
			break
		}
		clean = parent
	}
	return false, nil
}

func validatePathAccess(path string, forWrite bool) error {
	clean, err := cleanAbsPath(path)
	if err != nil {
		return err
	}
	if isExplicitSystemFile(clean) {
		if !(runtime.GOOS == "darwin" && pathInDir(clean, "/etc")) {
			hasSymlink, err := PathHasSymlinkComponent(clean)
			if err != nil {
				return err
			}
			if hasSymlink {
				return fmt.Errorf("path contains symlink component: %s", path)
			}
		}
		return nil
	}
	if isSensitiveSystemPath(clean) {
		return fmt.Errorf("sensitive system path is not allowed: %s", path)
	}
	if !isBusinessPathAllowed(clean) {
		return fmt.Errorf("path outside FlyEnv allowed scope: %s", path)
	}
	hasSymlink, err := PathHasSymlinkComponent(clean)
	if err != nil {
		return err
	}
	if hasSymlink {
		return fmt.Errorf("path contains symlink component: %s", path)
	}
	if forWrite && isRootPath(clean) {
		return fmt.Errorf("refusing root path: %s", path)
	}
	return nil
}

func ValidatePathForRead(path string) error {
	return validatePathAccess(path, false)
}

func ValidatePathForWrite(path string) error {
	return validatePathAccess(path, true)
}

func ValidatePathForRemove(path string) error {
	clean, err := cleanAbsPath(path)
	if err != nil {
		return err
	}
	if isExplicitSystemFile(clean) {
		return fmt.Errorf("refusing to remove protected system file: %s", path)
	}
	return validatePathAccess(clean, true)
}

func isPythonExecutableSymlink(oldname, newname string) bool {
	if runtime.GOOS == "windows" {
		return false
	}
	if filepath.Base(oldname) != "python3" || filepath.Base(newname) != "python" {
		return false
	}
	if !pathEqual(filepath.Dir(oldname), filepath.Dir(newname)) {
		return false
	}
	dir := filepath.Dir(oldname)
	frameworkDirs := []string{
		"/Library/Frameworks/Python.framework/Versions",
		"/opt/local/Library/Frameworks/Python.framework/Versions",
	}
	for _, root := range frameworkDirs {
		if pathInDir(dir, root) {
			return true
		}
	}
	return isHomebrewPackagePath(dir, "python")
}

func ValidateSymlinkPair(oldname, newname string) error {
	oldClean, oldErr := cleanAbsPath(oldname)
	if oldErr != nil {
		return oldErr
	}
	newClean, newErr := cleanAbsPath(newname)
	if newErr != nil {
		return newErr
	}
	if err := ValidatePathForRead(oldClean); err == nil {
		if err := ValidatePathForWrite(newClean); err == nil {
			return nil
		}
	}
	if !isPythonExecutableSymlink(oldClean, newClean) {
		return fmt.Errorf("symlink pair outside FlyEnv allowed scope: %s -> %s", oldname, newname)
	}
	if isSensitiveSystemPath(oldClean) || isSensitiveSystemPath(newClean) {
		return fmt.Errorf("sensitive system path is not allowed")
	}
	hasSymlink, err := PathHasSymlinkComponent(oldClean)
	if err != nil {
		return err
	}
	if hasSymlink {
		return fmt.Errorf("path contains symlink component: %s", oldname)
	}
	hasSymlink, err = PathHasSymlinkComponent(newClean)
	if err != nil {
		return err
	}
	if hasSymlink {
		return fmt.Errorf("path contains symlink component: %s", newname)
	}
	return nil
}

func ValidateRabbitMQPluginDir(cwd string) error {
	clean, err := cleanAbsPath(cwd)
	if err != nil {
		return err
	}
	if !isBusinessPathAllowed(clean) && !isHomebrewPackagePath(clean, "rabbitmq") {
		return fmt.Errorf("RabbitMQ plugin directory outside FlyEnv allowed scope: %s", cwd)
	}
	if isSensitiveSystemPath(clean) {
		return fmt.Errorf("sensitive system path is not allowed: %s", cwd)
	}
	if filepath.Base(clean) != "sbin" && filepath.Base(clean) != "bin" {
		return fmt.Errorf("invalid RabbitMQ plugin directory: %s", cwd)
	}
	hasSymlink, err := PathHasSymlinkComponent(clean)
	if err != nil {
		return err
	}
	if hasSymlink {
		return fmt.Errorf("path contains symlink component: %s", cwd)
	}
	plugin := filepath.Join(clean, "rabbitmq-plugins")
	if !ExistsSync(plugin) {
		return fmt.Errorf("rabbitmq-plugins not found in %s", cwd)
	}
	return nil
}

func IsPathAllowed(path string) bool {
	return ValidatePathForRead(path) == nil
}

func IsPathAllowedForWrite(path string) bool {
	return ValidatePathForWrite(path) == nil
}

func ValidateChmodMode(flag string) error {
	flag = strings.TrimSpace(flag)
	if matched, _ := regexp.MatchString(`^0?[0-7]{3}$`, flag); !matched {
		return fmt.Errorf("invalid chmod mode: %s", flag)
	}
	return nil
}

func ValidateSignal(sig string) error {
	allowed := map[string]bool{
		"-2":    true,
		"-9":    true,
		"-15":   true,
		"-INT":  true,
		"-KILL": true,
		"-TERM": true,
	}
	if !allowed[sig] {
		return fmt.Errorf("invalid signal: %s", sig)
	}
	return nil
}

func ValidatePID(pid string) error {
	if hasControlChars(pid) {
		return fmt.Errorf("invalid pid")
	}
	value, err := strconv.Atoi(strings.TrimSpace(pid))
	if err != nil || value <= 1 {
		return fmt.Errorf("invalid pid: %s", pid)
	}
	return nil
}

func ValidatePort(port string) error {
	if hasControlChars(port) {
		return fmt.Errorf("invalid port")
	}
	value, err := strconv.Atoi(strings.TrimSpace(port))
	if err != nil || value < 1 || value > 65535 {
		return fmt.Errorf("invalid port: %s", port)
	}
	return nil
}

func ValidateShell(shell string) error {
	allowed := map[string]bool{
		"/bin/bash": true,
		"/bin/zsh":  true,
	}
	if !allowed[shell] {
		return fmt.Errorf("invalid shell: %s", shell)
	}
	return nil
}

func ValidateRunScript(shell, scriptPath string) error {
	if err := ValidateShell(shell); err != nil {
		return err
	}
	if err := ValidatePathForRead(scriptPath); err != nil {
		return err
	}
	base := filepath.Base(scriptPath)
	if !strings.HasPrefix(base, "start-") || filepath.Ext(base) != ".sh" {
		return fmt.Errorf("invalid helper script name: %s", base)
	}
	return nil
}

func ValidateCertificateName(name string) error {
	if filepath.Base(name) != name || strings.ContainsAny(name, `/\`) {
		return fmt.Errorf("certificate name must be a basename")
	}
	if !certNamePattern.MatchString(name) {
		return fmt.Errorf("invalid certificate name: %s", name)
	}
	return nil
}

func ValidateCommonName(name string) error {
	if !commonNamePattern.MatchString(name) || hasControlChars(name) {
		return fmt.Errorf("invalid certificate common name")
	}
	return nil
}

func ValidateChownUser(user string) error {
	if strings.HasPrefix(user, "-") || !chownUserPattern.MatchString(user) {
		return fmt.Errorf("invalid chown user: %s", user)
	}
	return nil
}

func ValidateSystemEnvKey(key string, allowWhitelisted bool) error {
	if !envKeyPattern.MatchString(key) {
		return fmt.Errorf("invalid environment variable key: %s", key)
	}
	if strings.HasPrefix(key, "FLYENV_") {
		return nil
	}
	if allowWhitelisted && allowedEnvKeys[key] {
		return nil
	}
	return fmt.Errorf("environment variable key is not allowed: %s", key)
}

func ValidateSystemPathEntry(entry string) error {
	entry = strings.TrimSpace(entry)
	if entry == "" {
		return fmt.Errorf("empty PATH entry")
	}
	if hasControlChars(entry) || strings.ContainsAny(entry, `;"'`) {
		return fmt.Errorf("invalid PATH entry: %s", entry)
	}
	if strings.Contains(entry, "$env:") || strings.Contains(entry, "$ENV:") {
		return fmt.Errorf("PowerShell-style PATH entries are not allowed: %s", entry)
	}
	if strings.Contains(entry, "%") {
		if matched, _ := regexp.MatchString(`^%[A-Za-z0-9_]+%(\\[^<>"|?*\r\n;]*)?$`, entry); !matched {
			return fmt.Errorf("invalid environment PATH entry: %s", entry)
		}
		if hasPathTraversal(entry) {
			return fmt.Errorf("PATH entry contains traversal: %s", entry)
		}
		return nil
	}
	if !filepath.IsAbs(entry) {
		return fmt.Errorf("PATH entry must be absolute or environment based: %s", entry)
	}
	if hasPathTraversal(entry) {
		return fmt.Errorf("PATH entry contains traversal: %s", entry)
	}
	return nil
}

func ValidateSystemEnvValue(key, value string) error {
	if len(value) > 4096 || hasControlChars(value) {
		return fmt.Errorf("invalid environment variable value for %s", key)
	}
	if value == "" {
		return nil
	}
	if strings.Contains(value, "%") {
		return ValidateSystemPathEntry(value)
	}
	if filepath.IsAbs(value) {
		return ValidatePathForWrite(value)
	}
	if strings.ContainsAny(value, `/\`) {
		return fmt.Errorf("environment variable value must be an allowed path: %s", key)
	}
	return nil
}

func ValidateAutoStartTask(enabled bool, taskName, exePath string) error {
	if !autoTaskNamePattern.MatchString(taskName) || !allowedAutoStartTasks[taskName] {
		return fmt.Errorf("invalid auto-start task name: %s", taskName)
	}
	if !enabled && exePath == "" {
		return nil
	}
	clean, err := cleanAbsPath(exePath)
	if err != nil {
		return err
	}
	if isSensitiveSystemPath(clean) {
		return fmt.Errorf("sensitive system path is not allowed: %s", exePath)
	}
	base := strings.ToLower(filepath.Base(clean))
	allowedExe := map[string]bool{
		"electron.exe":      true,
		"flyenv-helper.exe": true,
		"flyenv.exe":        true,
		"phpwebstudy.exe":   true,
	}
	if !allowedExe[base] {
		return fmt.Errorf("invalid auto-start executable: %s", base)
	}
	if !isBusinessPathAllowed(clean) && !isManagedPathByName(clean) {
		return fmt.Errorf("auto-start executable outside FlyEnv allowed scope: %s", exePath)
	}
	return nil
}
