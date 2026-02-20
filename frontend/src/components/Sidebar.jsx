import React from 'react';
import { LayoutDashboard, FileText, Activity } from 'lucide-react';
import logo from '../assets/logo.png';

export default function Sidebar({ activeView, setActiveView }) {
    return (
        <div className="w-64 bg-zinc-950 border-r border-zinc-800 flex flex-col h-screen fixed left-0 top-0 z-10 text-zinc-100 shadow-xl shadow-black/50">
            <div className="p-6 border-b border-zinc-800 flex items-center gap-3 bg-zinc-950/50 backdrop-blur-sm">
                <div className="w-12 h-12 bg-white rounded-lg p-1.5 shadow-md">
                    <img src={logo} alt="Indian Forest Service Logo" className="w-full h-full object-contain" />
                </div>
                <div>
                    <h1 className="font-bold text-lg tracking-tight bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">EleTrack AI</h1>
                    <p className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest">Wildlife Safety</p>
                </div>
            </div>

            <nav className="flex-1 p-4 space-y-2 font-sans">
                <button
                    onClick={() => setActiveView('monitor')}
                    className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-lg transition-all duration-300 group relative overflow-hidden ${activeView === 'monitor'
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.1)]'
                        : 'text-zinc-400 hover:bg-zinc-900 hover:text-white border border-transparent hover:border-zinc-800'
                        }`}
                >
                    {activeView === 'monitor' && (
                        <div className="absolute left-0 top-0 h-full w-1 bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
                    )}
                    <Activity className={`w-5 h-5 transition-transform group-hover:scale-110 ${activeView === 'monitor' ? 'animate-pulse' : ''}`} />
                    <span className="font-medium tracking-wide">Live AI Monitor</span>
                </button>

                <button
                    onClick={() => setActiveView('irpsm')}
                    className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-lg transition-all duration-300 group relative overflow-hidden ${activeView === 'irpsm'
                        ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.1)]'
                        : 'text-zinc-400 hover:bg-zinc-900 hover:text-white border border-transparent hover:border-zinc-800'
                        }`}
                >
                    {activeView === 'irpsm' && (
                        <div className="absolute left-0 top-0 h-full w-1 bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]" />
                    )}
                    <FileText className="w-5 h-5 transition-transform group-hover:scale-110" />
                    <span className="font-medium tracking-wide">Alert Management</span>
                </button>
            </nav>

            <div className="p-4 border-t border-zinc-800 bg-zinc-950/50 backdrop-blur-sm">
                <div className="bg-zinc-900/50 p-3 rounded-lg border border-zinc-800 group hover:border-zinc-700 transition-colors">
                    <p className="text-[10px] text-zinc-500 mb-2 uppercase tracking-wider font-bold">System Status</p>
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping absolute opacity-75" />
                            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 relative shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                        </div>
                        <span className="text-sm font-medium text-emerald-400 group-hover:text-emerald-300 transition-colors">Operational</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
