import { useEffect, useRef, type ReactNode } from 'react'

// A native modal <dialog>: focus trapping, Escape and the top layer come free.
// "sheet" rises from the bottom on a phone and centres on wider screens; "drawer"
// slides in from the right.
export function Panel({
  open,
  onClose,
  variant,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  variant: 'sheet' | 'drawer'
  title: string
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      className={`panel ${variant}`}
      aria-label={title}
      // React propagates these native, non-bubbling events through the
      // component tree, so only react when this exact dialog fired them.
      onClose={(e) => e.target === e.currentTarget && onClose()}
      // The dialog element itself is only hit on the backdrop; its content sits
      // in .panel-body, which covers the whole box.
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {open && (
        <div className="panel-body">
          <div className="panel-header">
            <h2>{title}</h2>
            <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
              ✕
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  )
}
