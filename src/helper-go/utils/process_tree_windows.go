//go:build windows

package utils

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"golang.org/x/sys/windows"
)

var protectedWindowsProcessNames = map[string]bool{
	"system": true, "registry": true, "smss": true, "csrss": true,
	"wininit": true, "services": true, "lsass": true, "lsaiso": true,
	"svchost": true, "winlogon": true, "fontdrvhost": true, "dwm": true,
	"securityhealthservice": true, "msmpeng": true,
}

// KillWindowsProcesses 只结束请求且身份匹配的 PID。taskkill 执行期间保留进程句柄，
// 防止验证与执行之间 PID 被复用；开始任何结束动作前先完成全部目标的预检。
func KillWindowsProcesses(pids []string, identities []ProcessStartIdentity) error {
	return killWindowsTargets(pids, identities, false)
}

// KillWindowsProcessTrees 接收 fork 从首次完整列表计算的全部有序 PID。
// 连续发出父先子后的终止请求，不逐 PID 等待；不使用 /T、不重新枚举或扩展树。
// 后代继承根的归属，只核对创建时间以防号码复用，不重新匹配服务路径/配置。
func KillWindowsProcessTrees(pids []string, identities []ProcessStartIdentity) error {
	return killWindowsTargets(pids, identities, true)
}

func killWindowsTargets(pids []string, identities []ProcessStartIdentity, tree bool) (stopErr error) {
	// Go 执行端没有 renderer/fork 的 ALS 上下文；用独立 executionId、PID 和 UTC
	// 时间关联签名 RPC 派发日志。只观察现有查询/命令，不增加 CIM 或改变停止判断。
	executionID := UUID(32)
	startedAt := time.Now()
	logStop := func(stage string, details map[string]interface{}) {
		if details == nil {
			details = make(map[string]interface{})
		}
		details["executionId"] = executionID
		details["stage"] = stage
		details["at"] = time.Now().UTC().Format(time.RFC3339Nano)
		details["elapsedMs"] = time.Since(startedAt).Milliseconds()
		if data, err := json.Marshal(details); err == nil {
			AppDebugLog("[ServiceStop][helper-execution]", string(data))
		}
	}
	logStop("received", map[string]interface{}{"requestedPids": pids, "tree": tree, "parentFirst": tree, "identities": identities})
	defer func() {
		// 命令失败、身份异常、自然退出等所有返回都留下终态，不改写原错误。
		details := map[string]interface{}{"requestedPids": pids, "ok": stopErr == nil}
		if stopErr != nil {
			details["error"] = stopErr.Error()
		}
		logStop("returned", details)
	}()
	limit := 256
	if tree {
		limit = 4096 // 显式服务集合包含 worker；普通进程工具仍保持原上限。
	}
	if len(pids) > limit || len(identities) > limit {
		return fmt.Errorf("too many process targets or identities")
	}
	requested := make(map[uint32]bool, len(pids))
	ordered := make([]uint32, 0, len(pids))
	for _, value := range pids {
		pid, err := strconv.ParseUint(value, 10, 32)
		if err != nil || pid <= 4 || pid > 2147483647 || pid == uint64(os.Getpid()) {
			return fmt.Errorf("invalid or protected Windows process PID: %s", value)
		}
		if !requested[uint32(pid)] {
			ordered = append(ordered, uint32(pid))
			requested[uint32(pid)] = true
		}
	}
	expected := make(map[uint32]ProcessStartIdentity, len(identities))
	for _, identity := range identities {
		// RPC 解码后的字段仍需在执行边界验证；CIM 来源必须带路径，避免
		// 仅凭较粗的 DMTF 创建时间接受同 PID 的另一个可执行程序。
		created, err := time.Parse(time.RFC3339Nano, identity.Created)
		if err != nil || !requested[identity.PID] {
			return fmt.Errorf("invalid Windows process identity; PID=%d", identity.PID)
		}
		if _, duplicate := expected[identity.PID]; duplicate {
			return fmt.Errorf("duplicate Windows process identity; PID=%d", identity.PID)
		}
		if identity.Source != "startTime" && identity.Source != "cim" && !(tree && identity.Source == "cim-descendant") {
			return fmt.Errorf("invalid Windows process identity source; PID=%d", identity.PID)
		}
		if identity.Source == "cim" && strings.TrimSpace(identity.Path) == "" {
			return fmt.Errorf("CIM process identity is missing executable path; PID=%d", identity.PID)
		}
		identity.Created = created.UTC().Format(time.RFC3339Nano)
		expected[identity.PID] = identity
	}
	var handles []windows.Handle
	defer func() {
		for _, handle := range handles {
			windows.CloseHandle(handle)
		}
	}()
	args := []string{"/F"}
	type openedTarget struct {
		pid    uint32
		handle windows.Handle
	}
	live := make([]openedTarget, 0, len(ordered))
	// 先完成整批预检并持有句柄，再按传入顺序执行。不能遍历 map：map 顺序
	// 不稳定，可能先杀 worker，让仍存活的服务父进程补建新的 worker。
	access := uint32(windows.PROCESS_QUERY_LIMITED_INFORMATION | windows.SYNCHRONIZE)
	if tree {
		access |= windows.PROCESS_TERMINATE
	}
	for _, pid := range ordered {
		handle, err := windows.OpenProcess(access, false, pid)
		if errors.Is(err, windows.ERROR_INVALID_PARAMETER) {
			logStop("skipped-missing", map[string]interface{}{"pid": pid})
			// 目标已消失可幂等跳过；若 PID 仍活着但访问被拒绝，下面必须报错。
			continue
		}
		if err != nil {
			return fmt.Errorf("cannot open Windows process %d: %w", pid, err)
		}
		handles = append(handles, handle)
		state, err := windows.WaitForSingleObject(handle, 0)
		if err != nil {
			return fmt.Errorf("cannot query Windows process %d: %w", pid, err)
		}
		if state == windows.WAIT_OBJECT_0 {
			logStop("skipped-exited", map[string]interface{}{"pid": pid})
			continue // The opened object exited and its PID cannot have been reused.
		}
		identity, hasIdentity := expected[pid]
		if !hasIdentity {
			// 只有确认句柄指向活进程后才要求快照；已退出 PID 不可能被复用到
			// 该句柄，因此允许其缺少身份，而不允许活的新占用者通过。
			return fmt.Errorf("Windows process identity snapshot does not cover live PID=%d", pid)
		}
		var created, exited, kernel, user windows.Filetime
		if err := windows.GetProcessTimes(handle, &created, &exited, &kernel, &user); err != nil {
			return fmt.Errorf("cannot query Windows process start time %d: %w", pid, err)
		}
		want, _ := time.Parse(time.RFC3339Nano, identity.Created)
		actual := time.Unix(0, created.Nanoseconds()).UTC()
		logStop("identity-observed", map[string]interface{}{
			"pid": pid, "expectedCreated": identity.Created,
			"actualCreated": actual.Format(time.RFC3339Nano), "source": identity.Source,
		})
		if identity.Source == "cim" || identity.Source == "cim-descendant" {
			// DMTF CIM 创建时间只有微秒精度，原生 FILETIME 更精确；按相同精度比较。
			// 根还要核对下面的 EXE；后代继承树归属，只将号码绑定到原对象。
			if !want.Truncate(time.Microsecond).Equal(actual.Truncate(time.Microsecond)) {
				return fmt.Errorf("Windows process identity changed; PID=%d; refresh and retry", pid)
			}
		} else if !want.Equal(actual) {
			return fmt.Errorf("Windows process identity changed; PID=%d; refresh and retry", pid)
		}
		// 子孙已经由首次列表的有效父子关系授权；只做对象创建时间复核。
		// 不再读取其路径或查询 CIM，也不把它作为新的服务归属根。
		if identity.Source == "cim-descendant" {
			live = append(live, openedTarget{pid: pid, handle: handle})
			logStop("identity-verified", map[string]interface{}{"pid": pid, "source": identity.Source, "actualCreated": actual.Format(time.RFC3339Nano)})
			continue
		}
		buffer := make([]uint16, 32768)
		size := uint32(len(buffer))
		if err := windows.QueryFullProcessImageName(handle, 0, &buffer[0], &size); err != nil {
			if state, waitErr := windows.WaitForSingleObject(handle, 0); waitErr == nil && state == windows.WAIT_OBJECT_0 {
				logStop("skipped-exited-during-path-query", map[string]interface{}{"pid": pid})
				continue
			}
			return fmt.Errorf("cannot query Windows process path %d: %w", pid, err)
		}
		path := windows.UTF16ToString(buffer[:size])
		logStop("path-observed", map[string]interface{}{"pid": pid, "executable": path, "expectedPath": identity.Path})
		name := strings.ToLower(filepath.Base(path))
		if protectedWindowsProcessNames[strings.TrimSuffix(name, ".exe")] {
			return fmt.Errorf("refusing to stop a protected Windows process; PID=%d", pid)
		}
		if identity.Source == "cim" && !strings.EqualFold(filepath.Clean(path), filepath.Clean(identity.Path)) {
			return fmt.Errorf("Windows process path changed; PID=%d; refresh and retry", pid)
		}
		logStop("identity-verified", map[string]interface{}{
			"pid": pid, "expectedCreated": identity.Created,
			"actualCreated": actual.Format(time.RFC3339Nano), "executable": path,
		})
		args = append(args, "/PID", strconv.FormatUint(uint64(pid), 10))
		live = append(live, openedTarget{pid: pid, handle: handle})
	}
	if len(live) == 0 {
		logStop("skipped-all-exited", map[string]interface{}{"requestedPids": pids})
		return nil // All requested processes exited before execution.
	}
	if tree {
		// 一次签名 RPC 携带完整 PID 集合，但执行使用固定原对象句柄逐个结束。
		// 按传入顺序连续终止，不逐 PID 阻塞等待或启动 shell；退出/交互确认由调用方策略决定。
		for _, target := range live {
			state, err := windows.WaitForSingleObject(target.handle, 0)
			if err != nil {
				return fmt.Errorf("cannot query Windows process %d before stop: %w", target.pid, err)
			}
			if state == windows.WAIT_OBJECT_0 {
				logStop("before-stop-skipped-exited", map[string]interface{}{"pid": target.pid})
				continue
			}
			logStop("terminate-request", map[string]interface{}{"pid": target.pid, "method": "TerminateProcess", "recursive": false})
			if err := windows.TerminateProcess(target.handle, 1); err != nil {
				// 只在同一原对象句柄证实自然退出时幂等跳过，保留访问拒绝等真实错误。
				if state, waitErr := windows.WaitForSingleObject(target.handle, 0); waitErr == nil && state == windows.WAIT_OBJECT_0 {
					logStop("stop-skipped-exited", map[string]interface{}{"pid": target.pid})
					continue
				}
				return fmt.Errorf("cannot terminate Windows process %d: %w", target.pid, err)
			}
			logStop("terminate-request-accepted", map[string]interface{}{"pid": target.pid})
		}
		return nil
	}
	taskkill, err := GetWindowsSystemExe("taskkill")
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, taskkill, args...)
	SetHideWindow(cmd)
	// 真实命令只包含已验证 PID；保存 argv 与 taskkill 原始输出，不能把传入 PID
	// 当成实际已执行，也不能仅凭父句柄退出推断全部 worker 都被 taskkill 处理。
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	logStop("taskkill-request", map[string]interface{}{"executable": taskkill, "arguments": args})
	commandErr := cmd.Run()
	exitCode := -1
	if cmd.ProcessState != nil {
		exitCode = cmd.ProcessState.ExitCode()
	}
	commandDetails := map[string]interface{}{
		"exitCode": exitCode, "stdout": stdout.String(), "stderr": stderr.String(),
	}
	// 原生 taskkill 可能输出本机 ANSI/OEM 字节，JSON 会替换无效 UTF-8。额外保留
	// 原始 base64 仅供诊断解码，不让中文环境的输出细节因日志序列化而永久丢失。
	if !utf8.Valid(stdout.Bytes()) {
		commandDetails["stdoutBase64"] = base64.StdEncoding.EncodeToString(stdout.Bytes())
	}
	if !utf8.Valid(stderr.Bytes()) {
		commandDetails["stderrBase64"] = base64.StdEncoding.EncodeToString(stderr.Bytes())
	}
	if cmd.Process != nil {
		commandDetails["taskkillPid"] = cmd.Process.Pid
	}
	if commandErr != nil {
		commandDetails["error"] = commandErr.Error()
	}
	logStop("taskkill-result", commandDetails)
	if err := commandErr; err != nil {
		// taskkill can lose a race with a process that exits naturally after
		// preflight. Treat its failure as idempotent success only when every
		// retained handle now confirms that its original process has exited.
		allExited := true
		for _, handle := range handles {
			state, waitErr := windows.WaitForSingleObject(handle, 0)
			if waitErr != nil || state != windows.WAIT_OBJECT_0 {
				allExited = false
				break
			}
		}
		if allExited {
			logStop("nonzero-but-original-handles-exited", map[string]interface{}{"exitCode": exitCode})
			// 进程可能在 taskkill 处理期间自然退出；只在每个保留句柄都已
			// signaled 时把非零结果视为幂等完成，否则保留 taskkill 原始错误。
			return nil
		}
		return fmt.Errorf("failed to stop Windows processes: %w; stderr: %s", err, stderr.String())
	}
	// taskkill 成功代表命令完成；不再逐原句柄阻塞等待，普通 UI 仍由公共层确认退出。
	logStop("stop-command-completed", map[string]interface{}{"requestedPids": pids})
	return nil
}
