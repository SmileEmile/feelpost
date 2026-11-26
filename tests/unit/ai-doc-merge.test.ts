import { describe, expect, it } from 'vitest'
import { mergeMarkdown } from '../../src/renderer/src/ai-doc-merge'

describe('mergeMarkdown', () => {
  it('returns a single fragment unchanged', () => {
    expect(mergeMarkdown(['# 查询接口文档\n\n## 1. 接口概述'])).toBe('# 查询接口文档\n\n## 1. 接口概述')
  })

  it('keeps every interface H1 and separates batches', () => {
    const merged = mergeMarkdown([
      '# 查询接口文档\n\n## 1. 接口概述',
      '\n# 保存接口文档\n\n## 1. 接口概述\n'
    ])
    expect(merged).toContain('# 查询接口文档')
    expect(merged).toContain('# 保存接口文档')
    expect(merged.indexOf('# 查询接口文档')).toBeLessThan(merged.indexOf('# 保存接口文档'))
  })
})
