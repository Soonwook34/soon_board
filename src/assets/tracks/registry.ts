import type { AffineTransform } from '../../utils/trackTransform'
import transforms from './transforms.json'
import {
  AUSTIN_PATH,
  BAHRAIN_PATH,
  BAKU_PATH,
  CATALUNYA_PATH,
  HUNGARORING_PATH,
  IMOLA_PATH,
  INTERLAGOS_PATH,
  JEDDAH_PATH,
  LASVEGAS_PATH,
  LUSAIL_PATH,
  MELBOURNE_PATH,
  MEXICO_PATH,
  MIAMI_PATH,
  MONACO_PATH,
  MONTREAL_PATH,
  MONZA_PATH,
  SHANGHAI_PATH,
  SILVERSTONE_PATH,
  SINGAPORE_PATH,
  SPA_PATH,
  SPIELBERG_PATH,
  SUZUKA_PATH,
  YASMARINA_PATH,
  ZANDVOORT_PATH,
} from './paths.generated'

export const TRACK_VIEW_BOX = '0 0 1000 600'

export interface TrackRegistryEntry {
  circuitId: string
  displayName: string
  pathD: string
  transform: AffineTransform
  lengthM: number
}

const T = transforms as Record<string, AffineTransform>

// Static circuit metadata. Order/IDs mirror old_project so transforms.json
// keys line up. lengthM feeds the interpolator's teleport-snap threshold.
export const TRACK_REGISTRY: TrackRegistryEntry[] = [
  { circuitId: 'bahrain', displayName: 'Bahrain', transform: T.bahrain, lengthM: 5412, pathD: BAHRAIN_PATH },
  { circuitId: 'jeddah', displayName: 'Jeddah', transform: T.jeddah, lengthM: 6174, pathD: JEDDAH_PATH },
  { circuitId: 'melbourne', displayName: 'Melbourne', transform: T.melbourne, lengthM: 5278, pathD: MELBOURNE_PATH },
  { circuitId: 'suzuka', displayName: 'Suzuka', transform: T.suzuka, lengthM: 5807, pathD: SUZUKA_PATH },
  { circuitId: 'shanghai', displayName: 'Shanghai', transform: T.shanghai, lengthM: 5451, pathD: SHANGHAI_PATH },
  { circuitId: 'miami', displayName: 'Miami', transform: T.miami, lengthM: 5412, pathD: MIAMI_PATH },
  { circuitId: 'imola', displayName: 'Imola', transform: T.imola, lengthM: 4909, pathD: IMOLA_PATH },
  { circuitId: 'monaco', displayName: 'Monaco', transform: T.monaco, lengthM: 3337, pathD: MONACO_PATH },
  { circuitId: 'montreal', displayName: 'Montreal', transform: T.montreal, lengthM: 4361, pathD: MONTREAL_PATH },
  { circuitId: 'catalunya', displayName: 'Catalunya', transform: T.catalunya, lengthM: 4675, pathD: CATALUNYA_PATH },
  { circuitId: 'spielberg', displayName: 'Spielberg', transform: T.spielberg, lengthM: 4318, pathD: SPIELBERG_PATH },
  { circuitId: 'silverstone', displayName: 'Silverstone', transform: T.silverstone, lengthM: 5891, pathD: SILVERSTONE_PATH },
  { circuitId: 'hungaroring', displayName: 'Hungaroring', transform: T.hungaroring, lengthM: 4381, pathD: HUNGARORING_PATH },
  { circuitId: 'spa', displayName: 'Spa-Francorchamps', transform: T.spa, lengthM: 7004, pathD: SPA_PATH },
  { circuitId: 'zandvoort', displayName: 'Zandvoort', transform: T.zandvoort, lengthM: 4259, pathD: ZANDVOORT_PATH },
  { circuitId: 'monza', displayName: 'Monza', transform: T.monza, lengthM: 5793, pathD: MONZA_PATH },
  { circuitId: 'baku', displayName: 'Baku', transform: T.baku, lengthM: 6003, pathD: BAKU_PATH },
  { circuitId: 'singapore', displayName: 'Marina Bay', transform: T.singapore, lengthM: 4940, pathD: SINGAPORE_PATH },
  { circuitId: 'austin', displayName: 'Austin (COTA)', transform: T.austin, lengthM: 5513, pathD: AUSTIN_PATH },
  { circuitId: 'mexico', displayName: 'Mexico City', transform: T.mexico, lengthM: 4304, pathD: MEXICO_PATH },
  { circuitId: 'interlagos', displayName: 'Interlagos', transform: T.interlagos, lengthM: 4309, pathD: INTERLAGOS_PATH },
  { circuitId: 'lasvegas', displayName: 'Las Vegas', transform: T.lasvegas, lengthM: 6201, pathD: LASVEGAS_PATH },
  { circuitId: 'lusail', displayName: 'Lusail', transform: T.lusail, lengthM: 5419, pathD: LUSAIL_PATH },
  { circuitId: 'yasmarina', displayName: 'Yas Marina', transform: T.yasmarina, lengthM: 5281, pathD: YASMARINA_PATH },
]

export function getTrackByCircuitId(circuitId: string): TrackRegistryEntry | null {
  return TRACK_REGISTRY.find((t) => t.circuitId === circuitId) ?? null
}

// Map an OpenF1 `circuit_short_name` (case-insensitive, varied formatting)
// to our internal circuitId. Unknown names return null so the caller can fall
// back to substrate-driven rendering.
const NAME_TO_ID: Array<[RegExp, string]> = [
  [/sakhir|bahrain/, 'bahrain'],
  [/jeddah/, 'jeddah'],
  [/melbourne|albert/, 'melbourne'],
  [/suzuka/, 'suzuka'],
  [/shanghai/, 'shanghai'],
  [/miami/, 'miami'],
  [/imola/, 'imola'],
  [/monaco|montecarlo|monte\s*carlo/, 'monaco'],
  [/montreal|gilles/, 'montreal'],
  [/catalunya|barcelona/, 'catalunya'],
  [/spielberg|red\s*bull\s*ring|austria/, 'spielberg'],
  [/silverstone/, 'silverstone'],
  [/hungaroring|budapest/, 'hungaroring'],
  [/spa/, 'spa'],
  [/zandvoort/, 'zandvoort'],
  [/monza/, 'monza'],
  [/baku/, 'baku'],
  [/marina\s*bay|singapore/, 'singapore'],
  [/austin|cota/, 'austin'],
  [/mexico/, 'mexico'],
  [/interlagos|s[aã]o\s*paulo|paulo/, 'interlagos'],
  [/las\s*vegas|vegas/, 'lasvegas'],
  [/lusail|qatar/, 'lusail'],
  [/yas\s*marina|abu\s*dhabi/, 'yasmarina'],
]

export function resolveCircuitId(openf1Name: string | undefined): string | null {
  if (!openf1Name) return null
  const norm = openf1Name.toLowerCase()
  for (const [re, id] of NAME_TO_ID) {
    if (re.test(norm)) return id
  }
  return null
}
