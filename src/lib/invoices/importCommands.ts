import { readImportFile, readImportPdf } from '../../bridge/platformBridge'
import { retainBytes, validateAssetBytes } from './assets'
import { applyImport, parseImportDocument, planImport, type ImportDocument, type ImportPlan } from './importFormat'
import type { InvoiceRepository } from './repository'

/** Where the import comes from: a file the person chose, or the document itself (pasted, or handed over by the agent). */
export type ImportSource = { path: string } | { document: unknown }

export interface ImportPreview { plan: ImportPlan | null; problems: ImportPlan['problems']; document: ImportDocument | null; source: ImportSource }

async function readSource(source: ImportSource): Promise<unknown> {
  if ('path' in source) return readImportFile(source.path)
  return source.document
}

export function createImportCommands(repository: InvoiceRepository) {
  return {
    /** Parse and plan without touching anything: the rows, the clients, the counter after, every problem. */
    async previewInvoiceImport(args: { source: ImportSource; skipConflicts?: boolean }): Promise<ImportPreview> {
      const store = await repository.current()
      const parsed = parseImportDocument(await readSource(args.source))
      if (!parsed.document) return { plan: null, problems: parsed.problems, document: null, source: args.source }
      const plan = planImport(store, parsed.document, { skipConflicts: args.skipConflicts })
      return { plan, problems: plan.problems, document: parsed.document, source: args.source }
    },
    /**
     * Retain the original PDFs, then register every invoice, its client and
     * its marks in one guarded write. Nothing already issued changes.
     */
    async importInvoices(args: { source: ImportSource; skipConflicts?: boolean }) {
      const preview = await this.previewInvoiceImport(args)
      if (!preview.plan || !preview.document) throw new Error(preview.problems.map(problem => `${problem.where}: ${problem.message}`).join('\n') || 'The file could not be read.')
      if (!preview.plan.ok) throw new Error(['The import has problems:', ...preview.plan.problems.map(problem => `${problem.where}: ${problem.message}`), ...preview.plan.rows.flatMap(row => row.errors.map(error => `#${row.number}: ${error}`))].join('\n'))
      const pdfAssets: Record<string, string> = {}
      const skipped: string[] = []
      if ('path' in args.source) {
        const base = args.source.path.slice(0, args.source.path.lastIndexOf('/') + 1)
        for (const row of preview.plan.rows) {
          if (!row.pdf || row.conflict || row.errors.length) continue
          try {
            const file = await readImportPdf(base + row.pdf)
            await validateAssetBytes(file.base64, 'application/pdf')
            const asset = await retainBytes(repository, row.pdf.split('/').pop() ?? `invoice-${row.number}.pdf`, 'application/pdf', file.base64)
            pdfAssets[row.pdf] = asset.id
          } catch (error) {
            console.error('Import PDF not retained', row.pdf, error)
            skipped.push(row.pdf)
          }
        }
      } else skipped.push(...preview.plan.rows.filter(row => row.pdf).map(row => row.pdf!))
      const document = preview.document, plan = preview.plan
      const store = await repository.guardedTransact(current => applyImport(current, { document, plan: planImport(current, document, { skipConflicts: args.skipConflicts }), pdfAssets }))
      const imported = plan.rows.filter(row => !row.conflict && !row.errors.length)
      return { imported: imported.length, conflictsSkipped: plan.counts.conflicts, clientsCreated: plan.clients.creating, clientsLinked: plan.clients.linking,
        pdfsRetained: Object.keys(pdfAssets).length, pdfsSkipped: skipped, nextCounter: store.sequence.nextNumber, numberFormat: store.sequence.format?.pattern ?? null,
        labels: imported.map(row => row.label), saveStatus: 'saved' as const }
    },
  }
}
