import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';

export default defineConfig({
  site: 'https://callegariedias.com.br',
  output: 'server',
  adapter: vercel(),
  server: {
    host: true
  }
});
