import {vi, it, expect, beforeEach, describe} from 'vitest'
import * as core from '../__fixtures__/core.js'
import * as path from 'path'

const mockExistsSync = vi.fn()
const mockReadFileSync = vi.fn()

vi.mock('fs', () => ({
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
}))

vi.mock('@actions/core', () => core)

const {loadContentFromFileOrInput, parseCustomHeaders, validatePath} = await import('../src/helpers.js')

describe('helpers.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('validatePath', () => {
    it('resolves a relative path within cwd to an absolute path', () => {
      const result = validatePath('some/relative/path.txt')
      expect(result).toBe(path.resolve(process.cwd(), 'some/relative/path.txt'))
    })

    it('resolves a simple filename to an absolute path within cwd', () => {
      const result = validatePath('file.txt')
      expect(result).toBe(path.resolve(process.cwd(), 'file.txt'))
    })

    it('allows path with internal .. that resolves within cwd', () => {
      const result = validatePath('a/../b/file.txt')
      expect(result).toBe(path.resolve(process.cwd(), 'b/file.txt'))
    })

    it('allows an absolute path that is within cwd', () => {
      const inCwdPath = path.join(process.cwd(), 'subdir', 'file.txt')
      const result = validatePath(inCwdPath)
      expect(result).toBe(inCwdPath)
    })

    it('throws for a path that traverses above cwd using ../', () => {
      expect(() => validatePath('../outside.txt')).toThrow('Path traversal detected')
    })

    it('throws for a deeply nested traversal path', () => {
      expect(() => validatePath('a/../../outside.txt')).toThrow('Path traversal detected')
    })

    it('throws for a pure .. path', () => {
      expect(() => validatePath('..')).toThrow('Path traversal detected')
    })

    it('throws for an absolute path outside cwd', () => {
      expect(() => validatePath('/etc/passwd')).toThrow('Path traversal detected')
    })

    it('throws for path traversal with encoded or mixed separators', () => {
      // Multiple levels up
      expect(() => validatePath('../../etc/passwd')).toThrow('Path traversal detected')
    })

    it('allows current directory reference (.)', () => {
      const result = validatePath('.')
      expect(result).toBe(path.resolve(process.cwd(), '.'))
    })

    it('allows empty string (resolves to cwd itself)', () => {
      const result = validatePath('')
      expect(result).toBe(path.resolve(process.cwd()))
    })

    it('allows a deeply nested path that stays within cwd', () => {
      const result = validatePath('a/b/c/d/e/file.txt')
      expect(result).toBe(path.resolve(process.cwd(), 'a/b/c/d/e/file.txt'))
    })

    it('throws for a sibling directory that shares a cwd prefix (regression)', () => {
      // e.g. cwd=/home/jailuser/git → /home/jailuser/git-extra/file.txt must be rejected
      const cwd = process.cwd()
      const siblingPath = cwd + '-extra/file.txt'
      expect(() => validatePath(siblingPath)).toThrow('Path traversal detected')
    })

    it('returns an absolute path for every valid input', () => {
      const result = validatePath('relative/path.txt')
      expect(path.isAbsolute(result)).toBe(true)
    })
  })

  describe('loadContentFromFileOrInput', () => {
    it('loads content from file when file path is provided', () => {
      const filePath = 'path/to/file.txt'
      const fileContent = 'File content here'

      core.getInput.mockImplementation((name: string) => {
        if (name === 'file-input') return filePath
        if (name === 'content-input') return ''
        return ''
      })

      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockReturnValue(fileContent)

      const result = loadContentFromFileOrInput('file-input', 'content-input')

      expect(core.getInput).toHaveBeenCalledWith('file-input')
      expect(mockExistsSync).toHaveBeenCalledWith(expect.stringContaining(filePath))
      expect(mockReadFileSync).toHaveBeenCalledWith(expect.stringContaining(filePath), 'utf-8')
      expect(result).toBe(fileContent)
    })

    it('throws error when file path is provided but file does not exist', () => {
      const filePath = 'path/to/nonexistent.txt'

      core.getInput.mockImplementation((name: string) => {
        if (name === 'file-input') return filePath
        if (name === 'content-input') return ''
        return ''
      })

      mockExistsSync.mockReturnValue(false)

      expect(() => {
        loadContentFromFileOrInput('file-input', 'content-input')
      }).toThrow(/File for file-input was not found/)

      expect(mockExistsSync).toHaveBeenCalledWith(expect.stringContaining(filePath))
      expect(mockReadFileSync).not.toHaveBeenCalled()
    })

    it('uses content input when file path is empty', () => {
      const contentInput = 'Direct content input'

      core.getInput.mockImplementation((name: string) => {
        if (name === 'file-input') return ''
        if (name === 'content-input') return contentInput
        return ''
      })

      const result = loadContentFromFileOrInput('file-input', 'content-input')

      expect(core.getInput).toHaveBeenCalledWith('file-input')
      expect(core.getInput).toHaveBeenCalledWith('content-input')
      expect(mockExistsSync).not.toHaveBeenCalled()
      expect(mockReadFileSync).not.toHaveBeenCalled()
      expect(result).toBe(contentInput)
    })

    it('prefers file path over content input when both are provided', () => {
      const filePath = 'path/to/file.txt'
      const fileContent = 'File content'
      const contentInput = 'Direct content input'

      core.getInput.mockImplementation((name: string) => {
        if (name === 'file-input') return filePath
        if (name === 'content-input') return contentInput
        return ''
      })

      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockReturnValue(fileContent)

      const result = loadContentFromFileOrInput('file-input', 'content-input')

      expect(result).toBe(fileContent)
      expect(mockExistsSync).toHaveBeenCalledWith(expect.stringContaining(filePath))
      expect(mockReadFileSync).toHaveBeenCalledWith(expect.stringContaining(filePath), 'utf-8')
    })

    it('uses default value when neither file nor content is provided', () => {
      const defaultValue = 'Default content'

      core.getInput.mockImplementation(() => '')

      const result = loadContentFromFileOrInput('file-input', 'content-input', defaultValue)

      expect(result).toBe(defaultValue)
      expect(mockExistsSync).not.toHaveBeenCalled()
      expect(mockReadFileSync).not.toHaveBeenCalled()
    })

    it('throws error when neither file nor content is provided and no default', () => {
      core.getInput.mockImplementation(() => '')

      expect(() => {
        loadContentFromFileOrInput('file-input', 'content-input')
      }).toThrow('Neither file-input nor content-input was set')

      expect(mockExistsSync).not.toHaveBeenCalled()
      expect(mockReadFileSync).not.toHaveBeenCalled()
    })

    it('throws when file path attempts directory traversal', () => {
      core.getInput.mockImplementation((name: string) => {
        if (name === 'file-input') return '../../../etc/passwd'
        if (name === 'content-input') return ''
        return ''
      })

      expect(() => {
        loadContentFromFileOrInput('file-input', 'content-input')
      }).toThrow('Path traversal detected')

      expect(mockExistsSync).not.toHaveBeenCalled()
      expect(mockReadFileSync).not.toHaveBeenCalled()
    })

    it('handles undefined inputs correctly', () => {
      const defaultValue = 'Default content'

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      core.getInput.mockImplementation(() => undefined as any)

      const result = loadContentFromFileOrInput('file-input', 'content-input', defaultValue)

      expect(result).toBe(defaultValue)
    })
  })

  describe('parseCustomHeaders', () => {
    beforeEach(() => {
      vi.clearAllMocks()
    })

    it('parses YAML format headers correctly', () => {
      const yamlInput = `header1: value1
header2: value2
X-Custom-Header: custom-value`

      const result = parseCustomHeaders(yamlInput)

      expect(result).toEqual({
        header1: 'value1',
        header2: 'value2',
        'X-Custom-Header': 'custom-value',
      })
      expect(core.debug).toHaveBeenCalledWith('Custom header added: header1: value1')
      expect(core.debug).toHaveBeenCalledWith('Custom header added: header2: value2')
      expect(core.debug).toHaveBeenCalledWith('Custom header added: X-Custom-Header: custom-value')
    })

    it('parses JSON format headers correctly', () => {
      const jsonInput = '{"header1": "value1", "header2": "value2", "X-Team": "engineering"}'

      const result = parseCustomHeaders(jsonInput)

      expect(result).toEqual({
        header1: 'value1',
        header2: 'value2',
        'X-Team': 'engineering',
      })
      expect(core.debug).toHaveBeenCalledWith('Custom header added: header1: value1')
      expect(core.debug).toHaveBeenCalledWith('Custom header added: header2: value2')
      expect(core.debug).toHaveBeenCalledWith('Custom header added: X-Team: engineering')
    })

    it('returns empty object for empty input', () => {
      expect(parseCustomHeaders('')).toEqual({})
      expect(parseCustomHeaders('  ')).toEqual({})
      expect(core.warning).not.toHaveBeenCalled()
    })

    it('masks sensitive header values in logs', () => {
      const yamlInput = `Ocp-Apim-Subscription-Key: secret123
X-Api-Token: token456
Authorization: Bearer abc123
serviceName: my-service
password: pass123`

      const result = parseCustomHeaders(yamlInput)

      expect(result).toEqual({
        'Ocp-Apim-Subscription-Key': 'secret123',
        'X-Api-Token': 'token456',
        Authorization: 'Bearer abc123',
        serviceName: 'my-service',
        password: 'pass123',
      })

      // Sensitive headers should be masked
      expect(core.debug).toHaveBeenCalledWith('Custom header added: Ocp-Apim-Subscription-Key: ***MASKED***')
      expect(core.debug).toHaveBeenCalledWith('Custom header added: X-Api-Token: ***MASKED***')
      expect(core.debug).toHaveBeenCalledWith('Custom header added: Authorization: ***MASKED***')
      expect(core.debug).toHaveBeenCalledWith('Custom header added: password: ***MASKED***')

      // Non-sensitive headers should not be masked
      expect(core.debug).toHaveBeenCalledWith('Custom header added: serviceName: my-service')
    })

    it('validates header names and skips invalid ones', () => {
      const yamlInput = `valid-header: value1
invalid header: value2
invalid_underscore: value3
invalid@header: value4
valid123: value5`

      const result = parseCustomHeaders(yamlInput)

      expect(result).toEqual({
        'valid-header': 'value1',
        invalid_underscore: 'value3',
        valid123: 'value5',
      })

      expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('Skipping invalid header name: invalid header'))
      expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('Skipping invalid header name: invalid@header'))
    })

    it('warns and returns empty object for invalid JSON', () => {
      const invalidJson = '{invalid json}'

      const result = parseCustomHeaders(invalidJson)

      expect(result).toEqual({})
      expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('Failed to parse custom headers'))
    })

    it('warns and returns empty object for invalid YAML', () => {
      const invalidYaml = 'invalid: yaml: structure: bad'

      const result = parseCustomHeaders(invalidYaml)

      expect(result).toEqual({})
      expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('Failed to parse custom headers'))
    })

    it('warns and returns empty object for JSON array', () => {
      const jsonArray = '["header1", "header2"]'

      const result = parseCustomHeaders(jsonArray)

      expect(result).toEqual({})
      expect(core.warning).toHaveBeenCalledWith('Custom headers JSON must be an object, not null or an array')
    })

    it('warns and returns empty object for null value', () => {
      // The string 'null' is valid YAML and gets parsed as null
      const nullValue = 'null'

      const result = parseCustomHeaders(nullValue)

      expect(result).toEqual({})
      expect(core.warning).toHaveBeenCalledWith('Custom headers YAML must be an object')
    })

    it('warns and returns empty object for YAML array', () => {
      const yamlArray = `- header1
- header2`

      const result = parseCustomHeaders(yamlArray)

      expect(result).toEqual({})
      expect(core.warning).toHaveBeenCalledWith('Custom headers YAML must be an object')
    })

    it('converts non-string values to strings', () => {
      const jsonInput = '{"numericHeader": 123, "boolHeader": true, "nullHeader": null}'

      const result = parseCustomHeaders(jsonInput)

      expect(result).toEqual({
        numericHeader: '123',
        boolHeader: 'true',
        nullHeader: 'null',
      })
    })

    it('rejects header values with newline characters (LF)', () => {
      const jsonInput = '{"X-Custom-Header": "value\\nwith\\nnewline", "header1": "safe-value"}'

      const result = parseCustomHeaders(jsonInput)

      // Only the safe header should be accepted
      expect(result).toEqual({
        header1: 'safe-value',
      })

      expect(core.warning).toHaveBeenCalledWith(
        'Skipping header "X-Custom-Header" because its value contains newline characters, which are not allowed in HTTP header values.',
      )
    })

    it('rejects header values with carriage return characters (CR)', () => {
      const jsonInput = '{"X-Injected": "value\\rwith\\rcarriage", "X-Safe": "safe-value"}'

      const result = parseCustomHeaders(jsonInput)

      // Only the safe header should be accepted
      expect(result).toEqual({
        'X-Safe': 'safe-value',
      })

      expect(core.warning).toHaveBeenCalledWith(
        'Skipping header "X-Injected" because its value contains newline characters, which are not allowed in HTTP header values.',
      )
    })

    it('rejects header values with CRLF sequences', () => {
      const jsonInput = '{"X-Attack": "value\\r\\nInjected-Header: malicious", "X-Valid": "normal"}'

      const result = parseCustomHeaders(jsonInput)

      // Only the valid header should be accepted
      expect(result).toEqual({
        'X-Valid': 'normal',
      })

      expect(core.warning).toHaveBeenCalledWith(
        'Skipping header "X-Attack" because its value contains newline characters, which are not allowed in HTTP header values.',
      )
    })

    it('rejects multiline YAML values for security', () => {
      const yamlInput = `header1: value1
header2: |
  multiline
  value
  here`

      const result = parseCustomHeaders(yamlInput)

      // header2 should be rejected because it contains newlines
      expect(result).toEqual({
        header1: 'value1',
      })

      expect(core.warning).toHaveBeenCalledWith(
        'Skipping header "header2" because its value contains newline characters, which are not allowed in HTTP header values.',
      )
    })

    it('masks cookie/session header values in debug logs', () => {
      // Cookie and session headers commonly carry authentication credentials,
      // so their values must be masked in debug logs. The "credential" and
      // "bearer" substrings are not in sensitivePatterns, so headers whose
      // names contain those substrings (and nothing else sensitive) are
      // logged in the clear.
      const yamlInput = `Cookie: session_id=12345
X-Session-Data: xyz789
X-Credentials: user:pass
X-Bearer: only-bearer-no-token`

      const result = parseCustomHeaders(yamlInput)

      expect(result).toEqual({
        Cookie: 'session_id=12345',
        'X-Session-Data': 'xyz789',
        'X-Credentials': 'user:pass',
        'X-Bearer': 'only-bearer-no-token',
      })

      // cookie/session match sensitivePatterns → masked
      expect(core.debug).toHaveBeenCalledWith('Custom header added: Cookie: ***MASKED***')
      expect(core.debug).toHaveBeenCalledWith('Custom header added: X-Session-Data: ***MASKED***')
      // credential/bearer are not in sensitivePatterns → logged unmasked
      expect(core.debug).toHaveBeenCalledWith('Custom header added: X-Credentials: user:pass')
      expect(core.debug).toHaveBeenCalledWith('Custom header added: X-Bearer: only-bearer-no-token')
    })

    it('masks X-Bearer-Token because it contains "token" even though "bearer" alone is not sensitive', () => {
      // 'bearer' was removed from sensitivePatterns, but 'token' is still present.
      // 'X-Bearer-Token' contains 'token' → must be masked.
      // 'X-Bearer' contains neither a remaining sensitive pattern → must NOT be masked.
      const yamlInput = `X-Bearer-Token: secret-value
X-Bearer: not-a-token`

      const result = parseCustomHeaders(yamlInput)

      expect(result).toEqual({
        'X-Bearer-Token': 'secret-value',
        'X-Bearer': 'not-a-token',
      })

      expect(core.debug).toHaveBeenCalledWith('Custom header added: X-Bearer-Token: ***MASKED***')
      expect(core.debug).toHaveBeenCalledWith('Custom header added: X-Bearer: not-a-token')
    })

    it('masks headers matching the five remaining sensitive patterns (key, token, secret, password, authorization)', () => {
      const yamlInput = `API-Key: mykey123
X-Auth-Token: tok456
My-Secret: shh
user-password: hunter2
Authorization: Basic dXNlcjpwYXNz`

      const result = parseCustomHeaders(yamlInput)

      expect(result).toEqual({
        'API-Key': 'mykey123',
        'X-Auth-Token': 'tok456',
        'My-Secret': 'shh',
        'user-password': 'hunter2',
        Authorization: 'Basic dXNlcjpwYXNz',
      })

      expect(core.debug).toHaveBeenCalledWith('Custom header added: API-Key: ***MASKED***')
      expect(core.debug).toHaveBeenCalledWith('Custom header added: X-Auth-Token: ***MASKED***')
      expect(core.debug).toHaveBeenCalledWith('Custom header added: My-Secret: ***MASKED***')
      expect(core.debug).toHaveBeenCalledWith('Custom header added: user-password: ***MASKED***')
      expect(core.debug).toHaveBeenCalledWith('Custom header added: Authorization: ***MASKED***')
    })

    it('does not mask a header whose name only contains "credential" or "bearer" (removed from sensitive patterns)', () => {
      const jsonInput = '{"X-Service-Credential": "abc", "X-Bearer": "xyz"}'

      const result = parseCustomHeaders(jsonInput)

      expect(result).toEqual({
        'X-Service-Credential': 'abc',
        'X-Bearer': 'xyz',
      })

      expect(core.debug).toHaveBeenCalledWith('Custom header added: X-Service-Credential: abc')
      expect(core.debug).toHaveBeenCalledWith('Custom header added: X-Bearer: xyz')
      expect(core.debug).not.toHaveBeenCalledWith(expect.stringContaining('***MASKED***'))
    })

    it('handles complex real-world Azure APIM example', () => {
      const apimHeaders = `Ocp-Apim-Subscription-Key: my-subscription-key-123
serviceName: terraform-plan-workflow
env: prod
team: infrastructure
computer: github-actions
systemID: terraform-ci`

      const result = parseCustomHeaders(apimHeaders)

      expect(result).toEqual({
        'Ocp-Apim-Subscription-Key': 'my-subscription-key-123',
        serviceName: 'terraform-plan-workflow',
        env: 'prod',
        team: 'infrastructure',
        computer: 'github-actions',
        systemID: 'terraform-ci',
      })

      // Only the subscription key should be masked
      expect(core.debug).toHaveBeenCalledWith('Custom header added: Ocp-Apim-Subscription-Key: ***MASKED***')
      expect(core.debug).toHaveBeenCalledWith('Custom header added: serviceName: terraform-plan-workflow')
    })
  })
})
