import { createWorldServer } from './http-server.mjs';

const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 8787);
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('PORT must be an integer between 0 and 65535.');
const server = createWorldServer({ dataFile: process.env.WORLD_DATA_FILE || undefined });
server.listen(port, host, () => {
  console.log(`Cổ Tiên Lộ shared world: http://${host}:${server.address().port}`);
});
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
server.on('worldError', error => { console.error(`World checkpoint failed: ${error.message}`); });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
