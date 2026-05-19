/// <reference types="vite/client" />
import { useEffect, useRef } from 'react'
import type { Meeting, Session } from '../../api/types'
import { useSessionStore } from '../../store/sessionStore'
import { fitAffine } from '../../utils/coordinates'
import { computeBbox } from '../../utils/fitting'

// Eagerly load all circuit SVGs as raw strings
const svgModules = import.meta.glob('../../assets/circuits/*.svg', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

// circuits.json maps circuit keys to metadata
import circuitsJson from '../../assets/circuits/circuits.json'


interface Props {
  session: Session
  substrateSamples: { t: number; x: number; y: number }[]
}

const N_SAMPLE = 80
const RESIDUAL_THRESHOLD_PCT = 0.05

/** Extract the first path d="..." from an SVG string */
function extractPathD(svgStr: string): string | null {
  const m = /<path[^>]*d="([^"]+)"/.exec(svgStr)
  return m ? m[1] : null
}

/** Sample N evenly-spaced points along an SVG path using a hidden DOM element */
function samplePath(d: string, n: number): [number, number][] {
  // Create an off-screen SVG to use getPointAtLength
  const svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svgEl.style.position = 'absolute'
  svgEl.style.visibility = 'hidden'
  svgEl.style.width = '0'
  svgEl.style.height = '0'
  const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  pathEl.setAttribute('d', d)
  svgEl.appendChild(pathEl)
  document.body.appendChild(svgEl)

  const total = pathEl.getTotalLength()
  const pts: [number, number][] = []
  for (let i = 0; i < n; i++) {
    const frac = i / (n - 1)
    const pt = pathEl.getPointAtLength(frac * total)
    pts.push([pt.x, pt.y])
  }

  document.body.removeChild(svgEl)
  return pts
}

// Map OpenF1 country_name values to ISO 3166-1 alpha-2 codes used in circuits.json
const COUNTRY_TO_CODE: Record<string, string> = {
  'United Arab Emirates': 'ae',
  Argentina: 'ar',
  Austria: 'at',
  Australia: 'au',
  Azerbaijan: 'az',
  Belgium: 'be',
  Bahrain: 'bh',
  Brazil: 'br',
  Canada: 'ca',
  China: 'cn',
  Germany: 'de',
  Spain: 'es',
  France: 'fr',
  'United Kingdom': 'gb',
  Hungary: 'hu',
  Italy: 'it',
  Japan: 'jp',
  Monaco: 'mc',
  Mexico: 'mx',
  Malaysia: 'my',
  Netherlands: 'nl',
  Portugal: 'pt',
  Qatar: 'qa',
  Russia: 'ru',
  'Saudi Arabia': 'sa',
  Singapore: 'sg',
  Turkey: 'tr',
  'United States': 'us',
  'South Africa': 'za',
}

/** Find the most recent circuit key for the meeting's country */
function findCircuitKey(meeting: Meeting | null): string | null {
  if (!meeting) return null

  const code = COUNTRY_TO_CODE[meeting.country_name]
  if (!code) return null

  const candidates = Object.keys(circuitsJson).filter((k) => k.startsWith(code + '-'))
  if (candidates.length === 0) return null

  // Pick the most recent (highest year number)
  candidates.sort()
  return candidates[candidates.length - 1]
}

export function DecorationLayer({ session, substrateSamples }: Props) {
  const layerRef = useRef<SVGGElement>(null)
  const setDecoration = useSessionStore((s) => s.setDecoration)
  const meeting = useSessionStore((s) => s.meeting)

  useEffect(() => {
    const circuitKey = findCircuitKey(meeting)

    if (!circuitKey) {
      setDecoration(false, null)
      if (layerRef.current) {
        layerRef.current.setAttribute('data-decoration-state', 'unaligned')
      }
      return
    }

    const modulePath = `../../assets/circuits/${circuitKey}.svg`
    const svgStr = svgModules[modulePath]
    if (!svgStr) {
      setDecoration(false, null)
      if (layerRef.current) {
        layerRef.current.setAttribute('data-decoration-state', 'unaligned')
      }
      return
    }

    const d = extractPathD(svgStr)
    if (!d) {
      setDecoration(false, null)
      if (layerRef.current) {
        layerRef.current.setAttribute('data-decoration-state', 'unaligned')
      }
      return
    }

    // Sample decoration path
    const decorPts = samplePath(d, N_SAMPLE)

    // Sample substrate evenly
    if (substrateSamples.length < 2) {
      setDecoration(false, null)
      if (layerRef.current) {
        layerRef.current.setAttribute('data-decoration-state', 'unaligned')
      }
      return
    }

    const step = (substrateSamples.length - 1) / (N_SAMPLE - 1)
    const subPts: [number, number][] = Array.from({ length: N_SAMPLE }, (_, i) => {
      const s = substrateSamples[Math.round(i * step)]
      return [s.x, s.y]
    })

    // Fit affine: decoration → substrate
    let fit
    try {
      fit = fitAffine(decorPts, subPts)
    } catch {
      setDecoration(false, null)
      if (layerRef.current) {
        layerRef.current.setAttribute('data-decoration-state', 'unaligned')
      }
      return
    }

    // Compute threshold based on substrate bbox diagonal
    const subBbox = computeBbox(subPts)
    const diagW = subBbox.maxX - subBbox.minX
    const diagH = subBbox.maxY - subBbox.minY
    const diagonal = Math.sqrt(diagW * diagW + diagH * diagH)
    const threshold = diagonal * RESIDUAL_THRESHOLD_PCT

    const aligned = fit.residual < threshold
    setDecoration(aligned, aligned ? fit.affine : null)
    if (layerRef.current) {
      layerRef.current.setAttribute(
        'data-decoration-state',
        aligned ? 'aligned' : 'unaligned',
      )
    }
  }, [meeting, session, substrateSamples, setDecoration])

  // When no circuit key is found, render nothing but keep the g element for tests
  return <g ref={layerRef} data-decoration-state="unaligned" />
}
