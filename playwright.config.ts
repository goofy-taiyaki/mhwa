import {defineConfig} from '@playwright/test';
const port=process.env.MHWA_PORT??'4173';
export default defineConfig({testDir:'./e2e',workers:1,use:{baseURL:'http://127.0.0.1:'+port,viewport:{width:1600,height:1200}},webServer:{command:'npm run preview -- --port '+port+' --strictPort',url:'http://127.0.0.1:'+port}});
