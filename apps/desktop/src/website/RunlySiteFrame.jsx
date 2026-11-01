import './runlySite.css'

/**
 * Wraps rendered site content (public page, template preview) so it gets the
 * runly theme bridge and the link/button interaction states from runlySite.css.
 */
export function RunlySiteFrame({ children }) {
  return <div className="runly-site">{children}</div>
}
