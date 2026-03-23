import { defineConfig } from "@vite-pwa/assets-generator/config"

export default defineConfig({
  headLinkOptions: {
    basePath: "/icons/",
    preset: "2023",
  },
  images: ["static/icons/app-icon.svg"],
  manifestIconsEntry: false,
  preset: {
    transparent: {
      sizes: [192, 512],
      favicons: [[48, "favicon.ico"]],
    },
    maskable: {
      sizes: [192, 512],
      padding: 0.2,
    },
    apple: {
      sizes: [180],
    },
    assetName(type, size) {
      switch (type) {
        case "transparent":
          return `pwa-${size.width}.png`
        case "maskable":
          return `maskable-${size.width}.png`
        case "apple":
          return size.width === 180 ? "apple-touch-icon.png" : `apple-touch-icon-${size.width}.png`
      }
    },
  },
})
