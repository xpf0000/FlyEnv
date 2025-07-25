package module

import (
	"fmt"
	"helper-go/utils" // 导入项目内的工具包
)

// BaseManager 是所有模块的基础结构体
type BaseManager struct{}

// StartService 启动服务的通用实现
func (b *BaseManager) StartService(command string, options map[string]interface{}) error {
	_, stderr, err := utils.ExecPromise(command, options)
	if err != nil {
		return fmt.Errorf("%s: %s", err.Error(), stderr)
	}
	return nil
}
