import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { scanProject } from '../../src/main/scanner/java-scanner'

describe('Java scanner', () => {
  let root = ''

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'feelpost-scan-'))
    await mkdir(join(root, 'src/main/java/com/demo/user'), { recursive: true })
    await writeFile(join(root, 'pom.xml'), '<project/>')
    await writeFile(
      join(root, 'src/main/java/com/demo/user/UserController.java'),
      `package com.demo.user;
import org.springframework.web.bind.annotation.*;
@RestController
@RequestMapping("/api/users")
public class UserController {
  /**
   * 查询用户详情
   * @param id 用户 ID
   */
  @GetMapping("/{id}")
  public User getUser(@PathVariable Long id, @RequestParam(required = false) String keyword) {
    return null;
  }
  /** 创建用户 */
  @ApiOperation(value = "关联五屏重保任务", notes = "重保保障监控")
  @PostMapping("/create")
  public User create(@RequestBody UserCreateReq req) { return null; }

  @ApiOperation(value = "保存原始 JSON", notes = "原样透传")
  @PostMapping("/raw")
  public Object raw(@RequestBody JSONObject body) { return null; }
}`
    )
    await writeFile(
      join(root, 'src/main/java/com/demo/user/UserCreateReq.java'),
      `package com.demo.user;
import javax.validation.constraints.NotNull;
public class UserCreateReq {
  /** 登录名 */
  @NotNull
  private String username;
  @ApiModelProperty(value = "用户 ID", required = true)
  private Long id;
  private Integer age;
}`
    )
  })

  afterAll(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('extracts controller paths, params, DTO fields and parse quality', async () => {
    const result = await scanProject({
      sourceDir: root,
      excludePatterns: ['target'],
      grammarPath: join(process.cwd(), 'resources/grammars/java.wasm')
    })
    const list = result.interfaces
    const get = list.find((item) => item.method === 'GET')
    const post = list.find((item) => item.path === '/api/users/create')
    const raw = list.find((item) => item.path === '/api/users/raw')

    expect(get?.summary).toContain('查询用户详情')
    expect(get?.name).toBe('查询用户详情')
    expect(get?.nameSource).toBe('javadoc')
    expect(get?.path).toBe('/api/users/{id}')
    expect(get?.params.path.map((p) => p.name)).toEqual(['id'])
    expect(get?.params.query[0]).toMatchObject({ name: 'keyword', required: false })

    expect(post?.path).toBe('/api/users/create')
    expect(post?.name).toBe('关联五屏重保任务')
    expect(post?.nameSource).toBe('annotation')
    expect(post?.summary).toBe('重保保障监控')
    expect(post?.body?.fields.map((f) => f.name)).toEqual(['username', 'id', 'age'])
    expect(post?.body?.fields[0].description).toContain('登录名')
    expect(post?.body?.fields[1].description).toBe('用户 ID')
    expect(post?.body?.fields[1].required).toBe(true)
    expect(post?.parseQuality).toBe('full')

    expect(raw?.name).toBe('保存原始 JSON')
    expect(raw?.body?.fields).toEqual([])
    expect(raw?.parseQuality).toBe('full')
    expect(raw?.issues.join('')).not.toContain('未能解析请求体类型')
  })
})
