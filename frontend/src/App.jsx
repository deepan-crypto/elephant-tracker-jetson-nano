import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import LiveMonitor from './components/LiveMonitor';
import IRPSMIntegration from './components/IRPSMIntegration';
import Login from './components/Login';
import CameraSelection from './components/CameraSelection';
import RFMonitorPanel from './components/RFMonitorPanel';
import ThreatLevelIndicator from './components/ThreatLevelIndicator';
import CombinedEventTimeline from './components/CombinedEventTimeline';
import CriticalAlertPopup from './components/CriticalAlertPopup';

const API_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [selectedCamera, setSelectedCamera] = useState(null);
  const [activeView, setActiveView] = useState('monitor');
  const [socket, setSocket] = useState(null);
  const [threatState, setThreatState] = useState(null);
  const [token, setToken] = useState(null);

  // Auto-login on mount
  useEffect(() => {
    const t = localStorage.getItem('eleTrackToken');
    const role = localStorage.getItem('eleTrackRole');
    if (t && role) {
      setIsAuthenticated(true);
      setCurrentUser(role);
      setToken(t);
    }
  }, []);

  // Socket.io connection
  useEffect(() => {
    if (!isAuthenticated) return;
    const s = io(API_URL, { transports: ['websocket', 'polling'] });
    setSocket(s);

    // Listen for RF/threat updates globally (for CriticalAlertPopup)
    s.on('rf-update', (payload) => {
      if (payload.threat) setThreatState(payload.threat);
    });

    return () => s.disconnect();
  }, [isAuthenticated]);

  const handleLoginSuccess = (userRole, authToken) => {
    setCurrentUser(userRole);
    setIsAuthenticated(true);
    setToken(authToken || localStorage.getItem('eleTrackToken'));
  };

  const handleLogout = () => {
    localStorage.removeItem('eleTrackToken');
    localStorage.removeItem('eleTrackRole');
    setIsAuthenticated(false);
    setCurrentUser(null);
    setSelectedCamera(null);
    setActiveView('monitor');
    setSocket(prev => { prev?.disconnect(); return null; });
  };

  if (!isAuthenticated) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  if (!selectedCamera) {
    return <CameraSelection onCameraSelect={setSelectedCamera} />;
  }

  return (
    <div className="flex h-screen bg-zinc-950 text-white overflow-hidden font-sans">
      {/* Global Critical Alert Overlay */}
      <CriticalAlertPopup threat={threatState} />

      <Sidebar activeView={activeView} setActiveView={setActiveView} threatState={threatState} />

      <div className="flex-1 flex flex-col ml-64 transition-all duration-300">
        <Header
          cameraId={selectedCamera}
          user={currentUser}
          onLogout={handleLogout}
          onSwitchCamera={() => setSelectedCamera(null)}
          threatState={threatState}
        />

        <main className="flex-1 overflow-hidden relative">
          {/* Live Monitor */}
          <div className={`absolute inset-0 transition-opacity duration-300 ${activeView === 'monitor' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}>
            <LiveMonitor cameraId={selectedCamera} socket={socket} />
          </div>

          {/* Alert Management */}
          <div className={`absolute inset-0 transition-opacity duration-300 ${activeView === 'irpsm' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}>
            <IRPSMIntegration />
          </div>

          {/* RF Monitor View */}
          <div className={`absolute inset-0 transition-opacity duration-300 overflow-y-auto ${activeView === 'rf' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}>
            <div className="rf-view-layout">
              <ThreatLevelIndicator socket={socket} />
              <div className="rf-panels-row">
                <RFMonitorPanel socket={socket} />
                <CombinedEventTimeline socket={socket} token={token} />
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;
