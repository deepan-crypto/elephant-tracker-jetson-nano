import React from 'react';
import { FileText, Activity, Radio } from 'lucide-react';
import logo from '../assets/logo.png';

const THREAT_COLORS = {
    SAFE: { text: 'text-emerald-400', dot: 'bg-emerald-500', ring: 'border-emerald-500/20', bg: 'bg-emerald-500/10' },
    WILDLIFE_ALERT: { text: 'text-amber-400', dot: 'bg-amber-500', ring: 'border-amber-500/20', bg: 'bg-amber-500/10' },
    HUMAN_INTRUSION: { text: 'text-orange-400', dot: 'bg-orange-500', ring: 'border-orange-500/20', bg: 'bg-orange-500/10' },
    CRITICAL_ALERT: { text: 'text-red-400', dot: 'bg-red-500', ring: 'border-red-500/20', bg: 'bg-red-500/10' },
};

function NavButton({ isActive, onClick, icon: Icon, label, activeColor = 'emerald', pulse = false }) {
    const colorMap = {
        emerald: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
        blue: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
        violet: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
    };
    const barMap = { emerald: 'bg-emerald-500', blue: 'bg-blue-500', violet: 'bg-violet-500' };
    return (
        <button
            onClick={onClick}
            className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-lg transition-all duration-300 group relative overflow-hidden ${isActive
                    ? `${colorMap[activeColor]} border shadow-[0_0_15px_rgba(0,0,0,0.2)]`
                    : 'text-zinc-400 hover:bg-zinc-900 hover:text-white border border-transparent hover:border-zinc-800'
                }`}
        >
            {isActive && <div className={`absolute left-0 top-0 h-full w-1 ${barMap[activeColor]}`} />}
            <Icon className={`w-5 h-5 transition-transform group-hover:scale-110 ${isActive && pulse ? 'animate-pulse' : ''}`} />
            <span className="font-medium tracking-wide">{label}</span>
        </button>
    );
}

export default function Sidebar({ activeView, setActiveView, threatState }) {
    const level = threatState?.threat_level || 'SAFE';
    const tcfg = THREAT_COLORS[level] || THREAT_COLORS.SAFE;
    const isCrit = level === 'CRITICAL_ALERT';

    return (
        <div className="w-64 bg-zinc-950 border-r border-zinc-800 flex flex-col h-screen fixed left-0 top-0 z-10 text-zinc-100 shadow-xl shadow-black/50">
            {/* Logo */}
            <div className="p-6 border-b border-zinc-800 flex items-center gap-3 bg-zinc-950/50 backdrop-blur-sm">
                <div className="w-12 h-12 bg-white rounded-lg p-1.5 shadow-md">
                    <img src={logo} alt="Indian Forest Service Logo" className="w-full h-full object-contain" />
                </div>
                <div>
                    <h1 className="font-bold text-lg tracking-tight bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">EleTrack AI</h1>
                    <p className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest">Hybrid Surveillance</p>
                </div>
            </div>

            {/* Nav */}
            <nav className="flex-1 p-4 space-y-2 font-sans">
                <NavButton isActive={activeView === 'monitor'} onClick={() => setActiveView('monitor')} icon={Activity} label="Live AI Monitor" activeColor="emerald" pulse />
                <NavButton isActive={activeView === 'irpsm'} onClick={() => setActiveView('irpsm')} icon={FileText} label="Alert Management" activeColor="blue" />
                <NavButton isActive={activeView === 'rf'} onClick={() => setActiveView('rf')} icon={Radio} label="RF Monitor" activeColor="violet" />
            </nav>

            {/* System Status */}
            <div className="p-4 border-t border-zinc-800 bg-zinc-950/50 backdrop-blur-sm space-y-2">
                {/* Threat Level badge */}
                <div className={`p-3 rounded-lg border ${tcfg.ring} ${tcfg.bg} transition-all duration-500 ${isCrit ? 'animate-pulse' : ''}`}>
                    <p className="text-[10px] text-zinc-500 mb-1.5 uppercase tracking-wider font-bold">Threat Level</p>
                    <div className="flex items-center gap-2">
                        <div className={`w-2.5 h-2.5 rounded-full ${tcfg.dot} ${isCrit ? 'animate-ping' : ''}`} />
                        <span className={`text-sm font-semibold ${tcfg.text}`}>{level.replace(/_/g, ' ')}</span>
                    </div>
                </div>

                {/* System online dot */}
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
