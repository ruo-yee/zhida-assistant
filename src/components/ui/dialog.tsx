import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'

export function Dialog({
  open,
  onOpenChange,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: ReactNode
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      {children}
    </DialogPrimitive.Root>
  )
}

export function DialogContent({
  title,
  description,
  children,
  wide = false,
}: {
  title: string
  description: string
  children: ReactNode
  wide?: boolean
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="overlay" />
      <DialogPrimitive.Content className={wide ? 'sheet sheet-wide' : 'sheet'}>
        <div className="sheet-head">
          <DialogPrimitive.Title className="sheet-title">{title}</DialogPrimitive.Title>
          <DialogPrimitive.Close className="icon-btn" aria-label="关闭">
            <X size={16} />
          </DialogPrimitive.Close>
        </div>
        <DialogPrimitive.Description className="sheet-desc">{description}</DialogPrimitive.Description>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}
