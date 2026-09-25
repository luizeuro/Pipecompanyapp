// Histórico de saldo (30 dias) por plataforma: linha fina, um eixo só (R$,
// começando em zero), legenda + rótulo direto no último ponto, e mira com
// tooltip ao passar o mouse. Cores por plataforma vêm de --series-meta/google.
import { useEffect, useMemo, useState } from 'react'
import { dateShort, dateTimeBR, money, moneyCompact } from '../lib/format.js'
import { PLATFORMS } from '../lib/constants.js'

const HEIGHT = 200
const PAD = { top: 14, right: 84, bottom: 26, left: 58 }
const COLOR = { meta: 'var(--series-meta)', google: 'var(--series-google)' }

// Largura real do container (o SVG é desenhado em pixels, sem esticar texto).
// Callback ref: se o elemento trocar (vazio → com dados), passa a medir o novo.
function useWidth() {
  const [node, setNode] = useState(null)
  const [width, setWidth] = useState(600)
  useEffect(() => {
    if (!node) return
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(280, entry.contentRect.width)))
    ro.observe(node)
    return () => ro.disconnect()
  }, [node])
  return [setNode, width]
}

export default function BalanceChart({ snapshots, currency = 'BRL' }) {
  const [wrapRef, width] = useWidth()
  const [hoverT, setHoverT] = useState(null)

  const series = useMemo(
    () =>
      ['meta', 'google']
        .map((platform) => ({
          platform,
          points: snapshots
            .filter((s) => s.platform === platform && s.ok && s.balance != null)
            .map((s) => ({ t: new Date(s.checked_at).getTime(), v: Number(s.balance), at: s.checked_at })),
        }))
        .filter((s) => s.points.length >= 2),
    [snapshots],
  )

  if (!series.length) {
    return (
      <div ref={wrapRef} className="muted flex h-[120px] items-center justify-center rounded-lg border border-dashed border-slate-300 text-sm dark:border-slate-700">
        O histórico de saldo aparece aqui depois de algumas verificações.
      </div>
    )
  }

  const all = series.flatMap((s) => s.points)
  const tMin = Math.min(...all.map((p) => p.t))
  const tMax = Math.max(...all.map((p) => p.t))
  const vMax = Math.max(...all.map((p) => p.v)) * 1.1 || 1
  const innerW = width - PAD.left - PAD.right
  const innerH = HEIGHT - PAD.top - PAD.bottom
  const x = (t) => PAD.left + (tMax === tMin ? innerW / 2 : ((t - tMin) / (tMax - tMin)) * innerW)
  const y = (v) => PAD.top + innerH - (v / vMax) * innerH
  const ticks = [0, 0.5, 1].map((f) => f * vMax)

  // Rótulos diretos no fim de cada linha, afastados se ficarem colados.
  const endLabels = series.map((s) => {
    const last = s.points[s.points.length - 1]
    return { platform: s.platform, value: last.v, x: x(last.t), y: y(last.v) }
  })
  if (endLabels.length === 2 && Math.abs(endLabels[0].y - endLabels[1].y) < 16) {
    const [a, b] = endLabels[0].y <= endLabels[1].y ? endLabels : [endLabels[1], endLabels[0]]
    a.y -= 8
    b.y += 8
  }

  // Ponto de cada série mais perto do tempo sob o mouse.
  const hovered =
    hoverT == null
      ? null
      : series.map((s) => ({
          platform: s.platform,
          point: s.points.reduce((best, p) => (Math.abs(p.t - hoverT) < Math.abs(best.t - hoverT) ? p : best)),
        }))
  const hoverX = hovered ? x(hovered[0].point.t) : null

  function onMove(e) {
    const rect = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - rect.left) / rect.width) * width
    const t = tMin + ((px - PAD.left) / innerW) * (tMax - tMin)
    setHoverT(Math.min(tMax, Math.max(tMin, t)))
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-4 text-xs text-brand-600 dark:text-slate-300">
        {series.map((s) => (
          <span key={s.platform} className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded-full" style={{ background: COLOR[s.platform] }} aria-hidden="true" />
            {PLATFORMS[s.platform].label}
          </span>
        ))}
      </div>
      <div ref={wrapRef} className="relative">
        <svg
          width={width}
          height={HEIGHT}
          viewBox={`0 0 ${width} ${HEIGHT}`}
          className="block touch-none select-none"
          role="img"
          aria-label={`Saldo nos últimos 30 dias: ${endLabels.map((l) => `${PLATFORMS[l.platform].label} ${money(l.value, currency)}`).join(', ')}`}
          onPointerMove={onMove}
          onPointerLeave={() => setHoverT(null)}
        >
          {ticks.map((v) => (
            <g key={v}>
              <line
                x1={PAD.left}
                x2={width - PAD.right}
                y1={y(v)}
                y2={y(v)}
                className="stroke-slate-200 dark:stroke-slate-800"
                strokeWidth="1"
              />
              <text x={PAD.left - 8} y={y(v)} dy="0.32em" textAnchor="end" className="fill-slate-400 text-[11px] tabular">
                {moneyCompact(v)}
              </text>
            </g>
          ))}
          {[tMin, (tMin + tMax) / 2, tMax].map((t, i) => (
            <text
              key={i}
              x={x(t)}
              y={HEIGHT - 6}
              textAnchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'}
              className="fill-slate-400 text-[11px]"
            >
              {dateShort(new Date(t).toISOString())}
            </text>
          ))}

          {series.map((s) => (
            <polyline
              key={s.platform}
              fill="none"
              stroke={COLOR[s.platform]}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
              points={s.points.map((p) => `${x(p.t)},${y(p.v)}`).join(' ')}
            />
          ))}

          {endLabels.map((l) => (
            <g key={l.platform}>
              <circle cx={l.x} cy={y(l.value)} r="3.5" fill={COLOR[l.platform]} className="stroke-white dark:stroke-slate-900" strokeWidth="2" />
              <text x={l.x + 8} y={l.y} dy="0.32em" className="fill-brand-700 text-[11px] font-semibold tabular dark:fill-slate-200">
                {moneyCompact(l.value)}
              </text>
            </g>
          ))}

          {hovered && (
            <g pointerEvents="none">
              <line
                x1={hoverX}
                x2={hoverX}
                y1={PAD.top}
                y2={PAD.top + innerH}
                className="stroke-slate-400 dark:stroke-slate-500"
                strokeWidth="1"
                strokeDasharray="3 3"
              />
              {hovered.map((h) => (
                <circle
                  key={h.platform}
                  cx={x(h.point.t)}
                  cy={y(h.point.v)}
                  r="5"
                  fill={COLOR[h.platform]}
                  className="stroke-white dark:stroke-slate-900"
                  strokeWidth="2"
                />
              ))}
            </g>
          )}
        </svg>

        {hovered && (
          <div
            className="pointer-events-none absolute top-1 z-10 min-w-[150px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg dark:border-slate-700 dark:bg-slate-950"
            style={hoverX > width / 2 ? { right: width - hoverX + 12 } : { left: hoverX + 12 }}
          >
            <div className="muted mb-1">{dateTimeBR(hovered[0].point.at)}</div>
            {hovered.map((h) => (
              <div key={h.platform} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-1.5 text-brand-600 dark:text-slate-300">
                  <span className="h-2 w-2 rounded-full" style={{ background: COLOR[h.platform] }} aria-hidden="true" />
                  {PLATFORMS[h.platform].short}
                </span>
                <span className="tabular font-semibold text-brand-800 dark:text-white">{money(h.point.v, currency)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <details className="mt-2 text-xs">
        <summary className="muted cursor-pointer select-none hover:text-brand-800 dark:hover:text-slate-200">Ver em tabela</summary>
        <div className="scroll-thin mt-2 max-h-56 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-800">
          <table className="w-full text-left">
            <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900">
              <tr>
                <th className="px-3 py-1.5 font-semibold">Verificação</th>
                <th className="px-3 py-1.5 font-semibold">Plataforma</th>
                <th className="px-3 py-1.5 text-right font-semibold">Saldo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {series
                .flatMap((s) => s.points.map((p) => ({ ...p, platform: s.platform })))
                .sort((a, b) => b.t - a.t)
                .map((p, i) => (
                  <tr key={i}>
                    <td className="px-3 py-1">{dateTimeBR(p.at)}</td>
                    <td className="px-3 py-1">{PLATFORMS[p.platform].short}</td>
                    <td className="tabular px-3 py-1 text-right">{money(p.v, currency)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  )
}
