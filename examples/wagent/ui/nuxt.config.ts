export default defineNuxtConfig({
  ssr: false,

  nitro: {
    prerender: {
      routes: ['/'],
    },
  },

  compatibilityDate: '2025-07-16',
})
