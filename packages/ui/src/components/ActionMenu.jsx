import { MoreHorizontal } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './DropdownMenu.jsx'
import { Button } from './Button.jsx'
import { cn } from '../lib/utils.js'

export function ActionMenu({ items = [], label = 'Acciones' }) {
  const normalItems = items.filter((i) => i.variant !== 'destructive')
  const destructiveItems = items.filter((i) => i.variant === 'destructive')

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={label}>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-52">
        {normalItems.map((item, index) => {
          const Icon = item.icon
          return (
            <DropdownMenuItem
              key={index}
              onClick={item.onClick}
              disabled={item.disabled}
              className="cursor-pointer gap-2"
            >
              {Icon && <Icon className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />}
              {item.label}
            </DropdownMenuItem>
          )
        })}

        {destructiveItems.length > 0 && normalItems.length > 0 && (
          <DropdownMenuSeparator />
        )}

        {destructiveItems.map((item, index) => {
          const Icon = item.icon
          return (
            <DropdownMenuItem
              key={`d-${index}`}
              onClick={item.onClick}
              disabled={item.disabled}
              className={cn('cursor-pointer gap-2 text-destructive focus:text-destructive')}
            >
              {Icon && <Icon className="h-4 w-4" />}
              {item.label}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
