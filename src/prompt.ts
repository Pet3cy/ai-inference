import * as core from '@actions/core'
import * as fs from 'fs'
import * as yaml from 'js-yaml'
import {validatePath} from './helpers.js'

export interface PromptMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ModelParameters {
  maxTokens?: number // Deprecated
  maxCompletionTokens?: number
  temperature?: number
  topP?: number
}

export interface PromptConfig {
  messages: PromptMessage[]
  model?: string
  modelParameters?: ModelParameters
  responseFormat?: 'text' | 'json_schema'
  jsonSchema?: string
}

export interface TemplateVariables {
  [key: string]: string
}

/**
 * Parse template variables from YAML input string
 */
export function parseTemplateVariables(input: string): TemplateVariables {
  if (!input.trim()) {
    return {}
  }

  try {
    const parsed = yaml.load(input) as TemplateVariables
    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error('Template variables must be a YAML object')
    }
    return parsed
  } catch (error) {
    throw new Error(`Failed to parse template variables: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Parse a YAML string that maps template variable names to file paths and return an object
 * whose keys are variable names and values are the contents of the referenced files.
 *
 * Empty or whitespace-only input returns an empty object.
 *
 * @param fileInput - YAML string mapping variable names to file paths
 * @returns An object mapping each variable name to the contents of its file
 * @throws If the YAML does not parse to an object, if a mapping value is not a string,
 *         if a referenced file does not exist, or if a file cannot be read
 */
export function parseFileTemplateVariables(fileInput: string): TemplateVariables {
  if (!fileInput.trim()) {
    return {}
  }

  try {
    const parsed = yaml.load(fileInput) as Record<string, unknown>
    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error('File template variables must be a YAML object')
    }

    const result: TemplateVariables = {}
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value !== 'string') {
        throw new Error(`File template variable '${key}' must be a string file path`)
      }
      const filePath = value
      const safePath = validatePath(filePath)
      if (!fs.existsSync(safePath)) {
        throw new Error(`File for template variable '${key}' was not found: ${filePath}`)
      }
      try {
        result[key] = fs.readFileSync(safePath, 'utf-8')
      } catch (err) {
        throw new Error(
          `Failed to read file for template variable '${key}' at path '${filePath}': ${err instanceof Error ? err.message : 'Unknown error'}`,
        )
      }
    }

    return result
  } catch (error) {
    throw new Error(
      `Failed to parse file template variables: ${error instanceof Error ? error.message : 'Unknown error'}`,
    )
  }
}

/**
 * Replace template variables in text using {{variable}} syntax
 */
export function replaceTemplateVariables(text: string, variables: TemplateVariables): string {
  return text.replace(/\{\{([\w.-]+)\}\}/g, (match, variableName) => {
    if (variableName in variables) {
      return variables[variableName]
    }
    core.warning(`Template variable '${variableName}' not found in input variables`)
    return match // Return the original placeholder if variable not found
  })
}

/**
 * Load a prompt YAML file, validate its structure, and substitute template variables into message contents.
 *
 * @param filePath - Path to the prompt YAML file; the path is validated before reading.
 * @param templateVariables - Mapping of template variable names to string values used to replace `{{name}}` placeholders in message content.
 * @returns The parsed PromptConfig with `messages` validated and their `content` values replaced by the provided template variables.
 * @throws Error if the file is not found, the YAML cannot be parsed, the `messages` array is missing or malformed, a message is missing `role` or `content`, or a message has an invalid `role`.
 */
export function loadPromptFile(filePath: string, templateVariables: TemplateVariables = {}): PromptConfig {
  const safePath = validatePath(filePath)
  if (!fs.existsSync(safePath)) {
    throw new Error(`Prompt file not found: ${filePath}`)
  }

  const fileContent = fs.readFileSync(safePath, 'utf-8')

  try {
    const config = yaml.load(fileContent) as PromptConfig

    if (!config.messages || !Array.isArray(config.messages)) {
      throw new Error('Prompt file must contain a "messages" array')
    }

    // Validate messages
    for (const message of config.messages) {
      if (!message.role || !message.content) {
        throw new Error('Each message must have "role" and "content" properties')
      }
      if (!['system', 'user', 'assistant'].includes(message.role)) {
        throw new Error(`Invalid message role: ${message.role}`)
      }
    }

    // Prepare messages by replacing template variables with actual content
    config.messages = config.messages.map(msg => {
      return {
        ...msg,
        content: replaceTemplateVariables(msg.content, templateVariables),
      }
    })

    return config
  } catch (error) {
    throw new Error(`Failed to parse prompt file: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Check if a file is a prompt YAML file based on extension
 */
export function isPromptYamlFile(filePath: string): boolean {
  return filePath.endsWith('.prompt.yml') || filePath.endsWith('.prompt.yaml')
}
