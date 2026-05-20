package main

import (
	"bytes"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"helper-go/module"
	"helper-go/utils"
)

// Constants for socket paths
const (
	Helper_Version   = 11
	SOCKET_PATH      = "/tmp/flyenv-helper.sock"
	Role_Path        = "/tmp/flyenv.role"
	Role_Path_Back   = "/usr/local/share/FlyEnv/flyenv.role"
	Key_Path_Unix    = "/tmp/flyenv-helper.key"
	READ_BUFFER_SIZE = 4096 // Buffer size for reading from socket
)

func getKeyPath() string {
	if runtime.GOOS == "windows" {
		return filepath.Join(os.TempDir(), "flyenv-helper.key")
	}
	return Key_Path_Unix
}

// TaskItem defines the structure of the incoming JSON message
type TaskItem struct {
	Key      string        `json:"key"`
	Module   string        `json:"module"`
	Function string        `json:"function"`
	Args     []interface{} `json:"args"` // Using interface{} to handle varying argument types
	Sig      string        `json:"sig"`
}

// Response defines the structure of the JSON response sent back
type Response struct {
	Key  string      `json:"key"`
	Code int         `json:"code"` // 0 for success, 1 for error
	Data interface{} `json:"data,omitempty"`
	Msg  string      `json:"msg,omitempty"`
}

// AppHelper holds instances of all manager modules
type AppHelper struct {
	Tool     *module.ToolManager
	MariaDB  *module.MariadbManager
	Caddy    *module.CaddyManager
	Redis    *module.RedisManager
	PHP      *module.PhpManager
	Mailpit  *module.MailpitManager
	Mysql    *module.MysqlManager
	RabbitMQ *module.RabbitmqManager
	Host     *module.HostManager
	// Add other managers here as they are converted
}

// NewAppHelper initializes and returns a new AppHelper instance
func NewAppHelper() *AppHelper {
	return &AppHelper{
		Tool:     module.NewToolManager(),
		MariaDB:  module.NewMariadbManager(),
		Caddy:    module.NewCaddyManager(),
		Redis:    module.NewRedisManager(),
		PHP:      module.NewPhpManager(),
		Mailpit:  module.NewMailpitManager(),
		Mysql:    module.NewMysqlManager(),
		RabbitMQ: module.NewRabbitmqManager(),
		Host:     module.NewHostManager(),
		// Initialize other managers here
	}
}

var helperKey []byte

func loadOrGenerateKey() error {
	keyPath := getKeyPath()
	if utils.ExistsSync(keyPath) {
		data, err := utils.ReadFileBytes(keyPath)
		if err != nil {
			return fmt.Errorf("failed to read existing key: %w", err)
		}
		helperKey = data
		fmt.Println("Loaded existing helper key")
		return nil
	}

	key := make([]byte, 32)
	_, err := rand.Read(key)
	if err != nil {
		return fmt.Errorf("failed to generate key: %w", err)
	}

	err = os.WriteFile(keyPath, key, 0600)
	if err != nil {
		return fmt.Errorf("failed to write key file: %w", err)
	}

	helperKey = key
	fmt.Println("Generated new helper key")
	return nil
}

func setupKeyFileOwnership() {
	if runtime.GOOS == "windows" {
		return
	}

	keyPath := getKeyPath()
	var rule string
	if utils.ExistsSync(Role_Path) {
		content, err := utils.ReadFile(Role_Path)
		if err != nil {
			fmt.Printf("Warning: failed to read role file for key chown: %v\n", err)
		} else {
			rule = strings.TrimSpace(content)
		}
	} else if utils.ExistsSync(Role_Path_Back) {
		content, err := utils.ReadFile(Role_Path_Back)
		if err != nil {
			fmt.Printf("Warning: failed to read role backup file for key chown: %v\n", err)
		} else {
			rule = strings.TrimSpace(content)
		}
	}

	if rule != "" && utils.ExistsSync(keyPath) {
		_, stderr, err := utils.ExecPromise(fmt.Sprintf(`chown "%s" "%s"`, rule, keyPath), nil)
		if err != nil {
			fmt.Printf("Warning: failed to chown key file '%s' to '%s': %v, stderr: %s\n", keyPath, rule, err, stderr)
		} else {
			fmt.Printf("Successfully changed ownership of key file to '%s'\n", rule)
		}
	}
}

func verifySignature(info TaskItem) bool {
	if len(helperKey) == 0 {
		fmt.Println("Warning: helper key is empty, rejecting request")
		return false
	}

	argsJSON, err := json.Marshal(info.Args)
	if err != nil {
		fmt.Printf("Warning: failed to marshal args for signature verification: %v\n", err)
		return false
	}

	payload := info.Key + "|" + info.Module + "|" + info.Function + "|" + string(argsJSON)

	mac := hmac.New(sha256.New, helperKey)
	mac.Write([]byte(payload))
	expectedSig := hex.EncodeToString(mac.Sum(nil))

	if !hmac.Equal([]byte(expectedSig), []byte(info.Sig)) {
		fmt.Printf("Warning: signature mismatch. expected=%s, got=%s, payload=%s\n", expectedSig, info.Sig, payload)
		return false
	}

	return true
}

// Run sets up and starts the Unix domain socket server
func (a *AppHelper) Run() error {
	// Clean up existing socket file if it exists (Unix only)
	if runtime.GOOS != "windows" && utils.ExistsSync(SOCKET_PATH) {
		if err := os.Remove(SOCKET_PATH); err != nil {
			return fmt.Errorf("failed to remove old socket file '%s': %w", SOCKET_PATH, err)
		}
	}

	var listener net.Listener
	var err error

	// Create the appropriate listener based on platform
	if runtime.GOOS == "windows" {
		// Use named pipe on Windows
		listener, err = utils.CreateWindowsNamedPipe(SOCKET_PATH)
		if err != nil {
			return fmt.Errorf("failed to create named pipe: %w", err)
		}
		fmt.Println("Server is listening on Windows named pipe:", utils.GetPipeNameFromSocketPath(SOCKET_PATH))
	} else {
		// Use Unix domain socket on Unix-like systems
		listener, err = net.Listen("unix", SOCKET_PATH)
		if err != nil {
			return fmt.Errorf("failed to listen on socket '%s': %w", SOCKET_PATH, err)
		}
		fmt.Println("Server is listening on Unix domain socket:", SOCKET_PATH)
	}

	defer listener.Close() // Ensure listener is closed when Run exits

	// Post-listen setup tasks (Unix only for chown)
	if runtime.GOOS != "windows" {
		go a.setupUnixPermissions()
		go func() {
			// Wait for role file to be available before chowning key file
			time.Sleep(600 * time.Millisecond)
			setupKeyFileOwnership()
		}()
	}

	// Accept and handle incoming connections
	for {
		conn, err := listener.Accept()
		if err != nil {
			// If the error is not temporary, it might mean listener is closed or critical error
			if !strings.Contains(err.Error(), "use of closed network connection") {
				fmt.Printf("Error accepting connection: %v\n", err)
			}
			return err // Or continue if you want to retry accepting
		}
		// Handle each connection in a new goroutine
		go a.handleClient(conn)
	}
}

// setupUnixPermissions handles the chown operation for Unix domain sockets
func (a *AppHelper) setupUnixPermissions() {
	// Use a short sleep to allow the socket to fully initialize
	time.Sleep(500 * time.Millisecond)

	var rule string
	if utils.ExistsSync(Role_Path) {
		content, err := utils.ReadFile(Role_Path)
		if err != nil {
			fmt.Printf("Warning: failed to read role file '%s': %v\n", Role_Path, err)
		} else {
			rule = strings.TrimSpace(content)
			fmt.Printf("Read role from primary file: '%s'\n", rule)

			// Create backup directory and file
			if err := utils.Mkdirp(filepath.Dir(Role_Path_Back)); err != nil {
				fmt.Printf("Warning: failed to create parent directory for '%s': %v\n", Role_Path_Back, err)
			} else {
				if err := utils.WriteFileString(Role_Path_Back, rule); err != nil {
					fmt.Printf("Warning: failed to write role file back to '%s': %v\n", Role_Path_Back, err)
				}
			}
		}
	} else if utils.ExistsSync(Role_Path_Back) {
		content, err := utils.ReadFile(Role_Path_Back)
		if err != nil {
			fmt.Printf("Warning: failed to read role backup file '%s': %v\n", Role_Path_Back, err)
		} else {
			rule = strings.TrimSpace(content)
			fmt.Printf("Read role from backup file: '%s'\n", rule)
		}
	}

	if rule != "" && utils.ExistsSync(SOCKET_PATH) {
		// Change ownership of the socket file
		_, stderr, err := utils.ExecPromise(fmt.Sprintf(`chown "%s" "%s"`, rule, SOCKET_PATH), nil)
		if err != nil {
			fmt.Printf("Warning: failed to chown socket '%s' to '%s': %v, stderr: %s\n", SOCKET_PATH, rule, err, stderr)
		} else {
			fmt.Printf("Successfully changed ownership of socket to '%s'\n", rule)
		}
	}
	// Always tighten socket file permissions regardless of chown success
	if utils.ExistsSync(SOCKET_PATH) {
		_, stderr, err := utils.ExecPromise(fmt.Sprintf(`chmod 0600 "%s"`, SOCKET_PATH), nil)
		if err != nil {
			fmt.Printf("Warning: failed to chmod socket '%s' to 0600: %v, stderr: %s\n", SOCKET_PATH, err, stderr)
		} else {
			fmt.Printf("Successfully changed socket permissions to 0600\n")
		}
	}
}

// handleClient processes data from a single client connection
func (a *AppHelper) handleClient(conn net.Conn) {
	defer func() {
		fmt.Println("Client has disconnected")
		if err := conn.Close(); err != nil { // Close the connection
			fmt.Printf("Error closing client connection: %v\n", err)
		}
	}()

	reader := new(bytes.Buffer)
	buffer := make([]byte, READ_BUFFER_SIZE)

	for {
		n, err := conn.Read(buffer)
		if err != nil {
			if err != io.EOF { // io.EOF means client closed connection normally
				fmt.Printf("Error reading from socket: %v\n", err)
			}
			return // Exit goroutine on read error or EOF
		}

		reader.Write(buffer[:n])

		// Attempt to parse JSON. Keep accumulating if not a complete JSON object yet.
		var info TaskItem
		content := reader.String() // Get current content from buffer
		if err := json.Unmarshal([]byte(content), &info); err != nil {
			// If JSON is incomplete or malformed, continue reading more data
			// Only log if it's clearly not a partial read (e.g., malformed after full read)
			if !strings.Contains(err.Error(), "unexpected end of JSON input") && !strings.Contains(err.Error(), "invalid character") {
				// This might be an actual parsing error for a full but invalid JSON
				// fmt.Printf("Partial/Malformed JSON received, continuing: %v\n", err)
			}
			continue // Wait for more data
		}

		// JSON successfully parsed, clear buffer for next message
		reader.Reset()

		// Verify HMAC signature
		if !verifySignature(info) {
			res := Response{Key: info.Key, Code: 1, Msg: "invalid signature"}
			responseBytes, _ := json.Marshal(res)
			_, writeErr := conn.Write(responseBytes)
			if writeErr != nil {
				fmt.Printf("Error writing signature error response for key %s: %v\n", info.Key, writeErr)
			}
			return
		}

		// Dispatch the call to the appropriate module manager
		var (
			result  interface{}
			execErr error
		)

		// 使用嵌套的 switch 语句直接调用方法，并加入参数检查
		switch info.Module {
		case "helper":
			switch info.Function {
			case "version":
				result = Helper_Version
				execErr = nil
			default:
				execErr = fmt.Errorf("unknown function '%s' for module 'helper'", info.Function)
			}
		case "tools":
			switch info.Function {
			case "processList":
				if len(info.Args) != 0 {
					execErr = fmt.Errorf("processList expects 0 arguments, got %d", len(info.Args))
				} else {
					result, execErr = a.Tool.ProcessList()
				}
			case "processListWin":
				if len(info.Args) != 0 {
					execErr = fmt.Errorf("processListWin expects 0 arguments, got %d", len(info.Args))
				} else {
					result, execErr = a.Tool.ProcessListWin()
				}
			case "writeFileByRoot":
				if len(info.Args) == 2 {
					if file, ok := info.Args[0].(string); ok {
						if content, ok := info.Args[1].(string); ok {
							result, execErr = a.Tool.WriteFileByRoot(file, content)
						} else {
							execErr = fmt.Errorf("writeFileByRoot: arg[1] must be a string, got %T", info.Args[1])
						}
					} else {
						execErr = fmt.Errorf("writeFileByRoot: arg[0] must be a string, got %T", info.Args[0])
					}
				} else {
					execErr = fmt.Errorf("writeFileByRoot expects 2 arguments, got %d", len(info.Args))
				}
			case "readFileByRoot":
				if len(info.Args) == 1 {
					if file, ok := info.Args[0].(string); ok {
						result, execErr = a.Tool.ReadFileByRoot(file)
					} else {
						execErr = fmt.Errorf("readFileByRoot: arg[0] must be a string, got %T", info.Args[0])
					}
				} else {
					execErr = fmt.Errorf("readFileByRoot expects 1 argument, got %d", len(info.Args))
				}
			case "rm":
				if len(info.Args) == 1 {
					if dir, ok := info.Args[0].(string); ok {
						result, execErr = a.Tool.Rm(dir)
					} else {
						execErr = fmt.Errorf("rm: arg[0] must be a string, got %T", info.Args[0])
					}
				} else {
					execErr = fmt.Errorf("rm expects 1 argument, got %d", len(info.Args))
				}
			case "chmod":
				if len(info.Args) == 2 {
					if dir, ok := info.Args[0].(string); ok {
						if flag, ok := info.Args[1].(string); ok {
							result, execErr = a.Tool.Chmod(dir, flag)
						} else {
							execErr = fmt.Errorf("chmod: arg[1] must be a string, got %T", info.Args[1])
						}
					} else {
						execErr = fmt.Errorf("chmod: arg[0] must be a string, got %T", info.Args[0])
					}
				} else {
					execErr = fmt.Errorf("chmod expects 2 arguments, got %d", len(info.Args))
				}
			case "kill":
				if len(info.Args) == 2 {
					if sig, ok := info.Args[0].(string); ok {
						var pids []string
						if pidList, ok := info.Args[1].([]interface{}); ok { // JSON数组通常解析为[]interface{}
							for i, p := range pidList {
								if pidStr, ok := p.(string); ok {
									pids = append(pids, pidStr)
								} else {
									execErr = fmt.Errorf("kill: pids[%d] must be a string, got %T", i, p)
									break
								}
							}
						} else if pidList, ok := info.Args[1].([]string); ok { // 如果是直接的[]string
							pids = pidList
						} else {
							execErr = fmt.Errorf("kill: arg[1] must be a string array, got %T", info.Args[1])
						}

						if execErr == nil { // 只有在上面的参数转换没有错误时才执行方法
							result, execErr = a.Tool.Kill(sig, pids)
						}
					} else {
						execErr = fmt.Errorf("kill: arg[0] must be a string, got %T", info.Args[0])
					}
				} else {
					execErr = fmt.Errorf("kill expects 2 arguments, got %d", len(info.Args))
				}
			case "ln_s":
				if len(info.Args) == 2 {
					if oldname, ok := info.Args[0].(string); ok {
						if newname, ok := info.Args[1].(string); ok {
							result, execErr = a.Tool.Lns(oldname, newname)
						} else {
							execErr = fmt.Errorf("ln_s: arg[1] must be a string, got %T", info.Args[1])
						}
					} else {
						execErr = fmt.Errorf("ln_s: arg[0] must be a string, got %T", info.Args[0])
					}
				} else {
					execErr = fmt.Errorf("ln_s expects 2 arguments, got %d", len(info.Args))
				}
			case "killPorts":
				if len(info.Args) == 1 {
					var ports []string
					if portList, ok := info.Args[0].([]interface{}); ok {
						for i, p := range portList {
							if portStr, ok := p.(string); ok {
								ports = append(ports, portStr)
							} else {
								execErr = fmt.Errorf("killPorts: ports[%d] must be a string, got %T", i, p)
								break
							}
						}
					} else if portList, ok := info.Args[0].([]string); ok {
						ports = portList
					} else {
						execErr = fmt.Errorf("killPorts: arg[0] must be a string array, got %T", info.Args[0])
					}
					if execErr == nil {
						result, execErr = a.Tool.KillPorts(ports)
					}
				} else {
					execErr = fmt.Errorf("killPorts expects 1 argument, got %d", len(info.Args))
				}
			case "getPortPids":
				if len(info.Args) == 1 {
					if port, ok := info.Args[0].(string); ok {
						result, execErr = a.Tool.GetPortPids(port)
					} else {
						execErr = fmt.Errorf("getPortPids: arg[0] must be a string, got %T", info.Args[0])
					}
				} else {
					execErr = fmt.Errorf("getPortPids expects 1 argument, got %d", len(info.Args))
				}
			case "getPortPidsWin":
				if len(info.Args) == 1 {
					if port, ok := info.Args[0].(string); ok {
						result, execErr = a.Tool.GetPortPidsWin(port)
					} else {
						execErr = fmt.Errorf("getPortPidsWin: arg[0] must be a string, got %T", info.Args[0])
					}
				} else {
					execErr = fmt.Errorf("getPortPidsWin expects 1 argument, got %d", len(info.Args))
				}
			case "getSystemPath":
				if len(info.Args) != 0 {
					execErr = fmt.Errorf("getSystemPath expects 0 arguments, got %d", len(info.Args))
				} else {
					result, execErr = a.Tool.GetSystemPath()
				}
			case "setSystemPath":
				if len(info.Args) == 2 {
					if paths, ok := info.Args[0].([]interface{}); ok {
						var pathArr []string
						for i, p := range paths {
							if ps, ok := p.(string); ok {
								pathArr = append(pathArr, ps)
							} else {
								execErr = fmt.Errorf("setSystemPath: paths[%d] must be a string, got %T", i, p)
								break
							}
						}
						if execErr == nil {
							if otherVars, ok := info.Args[1].(map[string]interface{}); ok {
								var vars map[string]string = make(map[string]string)
								for k, v := range otherVars {
									if vs, ok := v.(string); ok {
										vars[k] = vs
									} else {
										execErr = fmt.Errorf("setSystemPath: otherVars[%s] must be a string, got %T", k, v)
										break
									}
								}
								if execErr == nil {
									result, execErr = a.Tool.SetSystemPath(pathArr, vars)
								}
							} else {
								execErr = fmt.Errorf("setSystemPath: arg[1] (otherVars) must be a map[string]string, got %T", info.Args[1])
							}
						}
					} else {
						execErr = fmt.Errorf("setSystemPath: arg[0] (paths) must be a string array, got %T", info.Args[0])
					}
				} else {
					execErr = fmt.Errorf("setSystemPath expects 2 arguments (paths, otherVars), got %d", len(info.Args))
				}
			case "setSystemEnv":
				if len(info.Args) == 2 {
					if key, ok := info.Args[0].(string); ok {
						if value, ok := info.Args[1].(string); ok {
							result, execErr = a.Tool.SetSystemEnv(key, value)
						} else {
							execErr = fmt.Errorf("setSystemEnv: arg[1] (value) must be a string, got %T", info.Args[1])
						}
					} else {
						execErr = fmt.Errorf("setSystemEnv: arg[0] (key) must be a string, got %T", info.Args[0])
					}
				} else {
					execErr = fmt.Errorf("setSystemEnv expects 2 arguments (key, value), got %d", len(info.Args))
				}
			case "runScript":
				if len(info.Args) == 2 {
					if shell, ok := info.Args[0].(string); ok {
						if scriptPath, ok := info.Args[1].(string); ok {
							result, execErr = a.Tool.RunScript(shell, scriptPath)
						} else {
							execErr = fmt.Errorf("runScript: arg[1] (scriptPath) must be a string, got %T", info.Args[1])
						}
					} else {
						execErr = fmt.Errorf("runScript: arg[0] (shell) must be a string, got %T", info.Args[0])
					}
				} else {
					execErr = fmt.Errorf("runScript expects 2 arguments (shell, scriptPath), got %d", len(info.Args))
				}
			case "setAutoStartWin":
				if len(info.Args) == 3 {
					if enabled, ok := info.Args[0].(bool); ok {
						if taskName, ok := info.Args[1].(string); ok {
							if exePath, ok := info.Args[2].(string); ok {
								result, execErr = a.Tool.SetAutoStartWin(enabled, taskName, exePath)
							} else {
								execErr = fmt.Errorf("setAutoStartWin: arg[2] (exePath) must be a string, got %T", info.Args[2])
							}
						} else {
							execErr = fmt.Errorf("setAutoStartWin: arg[1] (taskName) must be a string, got %T", info.Args[1])
						}
					} else {
						execErr = fmt.Errorf("setAutoStartWin: arg[0] (enabled) must be a bool, got %T", info.Args[0])
					}
				} else {
					execErr = fmt.Errorf("setAutoStartWin expects 3 arguments (enabled, taskName, exePath), got %d", len(info.Args))
				}
			case "removeLoginItemMac":
				if len(info.Args) == 1 {
					if name, ok := info.Args[0].(string); ok {
						result, execErr = a.Tool.RemoveLoginItemMac(name)
					} else {
						execErr = fmt.Errorf("removeLoginItemMac: arg[0] (name) must be a string, got %T", info.Args[0])
					}
				} else {
					execErr = fmt.Errorf("removeLoginItemMac expects 1 argument (name), got %d", len(info.Args))
				}
			default:
				execErr = fmt.Errorf("unknown function '%s' for module 'tools'", info.Function)
			}
		// --- 其他模块的 case ---
		case "mariadb":
			switch info.Function {
			case "macportsDirFixed":
				if len(info.Args) == 2 {
					if enDir, ok := info.Args[0].(string); ok {
						if shareDir, ok := info.Args[1].(string); ok {
							result, execErr = a.MariaDB.MacportsDirFixed(enDir, shareDir)
						} else {
							execErr = fmt.Errorf("mariadb.initPlugin: arg[1] must be a string, got %T", info.Args[1])
						}
					} else {
						execErr = fmt.Errorf("mariadb.initPlugin: arg[0] must be a string, got %T", info.Args[0])
					}
				} else {
					execErr = fmt.Errorf("mariadb.initPlugin expects 1 argument, got %d", len(info.Args))
				}
			// ... 添加其他 mariadb 方法的类型检查和调用
			default:
				execErr = fmt.Errorf("unknown function '%s' for module 'mariadb'", info.Function)
			}
		case "caddy":
			switch info.Function {
			// 示例：假设 CaddyManager 有个 Restart 方法，无参数
			case "sslDirFixed":
				if len(info.Args) != 1 {
					execErr = fmt.Errorf("caddy.restart expects 1 arguments, got %d", len(info.Args))
				} else {
					if sslDir, ok := info.Args[0].(string); ok {
						result = a.Caddy.SslDirFixed(sslDir)
					} else {
						execErr = fmt.Errorf("mariadb.initPlugin: arg[0] must be a string, got %T", info.Args[0])
					}
				}
			// ... 添加其他 caddy 方法的类型检查和调用
			default:
				execErr = fmt.Errorf("unknown function '%s' for module 'caddy'", info.Function)
			}
		case "redis":
			switch info.Function {
			case "logFileFixed":
				if len(info.Args) == 2 {
					if logFile, ok := info.Args[0].(string); ok {
						if user, ok := info.Args[1].(string); ok {
							result, execErr = a.Redis.LogFileFixed(logFile, user)
						} else {
							execErr = fmt.Errorf("redis.logFileFixed: arg[1] must be a string, got %T", info.Args[1])
						}
					} else {
						execErr = fmt.Errorf("redis.logFileFixed: arg[0] must be a string, got %T", info.Args[0])
					}
				} else {
					execErr = fmt.Errorf("redis.logFileFixed expects 2 arguments, got %d", len(info.Args))
				}
			// ... 添加其他 redis 方法的类型检查和调用
			default:
				execErr = fmt.Errorf("unknown function '%s' for module 'redis'", info.Function)
			}
		case "php":
			switch info.Function {
			case "iniFileFixed":
				if len(info.Args) == 2 {
					if baseIni, ok := info.Args[0].(string); ok {
						if ini, ok := info.Args[1].(string); ok {
							result, execErr = a.PHP.IniFileFixed(baseIni, ini)
						} else {
							execErr = fmt.Errorf("php.installVersion: arg[1] must be a string, got %T", info.Args[1])
						}
					} else {
						execErr = fmt.Errorf("php.installVersion: arg[0] must be a string, got %T", info.Args[0])
					}
				} else {
					execErr = fmt.Errorf("php.installVersion expects 2 argument, got %d", len(info.Args))
				}
			case "iniDefaultFileFixed":
				if len(info.Args) == 2 {
					if baseIni, ok := info.Args[0].(string); ok {
						if ini, ok := info.Args[1].(string); ok {
							result, execErr = a.PHP.IniDefaultFileFixed(baseIni, ini)
						} else {
							execErr = fmt.Errorf("php.installVersion: arg[1] must be a string, got %T", info.Args[1])
						}
					} else {
						execErr = fmt.Errorf("php.installVersion: arg[0] must be a string, got %T", info.Args[0])
					}
				} else {
					execErr = fmt.Errorf("php.installVersion expects 2 argument, got %d", len(info.Args))
				}
			// ... 添加其他 php 方法的类型检查和调用
			default:
				execErr = fmt.Errorf("unknown function '%s' for module 'php'", info.Function)
			}
		case "mailpit":
			switch info.Function {
			case "binFixed":
				if len(info.Args) != 1 {
					execErr = fmt.Errorf("mailpit.install expects 1 arguments, got %d", len(info.Args))
				} else {
					if bin, ok := info.Args[0].(string); ok {
						result, execErr = a.Mailpit.BinFixed(bin)
					}
				}
			// ... 添加其他 mailpit 方法的类型检查和调用
			default:
				execErr = fmt.Errorf("unknown function '%s' for module 'mailpit'", info.Function)
			}
		case "mysql":
			switch info.Function {
			case "macportsDirFixed":
				if len(info.Args) == 4 {
					if enDir, ok := info.Args[0].(string); ok {
						if shareDir, ok := info.Args[1].(string); ok {
							if langDir, ok := info.Args[2].(string); ok {
								if langEnDir, ok := info.Args[3].(string); ok {
									result, execErr = a.Mysql.MacportsDirFixed(enDir, shareDir, langDir, langEnDir)
								} else {
									execErr = fmt.Errorf("mysql.initPlugin: arg[3] must be a string, got %T", info.Args[3])
								}
							} else {
								execErr = fmt.Errorf("mysql.initPlugin: arg[2] must be a string, got %T", info.Args[2])
							}
						} else {
							execErr = fmt.Errorf("mysql.initPlugin: arg[1] must be a string, got %T", info.Args[1])
						}
					} else {
						execErr = fmt.Errorf("mysql.initPlugin: arg[0] must be a string, got %T", info.Args[0])
					}
				} else {
					execErr = fmt.Errorf("mysql.initPlugin expects 1 argument, got %d", len(info.Args))
				}
			// ... 添加其他 mysql 方法的类型检查和调用
			default:
				execErr = fmt.Errorf("unknown function '%s' for module 'mysql'", info.Function)
			}
		case "rabbitmq":
			switch info.Function {
			case "initPlugin":
				if len(info.Args) == 1 {
					if cwd, ok := info.Args[0].(string); ok {
						result, execErr = a.RabbitMQ.InitPlugin(cwd)
					} else {
						execErr = fmt.Errorf("rabbitmq.initPlugin: arg[0] must be a string, got %T", info.Args[0])
					}
				} else {
					execErr = fmt.Errorf("rabbitmq.initPlugin expects 1 argument, got %d", len(info.Args))
				}
			// ... 添加其他 rabbitmq 方法的类型检查和调用
			default:
				execErr = fmt.Errorf("unknown function '%s' for module 'rabbitmq'", info.Function)
			}
		case "host":
			switch info.Function {
			case "sslAddTrustedCert":
				// SslAddTrustedCert(cwd, caName string) (bool, error)
				if len(info.Args) == 2 {
					if cwd, ok := info.Args[0].(string); ok {
						if caName, ok := info.Args[1].(string); ok {
							// 方法返回 (bool, error)，我们只将 bool 放入 result
							var success bool
							success, execErr = a.Host.SslAddTrustedCert(cwd, caName)
							result = success // 将 bool 结果赋值给 result
						} else {
							execErr = fmt.Errorf("host.sslAddTrustedCert: arg[1] (caName) must be a string, got %T", info.Args[1])
						}
					} else {
						execErr = fmt.Errorf("host.sslAddTrustedCert: arg[0] (cwd) must be a string, got %T", info.Args[0])
					}
				} else {
					execErr = fmt.Errorf("host.sslAddTrustedCert expects 2 arguments (cwd, caName), got %d", len(info.Args))
				}

			case "sslFindCertificate":
				// SslFindCertificate(cwd string, commonName ...string) (string, string, error)
				if len(info.Args) >= 1 { // commonName 是可选的，但 cwd 是必需的
					if cwd, ok := info.Args[0].(string); ok {
						var commonNames []string // 收集 commonName 参数
						if len(info.Args) > 1 {
							// commonName 是可变参数，理论上 info.Args[1] 可能是 string 或 []interface{}
							// 根据你的 JS 客户端发送方式，这里先假设 info.Args[1] 是 string，作为 commonName 的第一个元素
							// 如果客户端可能发送一个字符串数组作为 commonName，则需要更复杂的逻辑
							if cn, ok := info.Args[1].(string); ok {
								commonNames = append(commonNames, cn)
							} else {
								execErr = fmt.Errorf("host.sslFindCertificate: optional arg[1] (commonName) must be a string if provided, got %T", info.Args[1])
							}
						}

						if execErr == nil { // 确保参数解析无误才调用
							// 方法返回 (string, string, error)，我们将前两个 string 封装成一个结构体或切片返回
							var stdout, stderr string
							stdout, stderr, execErr = a.Host.SslFindCertificate(cwd, commonNames...)

							if execErr == nil {
								// 将 stdout 和 stderr 封装成一个 map 返回
								result = map[string]string{"stdout": stdout, "stderr": stderr}
							}
						}
					} else {
						execErr = fmt.Errorf("host.sslFindCertificate: arg[0] (cwd) must be a string, got %T", info.Args[0])
					}
				} else {
					execErr = fmt.Errorf("host.sslFindCertificate expects at least 1 argument (cwd), got %d", len(info.Args))
				}
			case "dnsRefresh":
				// DnsRefresh() (bool, error)
				if len(info.Args) != 0 {
					execErr = fmt.Errorf("host.dnsRefresh expects 0 arguments, got %d", len(info.Args))
				} else {
					var success bool
					success, execErr = a.Host.DnsRefresh()
					result = success // 将 bool 结果赋值给 result
				}
			// ... 添加其他 host 方法的类型检查和调用
			default:
				execErr = fmt.Errorf("unknown function '%s' for module 'host'", info.Function)
			}
		default:
			execErr = fmt.Errorf("unknown module: %s", info.Module)
		}

		// Prepare response
		res := Response{Key: info.Key}
		if execErr != nil {
			res.Code = 1
			res.Msg = execErr.Error()
		} else {
			res.Code = 0
			res.Data = result
		}

		// Send response back to client
		responseBytes, err := json.Marshal(res)
		if err != nil {
			fmt.Printf("Error marshalling response for key %s: %v\n", info.Key, err)
			// Try to send a generic error if marshalling failed
			errorRes := Response{Key: info.Key, Code: 1, Msg: "Internal server error during response marshalling"}
			errorBytes, _ := json.Marshal(errorRes)
			_, writeErr := conn.Write(errorBytes)
			if writeErr != nil {
				fmt.Printf("Error writing fallback error response for key %s: %v\n", info.Key, writeErr)
			}
			return // Critical error, terminate connection handling
		}

		_, writeErr := conn.Write(responseBytes)
		if writeErr != nil {
			fmt.Printf("Error writing response for key %s: %v\n", info.Key, writeErr)
		}
		return // Exit after handling one complete request
	}
}

// Main entry point for the Go program
func main() {
	if err := loadOrGenerateKey(); err != nil {
		fmt.Printf("Failed to load/generate key: %v\n", err)
		os.Exit(1)
	}
	app := NewAppHelper()
	if err := app.Run(); err != nil {
		fmt.Printf("AppHelper terminated with error: %v\n", err)
		os.Exit(1)
	}
}
