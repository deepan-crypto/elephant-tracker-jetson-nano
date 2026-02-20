import React, { useState } from 'react';
import { Camera, ChevronRight, Video, Radio, Signal, LayoutGrid, Info, Phone, Globe, Mail, Github, Code, ShieldCheck, Search } from 'lucide-react';
import { railwayContacts, contactCategories } from '../data/contacts';
import logo from '../assets/logo.png';

export default function CameraSelection({ onCameraSelect }) {
    const [activeTab, setActiveTab] = useState('cameras');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('All');

    const filteredContacts = railwayContacts.filter(contact => {
        const matchesSearch =
            contact.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            contact.designation.toLowerCase().includes(searchQuery.toLowerCase()) ||
            contact.contact.includes(searchQuery);

        const matchesCategory = selectedCategory === 'All' || contact.category === selectedCategory;

        return matchesSearch && matchesCategory;
    });

    const cameras = [
        { id: 'CAM_01', location: 'Railway Crossing Point A', status: 'LIVE', signal: 92, type: 'Main Feed' },
        { id: 'CAM_02', location: 'Forest Edge - Section B', status: 'LIVE', signal: 88, type: 'Thermal' },
        { id: 'CAM_03', location: 'Water Source - Zone C', status: 'LIVE', signal: 87, type: 'Thermal' },
        { id: 'CAM_04', location: 'Corridor Exit Point', status: 'OFFLINE', signal: 0, type: 'Backup' },
    ];



    return (
        <div className="min-h-screen bg-zinc-950 flex font-sans relative overflow-hidden text-white">
            {/* Background Elements */}
            <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:50px_50px] [mask-image:radial-gradient(ellipse_at_center,black_40%,transparent_100%)]"></div>

            {/* Sidebar */}
            <div className="w-64 bg-zinc-900/80 backdrop-blur-md border-r border-zinc-800 flex flex-col z-20">
                <div className="p-6 border-b border-zinc-800">
                    <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-3">
                        <div className="w-10 h-10 bg-white rounded-lg p-1 shadow-md">
                            <img src={logo} alt="Indian Forest Service Logo" className="w-full h-full object-contain" />
                        </div>
                        EleTrack AI
                    </h2>
                    <p className="text-zinc-500 text-xs mt-1 ml-14">Wildlife Safety Portal</p>
                </div>

                <nav className="flex-1 p-4 space-y-2">
                    <button
                        onClick={() => setActiveTab('cameras')}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all text-sm font-medium ${activeTab === 'cameras' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'}`}
                    >
                        <LayoutGrid className="w-4 h-4" />
                        Live Feed Selection
                    </button>
                    <button
                        onClick={() => setActiveTab('about')}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all text-sm font-medium ${activeTab === 'about' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'}`}
                    >
                        <Info className="w-4 h-4" />
                        About Project
                    </button>
                    <button
                        onClick={() => setActiveTab('contacts')}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all text-sm font-medium ${activeTab === 'contacts' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'}`}
                    >
                        <Phone className="w-4 h-4" />
                        Emergency Contacts
                    </button>
                </nav>

                <div className="p-4 border-t border-zinc-800 text-xs text-zinc-600 text-center">
                    v2.4.0 • System Secure
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 overflow-y-auto p-10 z-10 relative">

                {/* Cameras View */}
                {activeTab === 'cameras' && (
                    <div className="max-w-5xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="mb-8">
                            <h1 className="text-3xl font-bold mb-2">Select Video Source</h1>
                            <p className="text-zinc-400">Choose a connected camera feed to initialize the main dashboard.</p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {cameras.map((cam) => (
                                <button
                                    key={cam.id}
                                    onClick={() => cam.status === 'LIVE' && onCameraSelect(cam.id)}
                                    disabled={cam.status !== 'LIVE'}
                                    className={`group relative overflow-hidden rounded-xl border transition-all duration-300 text-left ${cam.status === 'LIVE'
                                        ? 'bg-zinc-900 border-zinc-800 hover:border-emerald-500/50 hover:shadow-[0_0_20px_rgba(16,185,129,0.1)] cursor-pointer'
                                        : 'bg-zinc-900/50 border-zinc-800/50 opacity-60 cursor-not-allowed'
                                        }`}
                                >
                                    <div className="aspect-video bg-black/50 relative flex items-center justify-center overflow-hidden">
                                        <div className="absolute inset-0 opacity-20 bg-[url('https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center grayscale group-hover:grayscale-0 transition-all duration-500 scale-100 group-hover:scale-110"></div>

                                        <Video className={`w-12 h-12 ${cam.status === 'LIVE' ? 'text-zinc-600 group-hover:text-white' : 'text-zinc-700'} transition-colors relative z-10`} />

                                        {cam.status === 'LIVE' && (
                                            <div className="absolute top-3 left-3 flex items-center gap-2 z-20">
                                                <span className="flex h-2 w-2 relative">
                                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                                                </span>
                                                <span className="bg-black/60 text-white text-[10px] font-bold px-2 py-0.5 rounded backdrop-blur-sm">LIVE</span>
                                            </div>
                                        )}
                                    </div>

                                    <div className="p-5">
                                        <div className="flex justify-between items-start mb-2">
                                            <div>
                                                <h3 className="text-white font-bold text-lg group-hover:text-emerald-400 transition-colors">{cam.id}</h3>
                                                <p className="text-zinc-400 text-sm">{cam.location}</p>
                                            </div>
                                            <div className="flex flex-col items-end">
                                                <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${cam.status === 'LIVE'
                                                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                                    : 'bg-red-500/10 text-red-400 border-red-500/20'
                                                    }`}>
                                                    {cam.status}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-between mt-4 border-t border-zinc-800 pt-3">
                                            <div className="flex items-center gap-2 text-xs text-zinc-500">
                                                <Signal className="w-3 h-3" />
                                                <span>Signal: {cam.signal}%</span>
                                            </div>
                                            {cam.status === 'LIVE' && (
                                                <div className="bg-zinc-800 p-1.5 rounded-full text-zinc-400 group-hover:bg-emerald-500 group-hover:text-white transition-all transform group-hover:translate-x-1">
                                                    <ChevronRight className="w-4 h-4" />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* About View */}
                {activeTab === 'about' && (
                    <div className="max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="mb-8 border-b border-zinc-800 pb-6">
                            <h1 className="text-3xl font-bold mb-2 text-indigo-400">About EleTrack AI</h1>
                            <p className="text-zinc-400 text-lg">AI-Powered Elephant Detection & Railway Safety System</p>
                        </div>

                        <div className="space-y-8">
                            <div className="bg-zinc-900/50 border border-zinc-800 p-6 rounded-xl">
                                <h3 className="text-xl font-bold mb-4 text-white">Project Overview</h3>
                                <p className="text-zinc-400 leading-relaxed">
                                    EleTrack AI is a real-time elephant detection and warning system that uses YOLOv5 and edge AI to prevent elephant-train collisions.
                                    The system analyzes live video streams from edge devices to accurately detect elephants near railway tracks.
                                    When an elephant is detected, it automatically triggers sound alerts to scare the animals away, protecting both wildlife and railway operations.
                                </p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div className="bg-zinc-900/50 border border-zinc-800 p-5 rounded-xl">
                                    <div className="w-10 h-10 bg-emerald-500/20 text-emerald-400 rounded-lg flex items-center justify-center mb-4">
                                        <Video className="w-6 h-6" />
                                    </div>
                                    <h4 className="font-bold mb-2">Real-Time Detection</h4>
                                    <p className="text-sm text-zinc-500">Detects elephants in real-time using deep learning with YOLOv5 on edge devices.</p>
                                </div>
                                <div className="bg-zinc-900/50 border border-zinc-800 p-5 rounded-xl">
                                    <div className="w-10 h-10 bg-indigo-500/20 text-indigo-400 rounded-lg flex items-center justify-center mb-4">
                                        <Signal className="w-6 h-6" />
                                    </div>
                                    <h4 className="font-bold mb-2">Sound Alert System</h4>
                                    <p className="text-sm text-zinc-500">Triggers warning sounds to repel elephants from railway tracks when detected.</p>
                                </div>
                                <div className="bg-zinc-900/50 border border-zinc-800 p-5 rounded-xl">
                                    <div className="w-10 h-10 bg-blue-500/20 text-blue-400 rounded-lg flex items-center justify-center mb-4">
                                        <Globe className="w-6 h-6" />
                                    </div>
                                    <h4 className="font-bold mb-2">Wildlife Conservation</h4>
                                    <p className="text-sm text-zinc-500">Uses AI and IoT for smart wildlife conservation and railway safety applications.</p>
                                </div>
                            </div>

                            <div className="bg-zinc-900/50 border border-zinc-800 p-6 rounded-xl mt-6">
                                <h3 className="text-xl font-bold mb-4 text-white flex items-center gap-2">
                                    <Code className="w-5 h-5 text-indigo-400" />
                                    Lead Developers
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <a href="https://github.com/prabu411" target="_blank" rel="noopener noreferrer"
                                        className="flex items-center gap-4 p-4 bg-zinc-900 border border-zinc-800 rounded-lg hover:border-indigo-500/50 hover:bg-zinc-800 transition-all group">
                                        <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center group-hover:bg-indigo-500/20 group-hover:text-indigo-400 transition-colors">
                                            <Github className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <div className="font-bold text-zinc-200 group-hover:text-indigo-300">Prabu</div>
                                            <div className="text-xs text-zinc-500">@prabu411</div>
                                        </div>
                                    </a>
                                    <a href="https://github.com/deepan-crypto" target="_blank" rel="noopener noreferrer"
                                        className="flex items-center gap-4 p-4 bg-zinc-900 border border-zinc-800 rounded-lg hover:border-indigo-500/50 hover:bg-zinc-800 transition-all group">
                                        <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center group-hover:bg-indigo-500/20 group-hover:text-indigo-400 transition-colors">
                                            <Github className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <div className="font-bold text-zinc-200 group-hover:text-indigo-300">Deepan</div>
                                            <div className="text-xs text-zinc-500">@deepan-crypto</div>
                                        </div>
                                    </a>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Contacts View */}
                {activeTab === 'contacts' && (
                    <div className="max-w-6xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500 h-full flex flex-col">
                        <div className="mb-6 border-b border-zinc-800 pb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div>
                                <h1 className="text-3xl font-bold mb-2 text-blue-400">Emergency & Wildlife Contacts</h1>
                                <p className="text-zinc-400">Directory of Forest & Wildlife Officials</p>
                            </div>

                            {/* Search & Filter Controls */}
                            <div className="flex flex-col sm:flex-row gap-3">
                                <div className="relative">
                                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                                    <input
                                        type="text"
                                        placeholder="Search name, role, or number..."
                                        className="bg-zinc-900 border border-zinc-700 text-zinc-200 pl-10 pr-4 py-2 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 w-full sm:w-64"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                    />
                                </div>
                                <select
                                    className="bg-zinc-900 border border-zinc-700 text-zinc-200 px-4 py-2 rounded-lg focus:outline-none focus:border-blue-500 cursor-pointer"
                                    value={selectedCategory}
                                    onChange={(e) => setSelectedCategory(e.target.value)}
                                >
                                    {contactCategories.map(cat => (
                                        <option key={cat} value={cat}>{cat}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-xl flex flex-col min-h-0">
                            <div className="grid grid-cols-12 bg-zinc-800/80 p-4 font-bold text-xs uppercase text-zinc-500 tracking-wider sticky top-0 z-10 backdrop-blur-md border-b border-zinc-700">
                                <div className="col-span-3">Division / Department</div>
                                <div className="col-span-3">Designation</div>
                                <div className="col-span-3">Official Name</div>
                                <div className="col-span-3">Contact Number</div>
                            </div>
                            <div className="overflow-y-auto custom-scrollbar flex-1 p-2 space-y-1">
                                {filteredContacts.length > 0 ? (
                                    filteredContacts.map((item, idx) => (
                                        <div key={idx} className="grid grid-cols-12 p-3 hover:bg-zinc-800/40 transition-colors items-center text-sm rounded border border-transparent hover:border-zinc-800/50 group">
                                            <div className="col-span-3 font-medium text-emerald-400 truncate pr-2" title={item.category}>{item.category}</div>
                                            <div className="col-span-3 text-zinc-300 flex items-center gap-2 truncate pr-2" title={item.designation}>
                                                <ShieldCheck className="w-3.5 h-3.5 text-zinc-600 group-hover:text-emerald-500 transition-colors shrink-0" />
                                                {item.designation}
                                            </div>
                                            <div className="col-span-3 text-zinc-400 font-mono truncate pr-2" title={item.name}>
                                                {item.name}
                                            </div>
                                            <div className="col-span-3 text-blue-400 font-mono flex items-center gap-2 truncate" title={item.contact}>
                                                <Phone className="w-3.5 h-3.5 shrink-0" />
                                                {item.contact}
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="p-8 text-center text-zinc-500 italic">
                                        No contacts found matching your search.
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="mt-4 p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-start gap-3 shrink-0">
                            <Info className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
                            <div>
                                <h4 className="text-amber-500 font-bold text-sm mb-1">Wildlife Emergency Helpline</h4>
                                <p className="text-zinc-400 text-xs">For immediate assistance regarding elephant sightings or wildlife emergencies, please dial <span className="text-white font-bold">1926</span> (Forest Helpline) available 24/7 across all states.</p>
                            </div>
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
}
