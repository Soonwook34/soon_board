// Registers the Formula1 typeface family via the FontFace API.
// Uses Vite's `?url` ESM imports so the TTFs are hashed and resolvable in
// production builds (raw `/src/assets/fonts/…` URLs don't survive `vite build`).
//
// Orbit (Google Fonts) is loaded via @import in global.css for Korean / non-Latin
// fallback. Formula1 → Orbit → system-ui font stack lives in tailwind config.

import formula1Regular from '../assets/fonts/Formula1-Regular-1.ttf?url'
import formula1Italic from '../assets/fonts/Formula1-Italic.ttf?url'
import formula1Bold from '../assets/fonts/Formula1-Bold_web.ttf?url'
import formula1Black from '../assets/fonts/Formula1-Black.ttf?url'
import formula1Wide from '../assets/fonts/Formula1-Wide.ttf?url'

type FaceSpec = readonly [
  family: string,
  url: string,
  descriptors: FontFaceDescriptors,
]

const FACES: readonly FaceSpec[] = [
  ['Formula1', formula1Regular, { weight: '400', style: 'normal', display: 'swap' }],
  ['Formula1', formula1Italic,  { weight: '400', style: 'italic', display: 'swap' }],
  ['Formula1', formula1Bold,    { weight: '700', style: 'normal', display: 'swap' }],
  ['Formula1', formula1Black,   { weight: '900', style: 'normal', display: 'swap' }],
  ['Formula1 Wide', formula1Wide, { weight: '400', style: 'normal', display: 'swap' }],
]

export function registerAppFonts(): void {
  if (typeof document === 'undefined' || !('fonts' in document)) return
  for (const [family, url, descriptors] of FACES) {
    const face = new FontFace(family, `url(${url})`, descriptors)
    face
      .load()
      .then((loaded) => {
        document.fonts.add(loaded)
      })
      .catch(() => {
        /* font-display: swap handles the fallback — no need to surface */
      })
  }
}
