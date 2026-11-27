package com.demo.screen.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import org.springframework.web.bind.annotation.*;

/**
 * 告警监控接口
 */
@RestController
@RequestMapping("/api/alarms")
public class AlarmController {

    /**
     * 查询最近告警
     */
    @GetMapping("/recent")
    @Operation(summary = "查询最近告警", description = "返回最近 24 小时的告警，按发生时间倒序。")
    public Object recent(@RequestParam(defaultValue = "24") @Parameter(description = "小时数") Integer hours) {
        return null;
    }

    /**
     * 确认告警
     */
    @PostMapping("/{alarmId}/ack")
    @Operation(summary = "确认告警", description = "记录确认人和确认备注，重复确认幂等。")
    public Object ack(@PathVariable String alarmId, @RequestParam String operator, @RequestParam(required = false) String note) {
        return null;
    }

    /**
     * 告警汇总
     */
    @GetMapping("/summary")
    @Operation(summary = "告警汇总", description = "按级别和业务模块统计当前未恢复告警。")
    public Object summary() {
        return null;
    }
}
