package com.demo.screen.controller;

import com.demo.screen.dto.UserCreateRequest;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 用户管理接口
 */
@RestController
@RequestMapping("/api/users")
public class UserController {

    /**
     * 分页查询用户列表
     */
    @GetMapping
    @Operation(summary = "分页查询用户", description = "支持姓名关键字和部门筛选，按创建时间倒序。")
    public List<Object> list(
            @RequestParam(required = false) @Parameter(description = "姓名关键字") String keyword,
            @RequestParam(required = false) @Parameter(description = "部门编码") String department,
            @RequestParam(defaultValue = "1") @Parameter(description = "页码") Integer page,
            @RequestParam(defaultValue = "20") @Parameter(description = "每页条数") Integer size) {
        return null;
    }

    /**
     * 查询用户详情
     */
    @GetMapping("/{id}")
    @Operation(summary = "查询用户详情", description = "根据用户 ID 查询基础信息、所属部门和状态。")
    public Object detail(@PathVariable @Parameter(description = "用户 ID") Long id) {
        return null;
    }

    /**
     * 创建用户
     */
    @PostMapping
    @Operation(summary = "创建用户", description = "姓名与手机号必填，创建后默认启用。")
    public Object create(@RequestBody UserCreateRequest request) {
        return null;
    }

    /**
     * 更新用户
     */
    @PutMapping("/{id}")
    @Operation(summary = "更新用户", description = "按用户 ID 更新姓名、部门和启用状态。")
    public Object update(@PathVariable Long id, @RequestBody UserCreateRequest request) {
        return null;
    }

    /**
     * 删除用户
     */
    @DeleteMapping("/{id}")
    @Operation(summary = "删除用户", description = "逻辑删除用户，不影响历史订单。")
    public Object delete(@PathVariable Long id) {
        return null;
    }
}
