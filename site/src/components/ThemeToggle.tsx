import { useEffect, useState } from 'react'

type Theme = 'light' | 'dark'

const systemDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches

/** The theme on screen: the viewer's saved choice (set on <html> by index.html), else the system's. */
function currentTheme(): Theme {
  const chosen = document.documentElement.dataset.theme
  if (chosen === 'light' || chosen === 'dark') return chosen
  return systemDark() ? 'dark' : 'light'
}

/** Sun/moon button that flips the site between light and dark and remembers the choice. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(currentTheme)

  // Without a saved choice the site follows the system, also when it changes while open.
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => setTheme(currentTheme())
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  const next: Theme = theme === 'dark' ? 'light' : 'dark'
  const toggle = () => {
    document.documentElement.dataset.theme = next
    try {
      localStorage.setItem('theme', next)
    } catch {
      // Private mode or storage off: the switch still works for this visit.
    }
    setTheme(next)
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="ml-auto self-center rounded-sm p-1 text-ink-2 hover:bg-paper-2 hover:text-ink"
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {theme === 'dark' ? (
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </>
        ) : (
          <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
        )}
      </svg>
    </button>
  )
}
