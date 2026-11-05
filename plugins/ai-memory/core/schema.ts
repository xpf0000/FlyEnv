import { MEMORY_TYPES, type MemoryMethod } from '../shared'
import { INPUT_LIMITS as L } from './limits'

const string = (maxLength: number) => ({ type: 'string', minLength: 1, maxLength })
const uuid = { type: 'string', format: 'uuid' }
const integer = { type: 'integer', minimum: 1 }
const boolean = { type: 'boolean' }
const timestamp = { anyOf: [{ type: 'string', format: 'date-time' }, { type: 'null' }] }
const draft = {
  type: { type: 'string', enum: MEMORY_TYPES },
  topic: string(L.topic),
  title: string(L.title),
  summary: string(L.summary),
  tags: { type: 'array', maxItems: L.tags, items: string(L.tag) },
  content: {
    ...string(L.bodyBytes),
    description: 'At most 16 KiB UTF-8 bytes. Full content; no truncation.'
  },
  source: {
    type: 'object',
    additionalProperties: false,
    required: ['kind', 'agent', 'description'],
    properties: {
      kind: {
        type: 'string',
        enum: ['user_statement', 'tool_result', 'document', 'agent_inference']
      },
      agent: string(L.agent),
      description: string(L.description),
      uri: string(L.uri),
      session_id: string(L.session)
    }
  },
  status: { type: 'string', enum: ['active', 'archived'] },
  pinned: boolean,
  expires_at: timestamp,
  occurred_at: timestamp
}
export function memoryInputSchema(method: MemoryMethod) {
  const methods = {
    search: {
      properties: {
        queries: { type: 'array', maxItems: L.queries, items: string(L.query) },
        type: draft.type,
        topic: draft.topic,
        tags: draft.tags,
        include_global: boolean,
        status: draft.status,
        include_expired: boolean,
        limit: { ...integer, maximum: L.searchLimit, default: 8 },
        cursor: string(L.cursor)
      },
      required: []
    },
    get: { properties: { id: uuid, revision: integer }, required: ['id'] },
    store: {
      properties: { ...draft, request_id: uuid, create_project: boolean },
      required: ['type', 'topic', 'title', 'summary', 'tags', 'content', 'source', 'request_id']
    },
    update: {
      properties: {
        id: uuid,
        expected_revision: integer,
        request_id: uuid,
        reason: string(L.reason),
        changes: {
          type: 'object',
          additionalProperties: false,
          minProperties: 1,
          properties: draft
        }
      },
      required: ['id', 'expected_revision', 'request_id', 'reason', 'changes']
    },
    forget: {
      properties: { id: uuid, expected_revision: integer, request_id: uuid },
      required: ['id', 'expected_revision', 'request_id']
    }
  }
  const spec = methods[method]
  return {
    type: 'object' as const,
    additionalProperties: false,
    properties: {
      scope: { type: 'string', enum: ['global', 'project'] },
      project_path: string(L.path),
      ...spec.properties
    },
    required: ['scope', ...spec.required],
    allOf: [
      {
        if: { properties: { scope: { const: 'project' } } },
        then: { required: ['project_path'] },
        else: {
          not: {
            anyOf: [
              { required: ['project_path'] },
              { required: ['include_global'] },
              { required: ['create_project'] }
            ]
          }
        }
      }
    ]
  }
}
