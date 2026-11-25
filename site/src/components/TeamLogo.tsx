import { teamLogo } from '../lib/data.ts'

const BOX = {
  /** Table rows, bracket slots and lists: next to 13-14 px text. */
  sm: 'h-4 w-5',
  /** The Swiss bracket, where the logo sits next to a short name. */
  md: 'h-5 w-6',
  /** The team panel heading. */
  lg: 'h-8 w-10',
}

/**
 * A team's logo in a fixed box, so names line up whether a logo is wide, tall or missing (an empty
 * box then). Decorative: the team's name always sits next to it, so the image has no alt text.
 */
export function TeamLogo(props: { teamId: string; size?: keyof typeof BOX; className?: string }) {
  const { teamId, size = 'sm', className = '' } = props
  const logo = teamLogo(teamId)
  const img = (src: string, themeClass = '') => (
    <img
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      className={`max-h-full max-w-full object-contain ${themeClass}`}
    />
  )
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center ${BOX[size]} ${className}`}
      aria-hidden="true"
    >
      {logo && img(logo.light, logo.dark ? 'logo-light' : '')}
      {logo?.dark && img(logo.dark, 'logo-dark')}
    </span>
  )
}
