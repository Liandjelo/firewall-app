const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');

let mainWindow;
let server = null;
let allowedIPs = new Set(['127.0.0.1', '::1']);

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    backgroundColor: '#0f172a',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    autoHideMenuBar: true
  });

  // Load the main UI
  const indexPath = path.join(__dirname, 'index.html');
  mainWindow.loadFile(indexPath).catch(err => {
    console.error('Failed to load index.html:', err);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// --------------- REAL SERVER ---------------------

function startServer(port) {
  if (server) {
    console.log('Server already running');
    return;
  }

  server = http.createServer((req, res) => {
    console.log(`📨 Request received: ${req.method} ${req.url}`);
    
    let clientIP = req.socket.remoteAddress;
    console.log(`🔍 Raw IP: ${clientIP}`);

    if (clientIP && clientIP.includes('::ffff:')) {
      clientIP = clientIP.split('::ffff:')[1];
    }

    console.log(`✓ Normalized IP: ${clientIP}`);
    const isAllowed = allowedIPs.has(clientIP);
    console.log(`🔐 Is Allowed: ${isAllowed}`);

    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('log-entry', {
        type: isAllowed ? 'success' : 'blocked',
        message: `Connection from ${clientIP || 'Unknown'}`
      });
    }
    console.log("running");
    if (isAllowed) {
      const filePath = path.join(__dirname, 'server_index.html');
      console.log(`📂 Looking for file at: ${filePath}`);

      fs.stat(filePath, (statErr) => {
        if (statErr) {
          console.error(`❌ File not found: ${filePath}`);
          console.error(statErr);
        }
      });

      fs.readFile(filePath, 'utf8', (err, content) => {
        if (err) {
          console.error(`❌ Error reading file:`, err);
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end(`Server Error: ${err.message}`);
        } else {
          console.log(`✅ File served successfully (${content.length} bytes)`);
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(content);
        }
      });
    } else {
      console.log(`🚫 Access denied for IP: ${clientIP}`);
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Access Denied: NetGuard Firewall Blocked Connection.');
    }
  });

  server.on('error', (err) => {
    console.error('❌ Server error:', err);
  });

  server.listen(port, '0.0.0.0', () => {
    console.log(`\n✅ SERVER STARTED ON PORT ${port}`);
    console.log(`📍 Access at: http://localhost:${port}`);
    console.log(`🔐 Allowed IPs: ${Array.from(allowedIPs).join(', ')}\n`);
  });
}

function stopServer() {
  if (server) {
    server.close(() => {
      console.log('Server stopped');
      server = null;
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('server-status', { running: false });
      }
    });
  }
}

// --------------- IPC ---------------------

ipcMain.on('toggle-server', (event, { running, port }) => {
  if (running) {
    startServer(port || 8080);
  } else {
    stopServer();
  }
});

ipcMain.on('update-allowlist', (event, newIPList) => {
  allowedIPs = new Set(newIPList);
  allowedIPs.add('127.0.0.1');
  allowedIPs.add('::1');
  console.log('Allowlist updated:', Array.from(allowedIPs));
});

// --------------- APP EVENTS ---------------------

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  stopServer();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
