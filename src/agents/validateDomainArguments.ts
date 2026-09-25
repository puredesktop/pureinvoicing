import { domainSchemas } from './domainSchemas'
type Schema = { oneOf?: readonly Schema[]; $ref?: string; $defs?: Record<string, Schema>; type?: string | readonly string[];
  properties?: Record<string, Schema>; required?: readonly string[]; additionalProperties?: boolean;
  items?: Schema; enum?: readonly unknown[]; const?: unknown; minimum?: number; maximum?: number;
  exclusiveMinimum?: number; minProperties?: number; minItems?: number; uniqueItems?: boolean;
  dependentRequired?: Record<string, readonly string[]>; pattern?: string; minLength?: number }
export function validateDomainArguments(name: string, args: unknown): void {
  const root = (domainSchemas as Record<string, Schema>)[name]
  if (!root) throw new Error('Unknown domain operation.')
  function check(schema: Schema, value: unknown, path: string) {
    if (schema.oneOf) {
      const matches = schema.oneOf.filter(option => {
        try { check(option, value, path); return true } catch { return false } // Normal schema alternative mismatch.
      })
      if (matches.length !== 1) throw new Error(`${path}: select exactly one supported target or request.`)
    }
    if (schema.$ref) { check(root.$defs![schema.$ref.split('/').pop()!], value, path); return }
    const actual = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value
    const types = typeof schema.type === 'string' ? [schema.type] : schema.type
    if (types && !types.some(t => t === actual || (t === 'integer' && typeof value === 'number' && Number.isSafeInteger(value)))) throw new Error(`${path}: invalid type.`)
    if (schema.enum && !schema.enum.includes(value)) throw new Error(`${path}: unsupported value.`)
    if ('const' in schema && value !== schema.const) throw new Error(`${path}: explicit verification is required.`)
    if (typeof value === 'number' && (!Number.isFinite(value) || (schema.minimum !== undefined && value < schema.minimum) ||
      (schema.maximum !== undefined && value > schema.maximum) || (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum))) throw new Error(`${path}: number is out of range.`)
    if (typeof value === 'string' && value.length < (schema.minLength ?? 0)) throw new Error(`${path}: text is too short.`)
    if (typeof value === 'string' && schema.pattern && !new RegExp(schema.pattern).test(value)) throw new Error(`${path}: invalid format.`)
    if (Array.isArray(value)) {
      if (value.length < (schema.minItems ?? 0) || (schema.uniqueItems && new Set(value).size !== value.length)) throw new Error(`${path}: invalid selection.`)
      value.forEach((item, i) => { if (schema.items) check(schema.items, item, `${path}.${i}`) })
    } else if (value && typeof value === 'object') {
      const object = value as Record<string, unknown>
      if (Object.keys(object).length < (schema.minProperties ?? 0)) throw new Error(`${path}: provide at least one field.`)
      for (const required of schema.required ?? []) if (!Object.hasOwn(object, required)) throw new Error(`${path}.${required}: required.`)
      for (const [key, item] of Object.entries(object)) {
        if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error(`${path}: invalid field.`)
        const child = schema.properties?.[key]
        if (!child && schema.additionalProperties === false) throw new Error(`${path}.${key}: unknown field.`)
        if (child) check(child, item, `${path}.${key}`)
      }
      for (const [key, required] of Object.entries(schema.dependentRequired ?? {})) {
        if (key in object && required.some(field => !(field in object))) throw new Error(`${path}.${key}: missing related field.`)
      }
    }
  }
  check(root, args, name)
}
