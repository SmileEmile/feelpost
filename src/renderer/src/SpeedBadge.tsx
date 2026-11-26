import { rateSpeed } from './speed-rating'

export default function SpeedBadge({ ms }: { ms: number }): JSX.Element {
  const rating = rateSpeed(ms)
  return (
    <span
      className={`speed-badge speed-${rating.key} tone-${rating.tone}`}
      title={`本次耗时 ${ms}ms · ${rating.label}（${rating.range}）\n等级：≤100ms 快如火箭 · ≤300ms 快如飞机 · ≤800ms 轻快如兔 · ≤1500ms 稳如乌龟 · ≤3000ms 慢如蜗牛 · >3000ms 比蜗牛还慢`}
    >
      <span className="speed-icon">{rating.icon}</span>
      <span>{rating.label}</span>
    </span>
  )
}
