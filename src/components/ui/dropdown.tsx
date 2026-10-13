import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import type { ReactNode } from 'react'

export function Menu({ children }: { children: ReactNode }) {
  return <DropdownMenu.Root>{children}</DropdownMenu.Root>
}

export function MenuTrigger({ children }: { children: ReactNode }) {
  return <DropdownMenu.Trigger asChild>{children}</DropdownMenu.Trigger>
}

export function MenuContent({ children, className = 'menu' }: { children: ReactNode; className?: string }) {
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.Content className={className} align="end" sideOffset={6}>
        {children}
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  )
}

export function MenuItem({ children, onSelect }: { children: ReactNode; onSelect?: () => void }) {
  return (
    <DropdownMenu.Item
      className="menu-item"
      onSelect={() => {
        onSelect?.()
      }}
    >
      {children}
    </DropdownMenu.Item>
  )
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <DropdownMenu.Label className="menu-label">{children}</DropdownMenu.Label>
}

export function MenuSeparator() {
  return <DropdownMenu.Separator className="menu-sep" />
}
