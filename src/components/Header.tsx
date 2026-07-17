import React from 'react';
import { ArrowLeft, Zap } from 'lucide-react';

interface HeaderProps {
  currentView: 'main' | 'ui-design';
  setCurrentView: (view: 'main' | 'ui-design') => void;
}

const Header: React.FC<HeaderProps> = ({ currentView, setCurrentView }) => {
  return (
    <header className="sticky top-0 z-50 backdrop-blur-xl bg-gray-900/80 border-b border-gray-800/50">
      <div className="container mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            {currentView === 'ui-design' && (
              <button
                onClick={() => setCurrentView('main')}
                className="p-2 rounded-lg bg-gray-800/50 hover:bg-gray-700/50 transition-all duration-200 hover:scale-105"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            
            <div className="flex items-center space-x-3">
              <div className="p-2 rounded-xl bg-gradient-to-r from-yellow-400 to-orange-500 shadow-lg">
                <Zap className="w-6 h-6 text-gray-900" />
              </div>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-yellow-400 to-orange-500 bg-clip-text text-transparent">
                  FlashFX
                </h1>
              </div>
            </div>
          </div>

          <nav className="flex items-center space-x-6">
            <button
              onClick={() => setCurrentView('main')}
              className={`px-4 py-2 rounded-lg transition-all duration-200 ${
                currentView === 'main'
                  ? 'bg-yellow-400/20 text-yellow-400 border border-yellow-400/30'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
              }`}
            >
              Home
            </button>
            <button
              onClick={() => setCurrentView('ui-design')}
              className={`px-4 py-2 rounded-lg transition-all duration-200 ${
                currentView === 'ui-design'
                  ? 'bg-yellow-400/20 text-yellow-400 border border-yellow-400/30'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
              }`}
            >
              UI Design
            </button>
          </nav>
        </div>
      </div>
    </header>
  );
};

export default Header;