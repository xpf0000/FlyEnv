package utils

// ProcessStartIdentity 是签名停止 RPC 的身份快照。Created 使用 UTC round-trip
// 时间；startTime 为完整原生精度，cim 为根/普通目标的微秒时间并绑定 EXE。
// cim-descendant 仅用于服务的显式有序集合：后代继承首次列表根的归属，只绑定创建
// 时间，不独立匹配路径/配置。普通进程/端口模式不能使用后代来源绕过路径检查。
type ProcessStartIdentity struct {
	PID     uint32 `json:"pid"`
	Created string `json:"created"`
	Source  string `json:"source"`
	Path    string `json:"path,omitempty"`
}
