/* feelpost prototype — demo dataset & mock responses */
(function () {
  const FP = (window.FP = window.FP || {});

  const GROUP_MODULE = {
    '用户模块': 'user-service',
    '订单模块': 'order-service',
    '认证模块': 'platform-service',
    '文件模块': 'platform-service',
    '报表模块': 'report-service',
    '支付模块': 'pay-core'
  };

  function P(key, type, required, desc, sample) {
    return { key: key, type: type, required: !!required, desc: desc, sample: sample === undefined ? '' : sample };
  }

  function api(o) {
    const base = {
      status: 'registered',
      source: 'scan',
      parse: 'full',
      params: { path: [], query: [], headers: [], cookies: [] },
      responseExamples: [],
      isNew: false
    };
    const merged = Object.assign(base, o);
    merged.params = Object.assign({ path: [], query: [], headers: [], cookies: [] }, o.params || {});
    if (merged.source === 'manual') {
      merged.module = o.module || null;
    } else {
      merged.module = o.module || GROUP_MODULE[merged.group] || 'app';
    }
    return merged;
  }

  function caseItem(id, apiId, name, envId, tags, request, note) {
    return {
      id: id, apiId: apiId, name: name, envId: envId, tags: tags,
      savedAt: '2026-11-18 14:2' + Math.floor(Math.random() * 9),
      request: request, note: note || ''
    };
  }

  function req(path, query, headers, bodyType, bodyRaw) {
    return {
      path: path || {},
      query: (query || []).map(function (q) { return { key: q[0], value: q[1], enabled: true }; }),
      headers: (headers || []).map(function (q) { return { key: q[0], value: q[1], enabled: true }; }),
      cookies: [],
      bodyType: bodyType || 'json',
      bodyRaw: bodyRaw || '',
      formRows: [],
      files: []
    };
  }

  function makeMainProject() {
    const apis = [
      api({
        id: 'api-users-list', method: 'GET', path: '/users', name: '分页查询用户', group: '用户模块',
        controller: 'UserController', summary: '按关键字与状态分页查询用户列表',
        params: {
          query: [
            P('page', 'Integer', false, '页码，从 1 开始', 1),
            P('size', 'Integer', false, '每页条数，最大 100', 20),
            P('keyword', 'String', false, '用户名或邮箱模糊匹配', ''),
            P('status', 'Enum', false, '用户状态：ACTIVE / DISABLED', 'ACTIVE')
          ]
        },
        mock: {
          code: 0, message: 'ok',
          data: {
            total: 128, page: 1, size: 20,
            list: [
              { id: 1001, username: 'alice', email: 'alice@example.com', role: 'ADMIN', status: 'ACTIVE', createdAt: '2026-11-12 09:11' },
              { id: 1002, username: 'bob', email: 'bob@example.com', role: 'USER', status: 'ACTIVE', createdAt: '2026-11-13 15:40' }
            ]
          }
        },
        fieldNotes: {
          'data.total': '总记录数', 'data.page': '当前页码', 'data.size': '每页条数',
          'data.list[].id': '用户 ID', 'data.list[].username': '登录名',
          'data.list[].email': '邮箱', 'data.list[].role': '角色',
          'data.list[].status': '状态', 'data.list[].createdAt': '创建时间'
        }
      }),
      api({
        id: 'api-user-detail', method: 'GET', path: '/users/{id}', name: '查询用户详情', group: '用户模块',
        controller: 'UserController', summary: '按用户 ID 查询基础资料与角色',
        params: { path: [P('id', 'Long', true, '用户 ID', 42)] },
        mock: {
          code: 0, message: 'ok',
          data: {
            id: 42, username: 'alice', nickname: '爱丽丝', email: 'alice@example.com',
            roles: ['ADMIN', 'USER'], status: 'ACTIVE', createdAt: '2026-11-12 09:11'
          }
        },
        fieldNotes: {
          'data.id': '用户 ID', 'data.username': '登录名', 'data.nickname': '昵称',
          'data.email': '邮箱', 'data.roles': '角色列表', 'data.status': '状态'
        }
      }),
      api({
        id: 'api-user-create', method: 'POST', path: '/users', name: '创建用户', group: '用户模块',
        controller: 'UserController', summary: '创建用户，用户名唯一',
        body: {
          type: 'json',
          sample: { username: 'carol', password: 'P@ssw0rd', email: 'carol@example.com', role: 'USER' },
          fields: [
            P('username', 'String', true, '登录名，唯一', 'carol'),
            P('password', 'String', true, '初始密码，8-32 位', 'P@ssw0rd'),
            P('email', 'String', true, '邮箱', 'carol@example.com'),
            P('role', 'Enum', true, '角色：ADMIN / USER', 'USER')
          ]
        },
        mockStatus: 201,
        mock: { code: 0, message: 'created', data: { id: 1302, username: 'carol' } }
      }),
      api({
        id: 'api-user-update', method: 'PUT', path: '/users/{id}', name: '更新用户资料', group: '用户模块',
        controller: 'UserController', summary: '整体替换用户资料中的可编辑字段',
        params: { path: [P('id', 'Long', true, '用户 ID', 42)] },
        body: {
          type: 'json',
          sample: { email: 'alice+new@example.com', nickname: '爱丽丝·改' },
          fields: [
            P('email', 'String', true, '邮箱', 'alice+new@example.com'),
            P('nickname', 'String', false, '昵称', '爱丽丝·改')
          ]
        },
        mock: { code: 0, message: 'ok', data: { id: 42, updatedAt: '2026-11-18 15:01' } }
      }),
      api({
        id: 'api-user-patch', method: 'PATCH', path: '/users/{id}', name: '局部更新用户', group: '用户模块',
        controller: 'UserController', summary: '只更新传入的字段，未传字段保持不变',
        params: { path: [P('id', 'Long', true, '用户 ID', 42)] },
        body: {
          type: 'json',
          sample: { nickname: '爱丽丝·补丁' },
          fields: [P('nickname', 'String', false, '昵称（PATCH 语义：只传要改的字段）', '爱丽丝·补丁')]
        },
        mock: { code: 0, message: 'ok', data: { id: 42, nickname: '爱丽丝·补丁', updatedAt: '2026-11-20 10:30' } }
      }),
      api({
        id: 'api-user-delete', method: 'DELETE', path: '/users/{id}', name: '删除用户', group: '用户模块',
        controller: 'UserController', summary: '逻辑删除用户，保留审计记录',
        params: { path: [P('id', 'Long', true, '用户 ID', 42)] },
        mockStatus: 204, mock: null
      }),
      api({
        id: 'api-user-export', method: 'GET', path: '/users/export', name: '导出用户 CSV', group: '用户模块',
        controller: 'UserController', summary: '导出全部用户为 CSV 文件',
        status: 'archived',
        params: { query: [P('format', 'Enum', false, '导出格式：csv / xlsx', 'csv')] },
        mock: { code: 0, message: 'ok', data: { url: '/files/export-20261118.csv' } }
      }),

      api({
        id: 'api-orders-list', method: 'GET', path: '/orders', name: '分页查询订单', group: '订单模块',
        controller: 'OrderController', summary: '按状态与用户筛选订单',
        params: {
          query: [
            P('page', 'Integer', false, '页码', 1),
            P('size', 'Integer', false, '每页条数', 20),
            P('status', 'Enum', false, '订单状态：CREATED / PAID / SHIPPED / CLOSED', 'PAID'),
            P('userId', 'Long', false, '用户 ID', 42)
          ]
        },
        mock: {
          code: 0, message: 'ok',
          data: {
            total: 36, page: 1, size: 20,
            list: [
              { id: 'ORD-20261118-001', userId: 42, amount: 289.0, status: 'PAID', items: 2, createdAt: '2026-11-18 10:02' }
            ]
          }
        },
        fieldNotes: { 'data.list[].id': '订单号', 'data.list[].amount': '金额（元）', 'data.list[].status': '订单状态' }
      }),
      api({
        id: 'api-order-detail', method: 'GET', path: '/orders/{id}', name: '查询订单详情', group: '订单模块',
        controller: 'OrderController', summary: '查询订单主信息与商品明细',
        params: { path: [P('id', 'String', true, '订单号', 'ORD-20261118-001')] },
        mock: {
          code: 0, message: 'ok',
          data: {
            id: 'ORD-20261118-001', userId: 42, amount: 289.0, status: 'PAID',
            items: [
              { skuId: 'SKU-7781', title: '机械键盘', quantity: 1, price: 249.0 },
              { skuId: 'SKU-1190', title: '鼠标垫', quantity: 1, price: 40.0 }
            ],
            createdAt: '2026-11-18 10:02'
          }
        }
      }),
      api({
        id: 'api-order-create', method: 'POST', path: '/orders', name: '创建订单', group: '订单模块',
        controller: 'OrderController', summary: '创建订单并冻结库存',
        body: {
          type: 'json',
          sample: {
            userId: 42,
            items: [{ skuId: 'SKU-7781', quantity: 1 }],
            remark: '工作日下午送达'
          },
          fields: [
            P('userId', 'Long', true, '下单用户 ID', 42),
            P('items', 'Array<Object>', true, '商品明细', ''),
            P('items[].skuId', 'String', true, 'SKU 编码', 'SKU-7781'),
            P('items[].quantity', 'Integer', true, '数量，1-99', 1),
            P('remark', 'String', false, '订单备注', '工作日下午送达')
          ]
        },
        mockStatus: 201,
        mock: { code: 0, message: 'created', data: { id: 'ORD-20261118-009', status: 'CREATED', amount: 249.0 } }
      }),
      api({
        id: 'api-order-status', method: 'PUT', path: '/orders/{id}/status', name: '更新订单状态', group: '订单模块',
        controller: 'OrderController', summary: '流转订单状态（已支付 → 已发货 → 已关闭）',
        status: 'changed',
        params: { path: [P('id', 'String', true, '订单号', 'ORD-20261118-001')] },
        body: {
          type: 'json',
          sample: { status: 'SHIPPED', reason: '用户加急' },
          fields: [
            P('status', 'Enum', true, '目标状态：SHIPPED / CLOSED', 'SHIPPED'),
            P('reason', 'String', false, '变更原因（本次扫描新增）', '用户加急')
          ]
        },
        changeNote: '请求体新增字段 reason；status 枚举新增 CLOSED',
        mock: { code: 0, message: 'ok', data: { id: 'ORD-20261118-001', status: 'SHIPPED' } }
      }),

      api({
        id: 'api-manual-health', method: 'GET', path: '/health', name: '健康检查', group: '手工接口',
        controller: '手工新建', summary: '第三方服务健康检查，不在源码中', source: 'manual',
        params: { query: [] },
        mock: { code: 0, message: 'ok', data: { status: 'UP', uptime: 12034 } }
      }),
      api({
        id: 'api-auth-login', method: 'POST', path: '/auth/login', name: '登录', group: '认证模块',
        controller: 'AuthController', summary: '账号密码登录，返回 JWT',
        body: {
          type: 'json',
          sample: { username: 'alice', password: 'P@ssw0rd' },
          fields: [
            P('username', 'String', true, '登录名', 'alice'),
            P('password', 'String', true, '密码', 'P@ssw0rd')
          ]
        },
        mock: {
          code: 0, message: 'ok',
          data: { token: 'eyJhbGciOiJIUzI1NiJ9.demo-token', expiresIn: 7200, user: { id: 42, username: 'alice' } }
        },
        fieldNotes: { 'data.token': 'JWT，后续请求放 Authorization', 'data.expiresIn': '有效期（秒）' }
      }),
      api({
        id: 'api-auth-logout', method: 'POST', path: '/auth/logout', name: '登出', group: '认证模块',
        controller: 'AuthController', summary: '使当前 token 失效',
        status: 'pending',
        params: { headers: [P('Authorization', 'String', true, 'Bearer token', '')] },
        mock: { code: 0, message: 'logout', data: null }
      }),
      api({
        id: 'api-auth-me', method: 'GET', path: '/auth/me', name: '当前登录用户', group: '认证模块',
        controller: 'AuthController', summary: '根据 token 返回当前用户与权限',
        params: { headers: [P('Authorization', 'String', true, 'Bearer token', '')] },
        mock: { code: 0, message: 'ok', data: { id: 42, username: 'alice', permissions: ['user:read', 'order:write'] } }
      }),

      api({
        id: 'api-file-upload', method: 'POST', path: '/files/upload', name: '上传文件', group: '文件模块',
        controller: 'FileController', summary: '上传头像或附件，返回文件 ID',
        parse: 'partial',
        parseNote: 'multipart 文件字段未能从源码完整解析，请人工确认 file 字段',
        body: {
          type: 'multipart',
          sample: {},
          fields: [
            P('file', 'File', true, '待上传文件（最大 10MB）', ''),
            P('bizType', 'Enum', false, '业务类型：avatar / attachment', 'avatar')
          ]
        },
        mockStatus: 201,
        mock: { code: 0, message: 'uploaded', data: { fileId: 'f_9f2c11', url: 'http://localhost:8081/api-test/files/f_9f2c11' } }
      }),
      api({
        id: 'api-file-get', method: 'GET', path: '/files/{id}', name: '下载文件', group: '文件模块',
        controller: 'FileController', summary: '按文件 ID 下载或预览',
        params: { path: [P('id', 'String', true, '文件 ID', 'f_9f2c11')] },
        mock: { code: 0, message: 'ok', data: { fileId: 'f_9f2c11', name: 'avatar.png', size: 20480 } }
      })
    ];

    const envs = [
      {
        id: 'env-local', name: '本地', baseUrl: 'http://localhost:8081/api-test',
        verifyTls: false, proxy: '', timeoutMs: 30000,
        params: {
          headers: [{ key: 'Authorization', value: 'Bearer local-dev-token', enabled: true }],
          query: [], cookies: [], body: []
        }
      },
      {
        id: 'env-test', name: '测试', baseUrl: 'https://test-api.feelpost.dev/api-test',
        verifyTls: true, proxy: 'http://10.20.0.8:3128', timeoutMs: 45000,
        params: {
          headers: [{ key: 'Authorization', value: 'Bearer test-2f9c8a1', enabled: true }],
          query: [{ key: 'X-Tenant', value: 'qa', enabled: true }], cookies: [], body: []
        }
      },
      {
        id: 'env-prod', name: '生产', baseUrl: 'https://api.feelpost.dev/api-test',
        verifyTls: true, proxy: '', timeoutMs: 30000,
        params: {
          headers: [{ key: 'Authorization', value: 'Bearer prod-7d1e33b', enabled: true }],
          query: [], cookies: [{ key: 'region', value: 'cn-east-1', enabled: true }], body: []
        }
      }
    ];

    const cases = [
      caseItem('case-1', 'api-users-list', '用户列表 · 第一页', 'env-local', ['smoke'], req({}, [['page', '1'], ['size', '20']], [], 'json', '')),
      caseItem('case-2', 'api-user-detail', '用户详情 · 正常', 'env-local', ['smoke', 'regression'], req({ id: '42' }, [], [], 'json', '')),
      caseItem('case-3', 'api-user-detail', '用户详情 · 不存在', 'env-local', ['negative'], req({ id: '99999' }, [], [], 'json', '')),
      caseItem('case-4', 'api-auth-login', '登录 · 成功', 'env-local', ['smoke'], req({}, [], [], 'json', JSON.stringify({ username: 'alice', password: 'P@ssw0rd' }, null, 2))),
      caseItem('case-5', 'api-auth-login', '登录 · 密码错误', 'env-local', ['negative'], req({}, [], [], 'json', JSON.stringify({ username: 'alice', password: 'wrong-pass' }, null, 2))),
      caseItem('case-6', 'api-order-create', '创建订单 · 单个商品', 'env-local', ['order'], req({}, [], [], 'json', JSON.stringify({ userId: 42, items: [{ skuId: 'SKU-7781', quantity: 1 }], remark: '原型演示' }, null, 2))),
      caseItem('case-7', 'api-order-status', '订单发货 · 带原因', 'env-test', ['order', 'regression'], req({ id: 'ORD-20261118-001' }, [], [], 'json', JSON.stringify({ status: 'SHIPPED', reason: '用户加急' }, null, 2)))
    ];

    return {
      id: 'proj-feelpost',
      name: 'api-test-service',
      path: '~/workspace/api-test',
      desc: 'AI 生成的用户与订单服务（Spring Boot 3）',
      lastScan: '2026-11-18 14:20',
      scanCount: 7,
      apis: apis,
      envs: envs,
      cases: cases,
      pendingBatch: null
    };
  }

  function makePayProject() {
    const apis = [
      api({
        id: 'pay-create', method: 'POST', path: '/pay/create', name: '创建支付单', group: '支付模块',
        controller: 'PayController', summary: '创建支付单并返回收银台地址',
        body: {
          type: 'json',
          sample: { orderId: 'ORD-20261118-001', amount: 289.0, channel: 'WECHAT' },
          fields: [
            P('orderId', 'String', true, '业务订单号', 'ORD-20261118-001'),
            P('amount', 'BigDecimal', true, '金额（元，两位小数）', 289.0),
            P('channel', 'Enum', true, '渠道：WECHAT / ALIPAY', 'WECHAT')
          ]
        },
        mock: { code: 0, message: 'ok', data: { payNo: 'PAY-8891', payUrl: 'https://cashier.example.com/PAY-8891' } }
      }),
      api({
        id: 'pay-detail', method: 'GET', path: '/pay/{payNo}', name: '查询支付单', group: '支付模块',
        controller: 'PayController', summary: '查询支付单状态',
        params: { path: [P('payNo', 'String', true, '支付单号', 'PAY-8891')] },
        mock: { code: 0, message: 'ok', data: { payNo: 'PAY-8891', status: 'SUCCESS', paidAt: '2026-11-18 10:06' } }
      }),
      api({
        id: 'pay-callback', method: 'POST', path: '/pay/callback', name: '支付回调', group: '支付模块',
        controller: 'PayController', summary: '渠道异步回调，校验签名',
        params: { headers: [P('X-Signature', 'String', true, '回调签名', '')] },
        body: {
          type: 'json',
          sample: { payNo: 'PAY-8891', status: 'SUCCESS', sign: 'abc123' },
          fields: [
            P('payNo', 'String', true, '支付单号', 'PAY-8891'),
            P('status', 'Enum', true, '结果：SUCCESS / FAIL', 'SUCCESS'),
            P('sign', 'String', true, '签名', 'abc123')
          ]
        },
        mock: { code: 0, message: 'ok', data: null }
      })
    ];

    return {
      id: 'proj-pay',
      name: 'pay-gateway',
      path: '~/workspace/pay-gateway',
      desc: '支付网关对外接口（AI 生成）',
      lastScan: '2026-11-16 18:02',
      scanCount: 2,
      apis: apis,
      envs: [
        {
          id: 'pay-env-local', name: '本地', baseUrl: 'http://localhost:8082/pay-gateway',
          verifyTls: false, proxy: '',
          params: { headers: [], query: [], cookies: [], body: [] }
        },
        {
          id: 'pay-env-sandbox', name: '沙箱', baseUrl: 'https://sandbox-pay.example.com/gateway',
          verifyTls: true, proxy: '', params: { headers: [], query: [], cookies: [], body: [] }
        }
      ],
      cases: [
        caseItem('pay-case-1', 'pay-create', '微信支付 · 创建支付单', 'pay-env-local', ['smoke'],
          req({}, [], [], 'json', JSON.stringify({ orderId: 'ORD-20261118-001', amount: 289.0, channel: 'WECHAT' }, null, 2)))
      ],
      pendingBatch: null
    };
  }

  FP.makeSeed = function () {
    return {
      version: 1,
      theme: 'light',
      dataDir: '~/Documents/feelpost',
      debugLogging: false,
      globalParams: {
        headers: [
          { key: 'User-Agent', value: 'feelpost/1.0 (prototype)', enabled: true },
          { key: 'X-Client', value: 'web', enabled: true }
        ],
        query: [{ key: 'locale', value: 'zh-CN', enabled: true }],
        cookies: [],
        body: []
      },
      projects: [makeMainProject(), makePayProject()],
      lastProjectId: 'proj-feelpost'
    };
  };

  /* 一次“重启后增量扫描”的模拟结果 */
  FP.makeScanBatch = function () {
    return [
      {
        type: 'new',
        api: api({
          id: 'api-reports-daily', method: 'GET', path: '/reports/daily', name: '每日经营报表', group: '报表模块',
          controller: 'ReportController', summary: '按日期汇总订单数与交易额',
          params: {
            query: [
              P('date', 'Date', true, '统计日期，yyyy-MM-dd', '2026-11-18'),
              P('compare', 'Boolean', false, '是否对比前一日', true)
            ]
          },
          mock: { code: 0, message: 'ok', data: { date: '2026-11-18', orders: 118, gmv: 34210.5 } }
        })
      },
      {
        type: 'new',
        api: api({
          id: 'api-reports-export', method: 'POST', path: '/reports/export', name: '导出报表', group: '报表模块',
          controller: 'ReportController', summary: '导出指定区间报表文件',
          body: {
            type: 'json',
            sample: { range: 'LAST_7_DAYS', format: 'XLSX' },
            fields: [
              P('range', 'Enum', true, '范围：LAST_7_DAYS / LAST_30_DAYS / CUSTOM', 'LAST_7_DAYS'),
              P('format', 'Enum', true, '格式：CSV / XLSX', 'XLSX')
            ]
          },
          mockStatus: 201,
          mock: { code: 0, message: 'created', data: { taskId: 'EXP-7781' } }
        })
      },
      {
        type: 'new',
        api: api({
          id: 'api-orders-stats', method: 'GET', path: '/orders/stats', name: '订单统计', group: '订单模块',
          controller: 'OrderController', summary: '按状态统计订单数量与金额',
          params: { query: [P('userId', 'Long', false, '用户 ID', 42)] },
          mock: { code: 0, message: 'ok', data: { total: 36, paid: 20, shipped: 10, closed: 6 } }
        })
      },
      {
        type: 'changed',
        apiId: 'api-user-create',
        diff: ['请求体新增字段 phone', 'password 由可选改为必填'],
        fieldPatch: { key: 'phone', type: 'String', required: false, desc: '手机号（本次扫描新增）', sample: '13800001111' }
      },
      {
        type: 'changed',
        apiId: 'api-order-status',
        diff: ['请求体新增字段 reason', 'status 枚举新增 CLOSED']
      },
      {
        type: 'deleted',
        apiId: 'api-user-export',
        affectedCases: 0
      }
    ];
  };

  const STATUS_TEXT = {
    200: 'OK', 201: 'Created', 204: 'No Content', 400: 'Bad Request', 401: 'Unauthorized',
    403: 'Forbidden', 404: 'Not Found', 422: 'Unprocessable Entity', 500: 'Internal Server Error'
  };

  FP.statusText = function (code) {
    return STATUS_TEXT[code] || 'Unknown';
  };

  /** 模拟服务端响应（仅前端，不发真实请求） */
  FP.mockRespond = function (api, eff, env) {
    const status = api.mockStatus || 200;
    let body = api.mock;
    if (typeof body === 'function') {
      try { body = body(eff); } catch (e) { body = { code: 500, message: 'mock error' }; }
    }
    if (body && typeof body === 'object') {
      body = JSON.parse(JSON.stringify(body));
      // 让路径参数回显，便于演示
      const firstPath = Object.keys(eff.pathMap || {})[0];
      if (firstPath && body.data && typeof body.data === 'object' && !Array.isArray(body.data)) {
        const v = eff.pathMap[firstPath];
        if (v !== '' && body.data[firstPath] === undefined) {
          const num = Number(v);
          body.data[firstPath] = isNaN(num) ? v : num;
        }
      }
    }
    const text = body == null ? '' : JSON.stringify(body, null, 2);
    return {
      status: status,
      statusText: STATUS_TEXT[status] || 'Unknown',
      time: Math.floor(60 + Math.random() * 180),
      size: text.length,
      headers: [
        ['Content-Type', 'application/json;charset=UTF-8'],
        ['X-Request-Id', 'req_' + Math.random().toString(36).slice(2, 10)],
        ['Server', 'nginx/1.24.0'],
        ['Date', new Date().toUTCString()]
      ],
      body: text,
      at: FP.util.nowStr()
    };
  };
})();
