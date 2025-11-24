
import React, { useState, useEffect } from 'react';
import { AppView, AvatarProfile } from './types';
import AvatarCreator from './components/AvatarCreator';
import AvatarChat from './components/AvatarChat';
import LiveSession from './components/LiveSession';
import { Bot, Zap, Plus, MessageSquare } from 'lucide-react';

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<AppView>(AppView.CREATE);
  const [profile, setProfile] = useState<AvatarProfile | null>(null);

  // If no profile exists, force create view
  useEffect(() => {
    if (!profile) setCurrentView(AppView.CREATE);
  }, [profile]);

  const handleProfileCreated = (newProfile: AvatarProfile) => {
    setProfile(newProfile);
    setCurrentView(AppView.CHAT);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col md:flex-row">
      {/* Sidebar Navigation */}
      <nav className="w-full md:w-20 bg-slate-900 border-b md:border-b-0 md:border-r border-slate-800 flex md:flex-col items-center justify-center md:justify-start py-4 gap-6 z-20">
        <div className="p-3 bg-indigo-600 rounded-xl shadow-lg shadow-indigo-500/20 mb-0 md:mb-6">
          <Bot className="text-white" size={24} />
        </div>
        
        <button 
          onClick={() => setCurrentView(AppView.CREATE)}
          className={`p-3 rounded-xl transition-all ${currentView === AppView.CREATE ? 'bg-slate-800 text-purple-400' : 'text-slate-500 hover:text-slate-300'}`}
          title="New Avatar"
        >
          <Plus size={24} />
        </button>

        <button 
          onClick={() => profile && setCurrentView(AppView.CHAT)}
          disabled={!profile}
          className={`p-3 rounded-xl transition-all ${currentView === AppView.CHAT ? 'bg-slate-800 text-purple-400' : 'text-slate-500 hover:text-slate-300'} disabled:opacity-30`}
          title="Chat"
        >
          <MessageSquare size={24} />
        </button>

        <button 
          onClick={() => profile && setCurrentView(AppView.LIVE)}
          disabled={!profile}
          className={`p-3 rounded-xl transition-all ${currentView === AppView.LIVE ? 'bg-slate-800 text-green-400' : 'text-slate-500 hover:text-slate-300'} disabled:opacity-30`}
          title="Live Call"
        >
          <Zap size={24} />
        </button>

        {/* Spacer to push bottom items down on desktop */}
        <div className="hidden md:block md:flex-1" />
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 p-4 md:p-8 overflow-hidden relative">
        <div className="max-w-4xl mx-auto h-full">
            <header className="mb-8">
                <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-purple-400">
                    {currentView === AppView.CREATE && "Create Persona"}
                    {currentView === AppView.CHAT && "Conversation"}
                    {currentView === AppView.LIVE && "Live Interface"}
                </h1>
                <p className="text-slate-400 mt-2">
                    {currentView === AppView.CREATE && "Bring a photo to life with memory and voice."}
                    {currentView === AppView.CHAT && "Text or speak to your avatar. It responds with voice and video."}
                    {currentView === AppView.LIVE && "Real-time, low-latency voice conversation powered by Gemini Live API."}
                </p>
            </header>

            <div className="h-[calc(100vh-180px)]">
                {currentView === AppView.CREATE && (
                    <AvatarCreator onProfileCreated={handleProfileCreated} />
                )}
                
                {currentView === AppView.CHAT && profile && (
                    <AvatarChat profile={profile} />
                )}

                {currentView === AppView.LIVE && profile && (
                    <LiveSession 
                        profile={profile} 
                        onEndSession={() => setCurrentView(AppView.CHAT)} 
                    />
                )}
            </div>
        </div>
      </main>
    </div>
  );
};

export default App;
