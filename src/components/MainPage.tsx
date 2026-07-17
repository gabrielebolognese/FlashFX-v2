import React from 'react';
import { Palette, Sparkles, ArrowRight, Clock } from 'lucide-react';

interface MainPageProps {
  onNavigateToUIDesign: () => void;
}

const MainPage: React.FC<MainPageProps> = ({ onNavigateToUIDesign }) => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      {/* Hero Section */}
      <section className="relative py-20 px-6">
        <div className="container mx-auto text-center">
          <div className="max-w-4xl mx-auto">
            <h1 className="text-6xl md:text-8xl font-bold mb-6 bg-gradient-to-r from-yellow-400 via-orange-500 to-red-500 bg-clip-text text-transparent">
              FlashFX
            </h1>
            <p className="text-xl md:text-2xl text-gray-300 mb-8 font-light">
              Professional UI motion graphics design tool
            </p>
            <p className="text-gray-400 max-w-2xl mx-auto mb-12">
              Create stunning UI elements, animations, and export them as high-quality assets. 
              Perfect for designers, developers, and creative professionals.
            </p>
          </div>
        </div>
        
        {/* Animated background elements */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-32 h-32 bg-yellow-400/10 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute bottom-1/4 right-1/4 w-48 h-48 bg-orange-500/10 rounded-full blur-3xl animate-pulse delay-1000"></div>
        </div>
      </section>

      {/* Full App Section */}
      <section className="py-16 px-6">
        <div className="container mx-auto">
          <div className="max-w-4xl mx-auto">
            <div className="bg-gray-800/50 backdrop-blur-xl rounded-3xl p-8 border border-gray-700/50 shadow-2xl">
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-r from-yellow-400 to-orange-500 mb-6">
                  <Sparkles className="w-8 h-8 text-gray-900" />
                </div>
                <h2 className="text-3xl font-bold mb-4 text-white">Full Application</h2>
                <p className="text-gray-400 mb-8 max-w-2xl mx-auto">
                  The complete FlashFX suite with advanced features, team collaboration, 
                  cloud sync, and professional export options.
                </p>
                <div className="inline-flex items-center space-x-2 px-6 py-3 bg-gray-700/50 rounded-full">
                  <Clock className="w-5 h-5 text-yellow-400" />
                  <span className="text-yellow-400 font-semibold">Coming Soon</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Demo Apps Section */}
      <section className="py-16 px-6">
        <div className="container mx-auto">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-4xl font-bold mb-4 text-white">Demo Applications</h2>
              <p className="text-gray-400 text-lg">
                Try out our powerful design tools with these interactive demos
              </p>
            </div>

            <div className="grid md:grid-cols-1 gap-8">
              {/* UI Design Demo Card */}
              <div className="group relative">
                <div className="absolute inset-0 bg-gradient-to-r from-yellow-400/20 to-orange-500/20 rounded-3xl blur-xl group-hover:blur-2xl transition-all duration-300"></div>
                <div className="relative bg-gray-800/50 backdrop-blur-xl rounded-3xl p-8 border border-gray-700/50 hover:border-yellow-400/30 transition-all duration-300 cursor-pointer transform hover:scale-105">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center space-x-4">
                      <div className="p-3 rounded-2xl bg-gradient-to-r from-yellow-400 to-orange-500">
                        <Palette className="w-8 h-8 text-gray-900" />
                      </div>
                      <div>
                        <h3 className="text-2xl font-bold text-white">UI Design Tool</h3>
                        <p className="text-gray-400">Create and export UI elements</p>
                      </div>
                    </div>
                    <ArrowRight className="w-6 h-6 text-yellow-400 group-hover:translate-x-1 transition-transform duration-200" />
                  </div>
                  
                  <p className="text-gray-300 mb-6">
                    Full-featured design interface with canvas workspace, shape tools, 
                    UI presets, and PNG export capabilities. Perfect for creating buttons, 
                    chat bubbles, frames, and more.
                  </p>
                  
                  <div className="flex flex-wrap gap-2 mb-6">
                    <span className="px-3 py-1 bg-yellow-400/20 text-yellow-400 rounded-full text-sm">Canvas</span>
                    <span className="px-3 py-1 bg-orange-500/20 text-orange-400 rounded-full text-sm">Shapes</span>
                    <span className="px-3 py-1 bg-red-500/20 text-red-400 rounded-full text-sm">Export</span>
                    <span className="px-3 py-1 bg-blue-500/20 text-blue-400 rounded-full text-sm">Layers</span>
                  </div>
                  
                  <button
                    onClick={onNavigateToUIDesign}
                    className="w-full py-3 bg-gradient-to-r from-yellow-400 to-orange-500 text-gray-900 font-semibold rounded-xl hover:from-yellow-300 hover:to-orange-400 transition-all duration-200 transform hover:scale-105 shadow-lg hover:shadow-xl"
                  >
                    Launch UI Design Tool
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-6 border-t border-gray-800/50">
        <div className="container mx-auto text-center">
          <p className="text-gray-400">
            © 2024 FlashFX DEMO. Built with React & Tailwind CSS.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default MainPage;