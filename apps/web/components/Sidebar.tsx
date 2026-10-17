'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import clsx from 'clsx'

const nav = [
  { href: '/', label: 'Dashboard', icon: '▦' },
  { href: '/trade-calls', label: 'Trade Calls', icon: '↗' },
  { href: '/review', label: 'Review Queue', icon: '⊞' },
  { href: '/tester', label: 'Signal Tester', icon: '⌾' },
]

export default function Sidebar() {
  const path = usePathname()
  return (
    <aside className="fixed left-0 top-0 h-full w-[240px] bg-bg-secondary border-r border-border flex flex-col z-30">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 h-16 border-b border-border">
        <div className="w-8 h-8 rounded-lg bg-indigo/20 border border-indigo/30 flex items-center justify-center text-indigo font-bold text-sm">
          C
        </div>
        <div>
          <div className="font-semibold text-sm text-white">CAI</div>
          <div className="text-[10px] text-slate-500 leading-none mt-0.5">Signal Intelligence</div>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="status-dot live" />
          <span className="text-[10px] text-green">Live</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-0.5">
        {nav.map(({ href, label, icon }) => {
          const active = href === '/' ? path === '/' : path.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150',
                active
                  ? 'bg-indigo/15 text-indigo border border-indigo/20'
                  : 'text-slate-400 hover:bg-bg-tertiary hover:text-slate-200'
              )}
            >
              <span className="text-base w-5 text-center">{icon}</span>
              <span className="font-medium">{label}</span>
              {href === '/review' && (
                <span className="ml-auto bg-amber/20 text-amber text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                  •
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-border">
        <div className="text-[10px] text-slate-600 space-y-1">
          <div className="flex justify-between">
            <span>Connector</span>
            <span className="text-green">:3002</span>
          </div>
          <div className="flex justify-between">
            <span>Parser</span>
            <span className="text-green">:3003</span>
          </div>
          <div className="flex justify-between">
            <span>Trade Calls</span>
            <span className="text-green">:3004</span>
          </div>
        </div>
      </div>
    </aside>
  )
}
