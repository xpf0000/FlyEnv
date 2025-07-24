package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"os"
	"path/filepath"
	"strings"
	"time"

	"helper-go/module"
	"helper-go/utils"
)

// Constants for socket paths
const (
	SOCKET_PATH      = "/tmp/flyenv-helper.sock"
	Role_Path        = "/tmp/flyenv.role"
	Role_Path_Back   = "/usr/local/share/FlyEnv/flyenv.role"
	READ_BUFFER_SIZE = 4096 // Buffer size for reading from socket
)

// TaskItem defines the structure of the incoming JSON message
type TaskItem struct {
	Key      string        `json:"key"`
	Module   string        `json:"module"`
	Function string        `json:"function"`
	Args     []interface{} `json:"args"` // Using interface{} to handle varying argument types
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
	Apache   *module.ApacheManager
	RabbitMQ *module.RabbitmqManager
	Host     *module.HostManager
	Nginx    *module.NginxManager
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
		Apache:   module.NewApacheManager(),
		RabbitMQ: module.NewRabbitmqManager(),
		Host:     module.NewHostManager(),
		Nginx:    module.NewNginxManager(), // Assuming NginxManager also exists
		// Initialize other managers here
	}
}

// Run sets up and starts the Unix domain socket server
func (a *AppHelper) Run() error {
	// Clean up existing socket file if it exists
	if utils.ExistsSync(SOCKET_PATH) {
		if err := os.Remove(SOCKET_PATH); err != nil {
			return fmt.Errorf("failed to remove old socket file '%s': %w", SOCKET_PATH, err)
		}
	}

	// Create the Unix domain socket listener
	listener, err := net.Listen("unix", SOCKET_PATH)
	if err != nil {
		return fmt.Errorf("failed to listen on socket '%s': %w", SOCKET_PATH, err)
	}
	defer listener.Close() // Ensure listener is closed when Run exits

	fmt.Println("Server is listening on", SOCKET_PATH)

	// Post-listen setup tasks
	go func() {
		// Use a short sleep to allow the socket to fully initialize, mirroring JS waitTime
		time.Sleep(500 * time.Millisecond)

		var rule string
		if utils.ExistsSync(Role_Path) {
			content, err := utils.ReadFile(Role_Path)
			if err != nil {
				fmt.Printf("Warning: failed to read role file '%s': %v\n", Role_Path, err)
			} else {
				rule = strings.TrimSpace(content)
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
			}
		}

		if rule != "" && utils.ExistsSync(SOCKET_PATH) {
			// execPromise returns (stdout, stderr, error)
			_, stderr, err := utils.ExecPromise(fmt.Sprintf(`chown "%s" "%s"`, rule, SOCKET_PATH), nil)
			if err != nil {
				fmt.Printf("Warning: failed to chown socket '%s' to '%s': %v, stderr: %s\n", SOCKET_PATH, rule, err, stderr)
			}
		}
	}()

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

		// Dispatch the call to the appropriate module manager
		var (
			result  interface{}
			execErr error
		)

		// Use a switch statement to dispatch to the correct manager and call its Exec method
		switch info.Module {
		case "tools":
			result, execErr = a.Tool.Exec(info.Function, info.Args...)
		case "mariadb":
			result, execErr = a.MariaDB.Exec(info.Function, info.Args...)
		case "caddy":
			result, execErr = a.Caddy.Exec(info.Function, info.Args...)
		case "redis":
			result, execErr = a.Redis.Exec(info.Function, info.Args...)
		case "php":
			result, execErr = a.PHP.Exec(info.Function, info.Args...)
		case "mailpit":
			result, execErr = a.Mailpit.Exec(info.Function, info.Args...)
		case "mysql":
			result, execErr = a.Mysql.Exec(info.Function, info.Args...)
		case "apache":
			result, execErr = a.Apache.Exec(info.Function, info.Args...)
		case "rabbitmq":
			result, execErr = a.RabbitMQ.Exec(info.Function, info.Args...)
		case "host":
			result, execErr = a.Host.Exec(info.Function, info.Args...)
		case "nginx":
			result, execErr = a.Nginx.Exec(info.Function, info.Args...)
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
	}
}

// Main entry point for the Go program
func main() {
	app := NewAppHelper()
	if err := app.Run(); err != nil {
		fmt.Printf("AppHelper terminated with error: %v\n", err)
		os.Exit(1)
	}
}
