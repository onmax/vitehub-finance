import { ConfirmModal } from "#components"

export interface ConfirmOptions {
  title: string
  description?: string
  confirmLabel?: string
  destructive?: boolean
  /** A checkbox inside the dialog ("Keep the accounts"); its value comes back as `checked`. */
  checkbox?: { label: string; description?: string; default?: boolean }
}

/** An AlertDialog-style confirm. Resolves `{ confirmed, checked }`. */
export function useConfirm() {
  const overlay = useOverlay()
  const modal = overlay.create(ConfirmModal, { destroyOnClose: true })
  return async (options: ConfirmOptions) => {
    const result = (await modal.open(options).result) as { confirmed: boolean; checked: boolean } | boolean | undefined
    if (typeof result === "object" && result) return result
    return { confirmed: Boolean(result), checked: false }
  }
}
