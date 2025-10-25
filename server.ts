import { setupSocket } from '@/lib/socket';
import { createServer } from 'http';
import { Server } from 'socket.io';
import next from 'next';

const dev = process.env.NODE_ENV !== 'production';
const currentPort = parseInt(process.env.PORT || '3000', 10);
const hostname = '0.0.0.0';

async function createCustomServer() {
  try {
    const nextApp = next({ 
      dev,
      dir: process.cwd(),
      turbo: !dev,
    });

    await nextApp.prepare();
    const handle = nextApp.getRequestHandler();

    const server = createServer((req, res) => {
      if (req.url?.startsWith('/api/socketio')) {
        return;
      }
      
      res.setTimeout(310000, () => {
        console.log('Request timeout');
        res.writeHead(408);
        res.end('Request Timeout');
      });

      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('X-XSS-Protection', '1; mode=block');
      handle(req, res);
    });

    const io = new Server(server, {
      path: '/api/socketio',
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      },
      transports: ['websocket', 'polling'],
      pingTimeout: 30000,
      pingInterval: 25000,
    });

    setupSocket(io);

    server.listen(currentPort, hostname, () => {
      console.log(`Ready on http://${hostname}:${currentPort}`);
    });

  } catch (err) {
    console.error('Server startup error:', err);
    process.exit(1);
  }
}

createCustomServer();
