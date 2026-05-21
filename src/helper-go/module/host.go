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
	if err := utils.ValidatePathForRead(cwd); err != nil {
		return false, fmt.Errorf("path not allowed: %s: %w", cwd, err)
	}
	if err := utils.ValidateCertificateName(caName); err != nil {
		return false, err
	}
	var err error

	if utils.IsMacOS() {
		_, stderr, cmdErr := utils.ExecCommand("security", []string{"add-trusted-cert", "-d", "-r", "trustRoot", "-k", "/Library/Keychains/System.keychain", caName}, map[string]interface{}{"cwd": cwd})
		if cmdErr != nil {
			err = fmt.Errorf("macOS add-trusted-cert failed: %w, stderr: %s", cmdErr, stderr)
		}
	} else if utils.IsLinux() {
		caFile := filepath.Join(cwd, caName)
		debianUbuntuPath := fmt.Sprintf(`/usr/local/share/ca-certificates/%s`, caName)
		centosFedoraPath := fmt.Sprintf(`/etc/pki/ca-trust/source/anchors/%s`, caName)

		// Try Debian/Ubuntu path
		_, _, cmdErr := utils.ExecCommand("sudo", []string{"cp", caFile, debianUbuntuPath}, nil)
		if cmdErr == nil {
			// If copy successful, try updating certificates
			_, _, cmdErr = utils.ExecCommand("sudo", []string{"update-ca-certificates"}, nil)
			if cmdErr != nil {
				err = fmt.Errorf("Linux update-ca-certificates (Debian/Ubuntu) failed: %w", cmdErr)
			}
		} else {
			// If Debian/Ubuntu path failed, try CentOS/Fedora path
			_, _, centosCmdErr := utils.ExecCommand("sudo", []string{"cp", caFile, centosFedoraPath}, nil)
			if centosCmdErr == nil {
				// If copy successful, try updating certificates
				_, _, centosCmdErr = utils.ExecCommand("sudo", []string{"update-ca-trust", "extract"}, nil)
				if centosCmdErr != nil {
					err = fmt.Errorf("Linux update-ca-trust extract (CentOS/Fedora) failed: %w", centosCmdErr)
				}
			} else {
				err = fmt.Errorf("Linux copy CA file failed for both Debian/Ubuntu (%w) and CentOS/Fedora (%w) paths", cmdErr, centosCmdErr)
			}
		}
	} else if utils.IsWindows() {
		caFile := filepath.Join(cwd, caName)
		_, stderr, cmdErr := utils.ExecCommand("certutil", []string{"-addstore", "root", caFile}, nil)
		if cmdErr != nil {
			err = fmt.Errorf("Windows add-trusted-cert failed: %w, stderr: %s", cmdErr, stderr)
		}
	} else {
		err = fmt.Errorf("unsupported operating system for sslAddTrustedCert")
	}

	if err != nil {
		fmt.Printf("Error in SslAddTrustedCert: %v\n", err)
		return false, err
	}
	return true, nil
}

// SslFindCertificate finds a certificate by common name.
func (h *HostManager) SslFindCertificate(cwd string, commonName ...string) (string, string, error) {
	if err := utils.ValidatePathForRead(cwd); err != nil {
		return "", "", fmt.Errorf("path not allowed: %s: %w", cwd, err)
	}
	cn := "FlyEnv-Root-CA" // Default value
	if len(commonName) > 0 {
		cn = commonName[0]
	}
	if err := utils.ValidateCommonName(cn); err != nil {
		return "", "", err
	}

	if utils.IsMacOS() {
		stdout, stderr, err := utils.ExecCommand("security", []string{"find-certificate", "-c", cn}, map[string]interface{}{"cwd": cwd})
		return stdout, stderr, err
	} else if utils.IsLinux() {
		commonCaPaths := []string{
			"/etc/ssl/certs/",
			"/usr/local/share/ca-certificates/",
			"/etc/pki/ca-trust/source/anchors",
			"/etc/pki/ca-trust/extracted/pem/",
			"/etc/pki/tls/certs/",
		}

		foundCertPath := ""

		for _, dir := range commonCaPaths {
			findStdout, _, findErr := utils.ExecCommand("find", []string{dir, "-name", "*.crt", "-print"}, nil)
			if findErr != nil {
				continue
			}

			certFiles := strings.Fields(findStdout)

			for _, filePath := range certFiles {
				if filePath == "" {
					continue
				}
				opensslStdout, _, opensslErr := utils.ExecCommand("openssl", []string{"x509", "-in", filePath, "-text", "-noout"}, nil)
				if opensslErr == nil && strings.Contains(opensslStdout, fmt.Sprintf("CN = %s", cn)) {
					foundCertPath = filePath
					break
				}
			}
			if foundCertPath != "" {
				break
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
		_, _, err1 := utils.ExecCommand("dscacheutil", []string{"-flushcache"}, nil)
		if err1 != nil {
			fmt.Printf("Warning: Error flushing dscacheutil cache: %v\n", err1)
		}

		_, _, err2 := utils.ExecCommand("killall", []string{"-HUP", "mDNSResponder"}, nil)
		if err2 != nil {
			fmt.Printf("Warning: Error killing mDNSResponder: %v\n", err2)
		}
		if err1 != nil || err2 != nil {
			return false, fmt.Errorf("DNS refresh on macOS had warnings: %v, %v", err1, err2)
		}
	} else if utils.IsLinux() {
		_, _, err := utils.ExecCommand("sudo", []string{"systemctl", "restart", "systemd-resolved.service"}, nil)
		if err == nil {
			fmt.Println("systemd-resolved restarted.")
			return true, nil
		}
		fmt.Printf("Warning: systemd-resolved not found or restart failed: %v\n", err)

		_, _, err = utils.ExecCommand("sudo", []string{"systemctl", "restart", "nscd.service"}, nil)
		if err == nil {
			fmt.Println("nscd restarted.")
			return true, nil
		}
		fmt.Printf("Warning: nscd not found or restart failed: %v\n", err)

		_, _, err = utils.ExecCommand("sudo", []string{"systemctl", "restart", "dnsmasq.service"}, nil)
		if err == nil {
			fmt.Println("dnsmasq restarted.")
			return true, nil
		}
		fmt.Printf("Warning: dnsmasq not found or restart failed: %v\n", err)

		return false, fmt.Errorf("could not determine or refresh system DNS cache on Linux. Manual intervention might be needed.")
	} else {
		return false, fmt.Errorf("unsupported operating system for DnsRefresh")
	}
	return true, nil
}

// NewHostManager creates and returns a new instance of HostManager.
func NewHostManager() *HostManager {
	return &HostManager{
		BaseManager: BaseManager{}, // Initialize the BaseManager instance
	}
}
