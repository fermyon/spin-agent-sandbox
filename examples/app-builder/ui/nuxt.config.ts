export default defineNuxtConfig({
  ssr: false,

  // Devtools are not needed for this static UI, and skipping them keeps its git tooling
  // (simple-git, overridden in package.json for an advisory) out of every build.
  devtools: { enabled: false },

  nitro: {
    prerender: {
      routes: ['/'],
    },
  },

  compatibilityDate: '2025-07-16',
})
