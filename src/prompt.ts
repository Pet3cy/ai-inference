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
 * Parse template variables from a YAML string into a string-to-string map.
 *
 * @param input - YAML-formatted string containing a mapping of template variable names to values
 * @returns The parsed template variables as a `TemplateVariables` object; returns an empty object if `input` is empty or only whitespace
 * @throws Error if parsing fails or the YAML root value is not an object (messages: "Template variables must be a YAML object" or "Failed to parse template variables: <message>")
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
 * Parse a YAML mapping of variable names to file paths and return the file contents for each variable.
 *
 * @param fileInput - YAML string mapping variable names to file paths; empty or whitespace-only input returns an empty object
 * @returns A mapping from variable name to the UTF-8 contents of the referenced file
 * @throws If YAML parsing fails or the parsed value is not an object
 * @throws If any mapped value is not a string file path
 * @throws If a referenced file path does not exist
 */
export function parseFileTemplateVariables(fileInput: string): TemplateVariables {
  if (!fileInput.trim()) {
    return {}
  }

  let parsed: Record<string, unknown>
  try {
    parsed = yaml.load(fileInput) as Record<string, unknown>
    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error('File template variables must be a YAML object')
    }
  } catch (error) {
    throw new Error(
      `Failed to parse file template variables: ${error instanceof Error ? error.message : 'Unknown error'}`,
    )
  }

  const result: TemplateVariables = {}
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value !== 'string') {
      throw new Error(`File template variable '${key}' must be a string file path`)
    }
    const safePath = validatePath(value)
    if (!fs.existsSync(safePath)) {
      throw new Error(`File for template variable '${key}' was not found: ${value}`)
    }
    result[key] = fs.readFileSync(safePath, 'utf-8')
  }

  return result
}

/**
 * Substitute {{variable}} placeholders in a string with provided variable values.
 *
 * Replaces every `{{name}}` occurrence with the corresponding value from `variables`. If a placeholder has no matching key, a warning is emitted via `core.warning` and the original placeholder is left unchanged.
 *
 * @param text - The string containing `{{...}}` placeholders to replace.
 * @param variables - Mapping of variable names to replacement strings.
 * @returns The input string with matching placeholders replaced by their values.
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
 * Load a prompt YAML file and expand template variables in each message's content.
 *
 * @param filePath - Path to the prompt YAML file
 * @param templateVariables - Mapping of template variable names to replacement strings used when expanding message content
 * @returns The parsed PromptConfig whose `messages` have template variables substituted
 * @throws Error when the file is missing, the YAML is invalid, or the prompt config/messages are malformed
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
