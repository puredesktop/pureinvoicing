/**
 * How what the app shows is named to the suite's activity layer
 * (AgentActivityLayer, in AppFrame): when an agent tool reads or changes an
 * item, the layer marks every element whose `data-agent-ref` holds a ref the
 * call names. A call names each short string argument plainly and as
 * `argument:value`, and each number only as `argument:value`; a read also
 * names the ids in its answer. So an item carries its id plainly and once for
 * every argument name the tools use for it (`invoiceId:…`, `draftId:…`).
 * Markup only: nothing here changes what the app does.
 */

type Ref = string | number | null | undefined | false

export interface AgentRefProps {
  'data-agent-ref': string
  'data-agent-label': string
}

/** An id plainly and as `key:id` for each argument name; nothing when there is no id. */
export function refsFor(id: Ref, ...keys: string[]): string[] {
  if (id === null || id === undefined || id === false || id === '') return []
  return [...(typeof id === 'string' ? [id] : []), ...keys.map(key => `${key}:${id}`)]
}

/** The props to spread on an element: its refs, space-separated, and the name shown beside the mark. */
export function agentRefs(label: string, ...refs: (string | string[])[]): AgentRefProps {
  const unique = [...new Set(refs.flat().filter(ref => ref && !/\s/.test(ref)))]
  return { 'data-agent-ref': unique.join(' '), 'data-agent-label': label }
}

/**
 * An invoice, a draft or a correction: the id is `invoiceId` to the read and
 * mark tools, `draftId` to the draft tools (a draft keeps its id when it is
 * issued) and `sourceInvoiceId` when copied; its open correction answers to
 * `draftId` too.
 */
export const invoiceRefs = (id: Ref, correctionId?: Ref): string[] => [
  ...refsFor(id, 'invoiceId', 'draftId', 'sourceInvoiceId'),
  ...refsFor(correctionId, 'draftId'),
]
export const versionRefs = (id: Ref): string[] => refsFor(id, 'versionId', 'sourceVersionId')
export const clientRefs = (id: Ref): string[] => refsFor(id, 'clientId')
export const contractorRefs = (id: Ref): string[] => refsFor(id, 'contractorId')
/** An agreement is `agreementId`, and `parentId` to the SOWs and change orders made under it. */
export const agreementRefs = (id: Ref): string[] => refsFor(id, 'agreementId', 'parentId')
/** A proposal is `proposalId` to every proposal tool; each of its versions is `versionId`. */
export const proposalRefs = (id: Ref): string[] => refsFor(id, 'proposalId')
export const templateRefs = (id: Ref): string[] => refsFor(id, 'templateId')
/** A library document (listLibrary, readLibraryDocument, updateLibraryDocument, removeLibraryDocument). */
export const libraryRefs = (id: Ref): string[] => refsFor(id, 'documentId')
/** A document linked by path to a client, invoice, agreement or contractor (linkDocument, unlinkDocument). */
export const linkedDocumentRefs = (id: Ref, path?: Ref): string[] => [...refsFor(id, 'documentId'), ...refsFor(path, 'path')]
export const noteRefs = (id: Ref): string[] => refsFor(id, 'noteId')
export const sectionRefs = (id: Ref): string[] => refsFor(id, 'sectionId')
export const milestoneRefs = (id: Ref, period?: Ref): string[] => [...refsFor(id, 'milestoneId'), ...refsFor(period, 'period')]
export const billRefs = (id: Ref): string[] => refsFor(id, 'billId')
/** A template section: editTemplateSection takes `index`, counted from 0. */
export const templateSectionRefs = (index: number): string[] => [`index:${index}`]
