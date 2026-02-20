import React, { useState } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import LiveMonitor from './components/LiveMonitor';
import IRPSMIntegration from './components/IRPSMIntegration';
import Login from './components/Login';
import CameraSelection from './components/CameraSelection';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [selectedCamera, setSelectedCamera] = useState(null);
  const [activeView, setActiveView] = useState('monitor');

  // Auto-login on mount
  React.useEffect(() => {
    const token = localStorage.getItem('eleTrackToken');
    const role = localStorage.getItem('eleTrackRole');
    if (token && role) {
      setIsAuthenticated(true);
      setCurrentUser(role);
    }
  }, []);

  const handleLoginSuccess = (userRole) => {
    setCurrentUser(userRole);
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    localStorage.removeItem('eleTrackToken');
    localStorage.removeItem('eleTrackRole');
    setIsAuthenticated(false);
    setCurrentUser(null);
    setSelectedCamera(null);
    setActiveView('monitor');
  };

  const handleCameraSelect = (cameraId) => {
    setSelectedCamera(cameraId);
  };

  if (!isAuthenticated) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  if (!selectedCamera) {
    return <CameraSelection onCameraSelect={handleCameraSelect} />;
  }

  return (
    <div className="flex h-screen bg-zinc-950 text-white overflow-hidden font-sans">
      <Sidebar activeView={activeView} setActiveView={setActiveView} />

      <div className="flex-1 flex flex-col ml-64 transition-all duration-300">
        <Header cameraId={selectedCamera} user={currentUser} onLogout={handleLogout} onSwitchCamera={() => setSelectedCamera(null)} />

        <main className="flex-1 overflow-hidden relative">
          <div className={`absolute inset-0 transition-opacity duration-300 ${activeView === 'monitor' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}>
            <LiveMonitor cameraId={selectedCamera} />
          </div>
          <div className={`absolute inset-0 transition-opacity duration-300 ${activeView === 'irpsm' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}>
            <IRPSMIntegration />
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;


