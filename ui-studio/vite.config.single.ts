import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// 単一ファイル配布用ビルド。全チャンク・CSS・アセットを1バンドルに畳み込む。
// 生成物は scripts/inline-single.mjs で index.html にインライン化する。
export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    outDir: "dist-single",
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000, // 事実上すべてのアセットをdata URI化
    reportCompressedSize: false,
    modulePreload: { polyfill: false },
    rollupOptions: {
      output: {
        inlineDynamicImports: true, // React.lazy の分割を無効化して1JSに
        manualChunks: undefined,
        entryFileNames: "app.js",
        assetFileNames: "app.[ext]",
      },
    },
  },
});
