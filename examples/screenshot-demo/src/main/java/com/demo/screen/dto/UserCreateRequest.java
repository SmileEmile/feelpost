package com.demo.screen.dto;

import io.swagger.v3.oas.annotations.media.Schema;

public class UserCreateRequest {
    /** 用户姓名 */
    @Schema(description = "用户姓名，2-20 个字符", required = true)
    private String name;

    /** 手机号 */
    @Schema(description = "手机号", required = true)
    private String phone;

    /** 所属部门 */
    @Schema(description = "所属部门编码")
    private String department;

    /** 是否启用 */
    @Schema(description = "是否启用")
    private Boolean enabled;
}
