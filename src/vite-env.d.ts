/// <reference types="vite/client" />

declare module '*.ttf?url' {
  const url: string
  export default url
}

declare module '*.woff2?url' {
  const url: string
  export default url
}
