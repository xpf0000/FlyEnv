package module

import (
	"errors"
	"fmt"
	"helper-go/utils" // 导入项目内的工具包
	"reflect"
)

// BaseManager 是所有模块的基础结构体
type BaseManager struct{}

// Exec 提供动态方法调用功能
func (b *BaseManager) Exec(methodName string, args ...interface{}) (interface{}, error) {
	// 使用反射获取方法
	method := reflect.ValueOf(b).MethodByName(methodName)
	if !method.IsValid() {
		return nil, errors.New("method not found")
	}

	// 准备参数
	in := make([]reflect.Value, len(args))
	for i, arg := range args {
		in[i] = reflect.ValueOf(arg)
	}

	// 调用方法
	results := method.Call(in)

	// 处理返回值 (假设所有方法都返回 (interface{}, error))
	if len(results) == 0 {
		return nil, nil
	}

	var output interface{}
	var err error

	if len(results) > 0 {
		if !results[0].IsNil() {
			output = results[0].Interface()
		}
	}

	if len(results) > 1 && !results[1].IsNil() {
		err = results[1].Interface().(error)
	}

	return output, err
}

// StartService 启动服务的通用实现
func (b *BaseManager) StartService(command string, options map[string]interface{}) error {
	_, stderr, err := utils.ExecPromise(command, options)
	if err != nil {
		return fmt.Errorf("%s: %s", err.Error(), stderr)
	}
	return nil
}
