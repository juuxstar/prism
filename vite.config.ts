import vue              from '@vitejs/plugin-vue';
import { resolve }      from 'path';
import { defineConfig } from 'vite';

const devOrigin = process.env.VITE_DEV_ORIGIN;

export default defineConfig({
	root  : resolve(__dirname, 'src/client'),
	build : {
		outDir      : resolve(__dirname, 'dist'),
		emptyOutDir : true,
	},
	plugins : [ vue() ],
	resolve : {
		alias : { '@' : resolve(__dirname, 'src/client') },
	},
	server : {
		host       : '0.0.0.0',
		port       : 5173,
		strictPort : true,
		...(devOrigin ? { origin : devOrigin } : {}),
	},
});
