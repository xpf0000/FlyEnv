package module

import (
	"fmt"
	"helper-go/utils" // Import your utils package
	"path/filepath"   // For path.Join equivalent
	"strings"         // For string manipulation
)

// HostManager embeds BaseManager, providing common host-related functionalities.
type HostManager struct {
	BaseManager // Anonymous field for composition and method "inheritance"
}

// SslAddTrustedCert adds a CA certificate to the system's trusted store.
func (h *HostManager) SslAddTrustedCert(cwd, caName string) (bool, error) {
	var err error // Declare err here to be accessible after if/else blocks

	if utils.IsMacOS() {
		command := fmt.Sprintf(`security add-trusted-cert -d -r trustRoot -k "/Library/Keychains/System.keychain" "%s"`, caName)
		_, stderr, cmdErr := utils.ExecPromise(command, map[string]interface{}{"cwd": cwd})
		if cmdErr != nil {
			err = fmt.Errorf("macOS add-trusted-cert failed: %w, stderr: %s", cmdErr, stderr)
		}
	} else if utils.IsLinux() {
		caFile := filepath.Join(cwd, caName)
		debianUbuntuPath := fmt.Sprintf(`/usr/local/share/ca-certificates/%s`, caName)
		centosFedoraPath := fmt.Sprintf(`/etc/pki/ca-trust/source/anchors/%s`, caName)

		// Try Debian/Ubuntu path
		_, _, cmdErr := utils.ExecPromise(fmt.Sprintf(`sudo cp "%s" "%s"`, caFile, debianUbuntuPath), nil)
		if cmdErr == nil {
			// If copy successful, try updating certificates
			_, _, cmdErr = utils.ExecPromise("sudo update-ca-certificates", nil)
			if cmdErr != nil {
				err = fmt.Errorf("Linux update-ca-certificates (Debian/Ubuntu) failed: %w", cmdErr)
			}
		} else {
			// If Debian/Ubuntu path failed, try CentOS/Fedora path
			_, _, centosCmdErr := utils.ExecPromise(fmt.Sprintf(`sudo cp "%s" "%s"`, caFile, centosFedoraPath), nil)
			if centosCmdErr == nil {
				// If copy successful, try updating certificates
				_, _, centosCmdErr = utils.ExecPromise("sudo update-ca-trust extract", nil)
				if centosCmdErr != nil {
					err = fmt.Errorf("Linux update-ca-trust extract (CentOS/Fedora) failed: %w", centosCmdErr)
				}
			} else {
				err = fmt.Errorf("Linux copy CA file failed for both Debian/Ubuntu (%w) and CentOS/Fedora (%w) paths", cmdErr, centosCmdErr)
			}
		}
	} else {
		err = fmt.Errorf("unsupported operating system for sslAddTrustedCert")
	}

	if err != nil {
		fmt.Printf("Error in SslAddTrustedCert: %v\n", err)
		return false, err // Return false and the error
	}
	return true, nil // Success
}

// SslFindCertificate finds a certificate by common name.
func (h *HostManager) SslFindCertificate(cwd string, commonName ...string) (string, string, error) {
	cn := "FlyEnv-Root-CA" // Default value
	if len(commonName) > 0 {
		cn = commonName[0]
	}

	if utils.IsMacOS() {
		command := fmt.Sprintf(`security find-certificate -c "%s"`, cn)
		stdout, stderr, err := utils.ExecPromise(command, map[string]interface{}{"cwd": cwd})
		return stdout, stderr, err // Return all values directly
	} else if utils.IsLinux() {
		commonCaPaths := []string{
			"/etc/ssl/certs/",
			"/usr/local/share/ca-certificates/",
			"/etc/pki/ca-trust/source/anchors",
			"/etc/pki/ca-trust/extracted/pem/", // CentOS/RHEL/Fedora extracted path
			"/etc/pki/tls/certs/",
		}

		foundCertPath := ""

		for _, dir := range commonCaPaths {
			// Find .crt files. Note: Using `find` directly is more robust than `ls`.
			// `2>/dev/null` silences errors from `find` itself, matching JS's implicit ignore.
			findCmd := fmt.Sprintf(`find "%s" -name "*.crt" -print 2>/dev/null`, dir)
			findStdout, _, findErr := utils.ExecPromise(findCmd, nil)
			if findErr != nil {
				// Log find errors but continue searching other directories
				// fmt.Printf("Warning: find command in %s failed: %v\n", dir, findErr)
				continue
			}

			certFiles := strings.Fields(findStdout) // strings.Fields splits by whitespace and handles empty strings

			for _, filePath := range certFiles {
				if filePath == "" { // Skip empty lines if any
					continue
				}
				// Use openssl to check the certificate's Common Name
				// Errors from openssl are often expected for non-cert files or malformed ones.
				opensslCmd := fmt.Sprintf(`openssl x509 -in "%s" -text -noout`, filePath)
				opensslStdout, _, opensslErr := utils.ExecPromise(opensslCmd, nil)
				if opensslErr == nil && strings.Contains(opensslStdout, fmt.Sprintf("CN = %s", cn)) {
					foundCertPath = filePath
					break // Found, break inner loop
				}
			}
			if foundCertPath != "" {
				break // Found, break outer loop
			}
		}

		if foundCertPath != "" {
			return fmt.Sprintf("Found certificate: %s\n", foundCertPath), "", nil
		} else {
			return "", fmt.Sprintf("Certificate with CN \"%s\" not found on Linux.", cn), nil
		}
	}
	return "", "", fmt.Errorf("unsupported operating system for sslFindCertificate")
}

// DnsRefresh flushes the system's DNS cache.
func (h *HostManager) DnsRefresh() (bool, error) {
	if utils.IsMacOS() {
		// Attempt dscacheutil flush
		_, _, err1 := utils.ExecPromise(`dscacheutil -flushcache`, nil)
		if err1 != nil {
			fmt.Printf("Warning: Error flushing dscacheutil cache: %v\n", err1)
		}

		// Attempt mDNSResponder killall -HUP
		_, _, err2 := utils.ExecPromise(`killall -HUP mDNSResponder`, nil)
		if err2 != nil {
			fmt.Printf("Warning: Error killing mDNSResponder: %v\n", err2)
		}
		// If both failed, we might still return true as per JS logic,
		// but it's better to return an error if a significant one occurred.
		if err1 != nil || err2 != nil {
			return false, fmt.Errorf("DNS refresh on macOS had warnings: %v, %v", err1, err2)
		}
	} else if utils.IsLinux() {
		// Try common Linux DNS refresh methods
		// 1. systemd-resolved
		_, _, err := utils.ExecPromise(`sudo systemctl restart systemd-resolved.service`, nil)
		if err == nil {
			fmt.Println("systemd-resolved restarted.")
			return true, nil // Success, return
		}
		fmt.Printf("Warning: systemd-resolved not found or restart failed: %v\n", err)

		// 2. nscd (Name Service Cache Daemon)
		_, _, err = utils.ExecPromise(`sudo systemctl restart nscd.service`, nil)
		if err == nil {
			fmt.Println("nscd restarted.")
			return true, nil // Success, return
		}
		fmt.Printf("Warning: nscd not found or restart failed: %v\n", err)

		// 3. dnsmasq
		_, _, err = utils.ExecPromise(`sudo systemctl restart dnsmasq.service`, nil)
		if err == nil {
			fmt.Println("dnsmasq restarted.")
			return true, nil // Success, return
		}
		fmt.Printf("Warning: dnsmasq not found or restart failed: %v\n", err)

		// If none succeeded
		return false, fmt.Errorf("could not determine or refresh system DNS cache on Linux. Manual intervention might be needed.")
	} else {
		return false, fmt.Errorf("unsupported operating system for DnsRefresh")
	}
	return true, nil // Default return for success on supported OS, or if warnings occurred on macOS
}

// NewHostManager creates and returns a new instance of HostManager.
func NewHostManager() *HostManager {
	return &HostManager{
		BaseManager: BaseManager{}, // Initialize the BaseManager instance
	}
}
