import React from 'react';
import { Bell, AlertTriangle, Clock, Volume2, Download, ChevronRight, Filter, MapPin } from 'lucide-react';

export default function IRPSMIntegration() {
    const alerts = [
        { id: 'ELE-2026-001', detection: 'Adult Elephant (High Confidence)', location: 'Zone A - Railway Crossing', time: '14:32', response: 'Sound Alert Triggered', status: 'Alert Active' },
        { id: 'ELE-2026-002', detection: 'Elephant Herd (3 detected)', location: 'Zone B - Forest Edge', time: '13:45', response: 'Forest Dept. Notified', status: 'Resolved' },
        { id: 'ELE-2026-003', detection: 'Juvenile Elephant', location: 'Zone C - Water Source', time: '12:20', response: 'Monitoring', status: 'Under Observation' },
        { id: 'ELE-2026-004', detection: 'Adult Elephant Pair', location: 'Zone A - Track Section 2', time: '11:05', response: 'Train Slowed', status: 'Resolved' },
        { id: 'ELE-2026-005', detection: 'Elephant Movement', location: 'Zone D - Corridor Exit', time: '09:30', response: 'Sound Alert Triggered', status: 'Resolved' },
    ];

    return (
        <div className="p-8 h-[calc(100vh-4.5rem)] overflow-y-auto bg-slate-50 text-slate-900 font-sans">

            {/* Header Section */}
            <div className="flex justify-between items-end mb-8 pb-6 border-b border-slate-200">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center">
                            <Bell className="w-6 h-6 text-emerald-700" />
                        </div>
                        <h2 className="text-2xl font-serif font-bold text-slate-800 tracking-tight">Alert Management System</h2>
                    </div>
                    <p className="text-slate-500 flex items-center gap-2 text-xs font-medium uppercase tracking-wide">
                        Wildlife Detection & Response • EleTrack AI
                        <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded text-[10px] font-bold uppercase tracking-wider border border-emerald-200">Live</span>
                    </p>
                </div>
                <div className="flex gap-3">
                    <button className="px-4 py-2 bg-white border border-slate-300 text-slate-600 rounded-md text-sm font-medium hover:bg-slate-50 hover:border-slate-400 shadow-sm transition-all flex items-center gap-2">
                        <Download className="w-4 h-4" /> Export Logs
                    </button>
                    <button className="px-4 py-2 bg-red-600 text-white rounded-md text-sm font-medium hover:bg-red-700 shadow-md transition-all shadow-red-200 flex items-center gap-2">
                        Manual Alert <Volume2 className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="bg-white p-6 rounded-xl shadow-[0_2px_10px_rgba(0,0,0,0.05)] border border-slate-100 border-l-4 border-l-emerald-600 group hover:-translate-y-1 transition-transform duration-300">
                    <div className="flex justify-between items-start mb-4">
                        <div className="bg-emerald-50 p-2.5 rounded-lg group-hover:bg-emerald-100 transition-colors">
                            <AlertTriangle className="w-6 h-6 text-emerald-700" />
                        </div>
                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full uppercase tracking-wide">Today</span>
                    </div>
                    <div className="text-3xl font-bold text-slate-800 mb-1 group-hover:text-emerald-800 transition-colors">24</div>
                    <div className="text-slate-500 text-sm font-medium">Total Detections Today</div>
                </div>

                <div className="bg-white p-6 rounded-xl shadow-[0_2px_10px_rgba(0,0,0,0.05)] border border-slate-100 border-l-4 border-l-blue-600 group hover:-translate-y-1 transition-transform duration-300">
                    <div className="flex justify-between items-start mb-4">
                        <div className="bg-blue-50 p-2.5 rounded-lg group-hover:bg-blue-100 transition-colors">
                            <Volume2 className="w-6 h-6 text-blue-700" />
                        </div>
                        <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-full uppercase tracking-wide">Triggered</span>
                    </div>
                    <div className="text-3xl font-bold text-slate-800 mb-1 group-hover:text-blue-800 transition-colors">18</div>
                    <div className="text-slate-500 text-sm font-medium">Sound Alerts Activated</div>
                </div>

                <div className="bg-white p-6 rounded-xl shadow-[0_2px_10px_rgba(0,0,0,0.05)] border border-slate-100 border-l-4 border-l-amber-500 group hover:-translate-y-1 transition-transform duration-300">
                    <div className="flex justify-between items-start mb-4">
                        <div className="bg-amber-50 p-2.5 rounded-lg group-hover:bg-amber-100 transition-colors">
                            <Clock className="w-6 h-6 text-amber-600" />
                        </div>
                        <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full uppercase tracking-wide">Active</span>
                    </div>
                    <div className="text-3xl font-bold text-slate-800 mb-1 group-hover:text-amber-800 transition-colors">2</div>
                    <div className="text-slate-500 text-sm font-medium">Active Monitoring Zones</div>
                </div>
            </div>

            {/* Main Data Table */}
            <div className="bg-white rounded-xl shadow-[0_2px_15px_rgba(0,0,0,0.04)] border border-slate-200 overflow-hidden">
                <div className="px-6 py-5 border-b border-slate-200 flex justify-between items-center bg-slate-50/50">
                    <h3 className="font-bold text-slate-800 flex items-center gap-2.5 text-lg">
                        <span className="relative flex h-3 w-3">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                        </span>
                        Recent Detection Events
                    </h3>
                    <div className="flex items-center gap-3">
                        <button className="p-2 hover:bg-slate-100 rounded text-slate-500 transition-colors">
                            <Filter className="w-4 h-4" />
                        </button>
                        <span className="text-xs text-slate-500 font-mono bg-slate-100 px-2 py-1 rounded border border-slate-200">Last Sync: 14:42 PM</span>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[11px] tracking-wider border-b border-slate-200">
                            <tr>
                                <th className="px-6 py-4">Event ID</th>
                                <th className="px-6 py-4">Detection</th>
                                <th className="px-6 py-4">Location</th>
                                <th className="px-6 py-4">Time</th>
                                <th className="px-6 py-4">Response</th>
                                <th className="px-6 py-4">Status</th>
                                <th className="px-6 py-4 text-center">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {alerts.map((alert) => (
                                <tr key={alert.id} className="hover:bg-emerald-50/30 transition-colors group">
                                    <td className="px-6 py-4 font-mono text-emerald-700 font-semibold text-xs bg-slate-50/30">{alert.id}</td>
                                    <td className="px-6 py-4 font-semibold text-slate-700">{alert.detection}</td>
                                    <td className="px-6 py-4 text-slate-500 group-hover:text-slate-700">
                                        <div className="flex items-center gap-1.5">
                                            <MapPin className="w-3.5 h-3.5 text-slate-400" />
                                            {alert.location}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-slate-700 font-mono font-medium">{alert.time}</td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-2 text-slate-600">
                                            <Volume2 className="w-3.5 h-3.5 text-slate-400" />
                                            {alert.response}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide border shadow-sm ${alert.status.includes('Resolved') ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                            alert.status.includes('Active') ? 'bg-red-50 text-red-700 border-red-200' :
                                                'bg-amber-50 text-amber-700 border-amber-200'
                                            }`}>
                                            {alert.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <button className="p-1.5 hover:bg-slate-100 text-slate-400 hover:text-emerald-600 rounded-full transition-colors">
                                            <ChevronRight className="w-4 h-4" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 text-xs text-slate-500 flex justify-between items-center">
                    <span className="font-medium">Showing 5 of 24 detection events today</span>
                    <div className="flex gap-2">
                        <button className="px-3 py-1.5 bg-white border border-slate-300 rounded shadow-sm hover:bg-slate-100 disabled:opacity-50 text-slate-600 font-medium transition-colors">Previous</button>
                        <button className="px-3 py-1.5 bg-white border border-slate-300 rounded shadow-sm hover:bg-slate-100 text-slate-600 font-medium transition-colors">Next</button>
                    </div>
                </div>
            </div>
        </div>
    );
}