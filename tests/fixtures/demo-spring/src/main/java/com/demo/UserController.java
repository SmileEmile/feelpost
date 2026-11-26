package com.demo;

import org.springframework.web.bind.annotation.*;
import javax.validation.constraints.NotNull;

@RestController
@RequestMapping("/api/users")
public class UserController {

  /** 查询用户详情 */
  @GetMapping("/{id}")
  public User getUser(@PathVariable Long id, @RequestParam(required = false) String keyword) {
    return null;
  }

  /** 创建用户 */
  @ApiOperation(value = "关联五屏重保任务", notes = "重保保障监控")
  @PostMapping("/create")
  public User create(@RequestBody UserCreateReq req) {
    return null;
  }

  @ApiOperation(value = "保存原始 JSON", notes = "原样透传")
  @PostMapping("/raw")
  public Object raw(@RequestBody JSONObject body) {
    return null;
  }
}

class UserCreateReq {
  /** 登录名 */
  @NotNull
  private String username;
  @ApiModelProperty(value = "用户 ID", required = true)
  private Long id;
  private Integer age;
}
