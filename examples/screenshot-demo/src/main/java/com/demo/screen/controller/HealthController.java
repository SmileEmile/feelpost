package com.demo.screen.controller;

import io.swagger.v3.oas.annotations.Operation;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 健康检查
 */
@RestController
@RequestMapping("/api/health")
public class HealthController {
    /**
     * 服务健康检查
     */
    @GetMapping
    @Operation(summary = "服务健康检查", description = "返回服务版本、数据库与缓存状态。")
    public Object health() {
        return null;
    }
}
