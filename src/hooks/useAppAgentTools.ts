import { useMemo } from 'react'
import {
  usePlatformAgentTools,
  type AgentToolHandler,
} from '@purescience/platform-ui/bridge/react/usePlatformAgentTools'
import { APP_AGENT_LOG_LABEL, APP_AGENT_TOOL_NAMES } from '../agents/catalog'
import { appAgentHandlers } from '../agents/handlers'
import { buildPureInvoicingHandlers } from '../agents/operationsRegistry'
import { invoiceRepository } from '../lib/invoices/workspace'

/**
 * Registers PureInvoicing's exposed operations (8 composite `fn_*` functions,
 * 14 core atomic tools, and 3 universal escape-hatch meta-tools providing full
 * on-demand access to the remaining 57 extended specialist tools) with the shell.
 */
export function useAppAgentTools(ready: boolean): void {
  const registryHandlers = useMemo(
    () =>
      buildPureInvoicingHandlers(() => ({
        repository: invoiceRepository,
        atomicHandlers: appAgentHandlers,
      })),
    [],
  )

  // Statically key-preserving registration so `scripts/check-manifests.mjs`
  // can verify every manifest tool has a live registered handler at build time.
  const handlers = useMemo(
    () =>
      Object.fromEntries(
        APP_AGENT_TOOL_NAMES.map(name => [
          name,
          async (invoke: Parameters<AgentToolHandler>[0]) =>
            registryHandlers[name]!(invoke),
        ]),
      ),
    [registryHandlers],
  )

  usePlatformAgentTools({
    ready,
    tools: APP_AGENT_TOOL_NAMES,
    logLabel: APP_AGENT_LOG_LABEL,
    handlers,
  })
}
