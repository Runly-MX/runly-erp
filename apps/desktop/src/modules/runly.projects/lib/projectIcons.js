import { FolderKanban } from 'lucide-react'
import { resolveLucideIcon } from '@runly/ui'

// Projects store the lucide name chosen in the icon library (kebab-case); older ones hold
// the PascalCase names of the first icon set. Both resolve; unknown or empty ones fall back.
export function getProjectIcon(iconName) {
  return resolveLucideIcon(iconName) ?? FolderKanban
}
