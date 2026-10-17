import clsx from 'clsx'

interface StatCardProps {
  label: string
  value: number | string
  sub?: string
  color?: 'green' | 'red' | 'amber' | 'blue' | 'indigo' | 'default'
  icon?: string
}

const colorMap = {
  green: 'text-green border-green/20 bg-green/5',
  red: 'text-red border-red/20 bg-red/5',
  amber: 'text-amber border-amber/20 bg-amber/5',
  blue: 'text-blue border-blue/20 bg-blue/5',
  indigo: 'text-indigo border-indigo/20 bg-indigo/5',
  default: 'text-slate-300 border-border bg-bg-tertiary/30',
}

export default function StatCard({ label, value, sub, color = 'default', icon }: StatCardProps) {
  return (
    <div className={clsx(
      'rounded-xl border p-4 transition-all hover:scale-[1.01]',
      'bg-bg-secondary',
      colorMap[color],
    )}>
      <div className="flex items-start justify-between mb-2">
        <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">{label}</span>
        {icon && <span className="text-base opacity-60">{icon}</span>}
      </div>
      <div className="font-mono text-2xl font-bold">{value}</div>
      {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
    </div>
  )
}
