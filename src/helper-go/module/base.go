package module

import (
	"fmt"
	"strings"

	"helper-go/utils" // 导入项目内的工具包
)

// BaseManager 是所有模块的基础结构体
type BaseManager struct{}

// StartService 启动服务的通用实现
func (b *BaseManager) StartService(command string, options map[string]interface{}) error {
	parts := strings.Fields(command)
	if len(parts) == 0 {
		return fmt.Errorf("empty command")
	}
	_, stderr, err := utils.ExecCommand(parts[0], parts[1:], options)
	if err != nil {
		return fmt.Errorf("%s: %s", err.Error(), stderr)
	}
	return nil
}
