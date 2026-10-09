/// <reference types="vitest/config" />
import {defineConfig} from 'vite';

export default defineConfig({
  // Relative URLs: the Lumen host serves the package at http://127.0.0.1:<port>/.
  base: './',
  build: {
    // The Lumen host runs web apps in GeckoView (Firefox 156).
    target: ['firefox128', 'chrome120'],
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
