import {
  createAppOperationsRegistry,
  defineAppTool,
  type AppAtomicToolDefinition,
} from '@purescience/platform-ui/bridge/appFunctions'
import type { AgentToolHandler } from '@purescience/platform-ui/bridge/react/usePlatformAgentTools'
import { PUREINVOICING_ATOMIC_TOOL_SCHEMAS } from './atomicToolSchemas'
import type { InvoicingAgentToolContext } from './catalog'
import { PUREINVOICING_FUNCTIONS } from './functions'

const atomicTools: AppAtomicToolDefinition<InvoicingAgentToolContext>[] =
  PUREINVOICING_ATOMIC_TOOL_SCHEMAS.map(schema =>
    defineAppTool<InvoicingAgentToolContext>({
      ...schema,
      run: async (ctx, args, invoke) => {
        const handler = ctx.atomicHandlers[schema.name]
        if (!handler) {
          throw new Error(`Missing atomic tool handler for "${schema.name}".`)
        }
        return handler({
          ...invoke,
          shortName: schema.name,
          arguments: args,
        })
      },
    }),
  )

/**
 * PureInvoicing's unified Operations Registry built on `@purescience/platform-ui/bridge/appFunctions`:
 *   - 8 composite `function` workflows (`fn_*`, always exposed)
 *   - 14 core atomic tools (~20% of 71, always exposed)
 *   - 3 universal escape-hatch meta-tools (always exposed)
 *   - 57 extended specialist atomic tools (hidden by default, 100% reachable on demand)
 */
export const PUREINVOICING_OPERATIONS_REGISTRY =
  createAppOperationsRegistry<InvoicingAgentToolContext>({
    appSlug: 'invoicing',
    appName: 'PureInvoicing',
    functions: PUREINVOICING_FUNCTIONS,
    tools: atomicTools,
  })

export function buildPureInvoicingHandlers(
  getCtx: () => InvoicingAgentToolContext,
): Record<string, AgentToolHandler> {
  return PUREINVOICING_OPERATIONS_REGISTRY.buildHandlers(getCtx)
}
