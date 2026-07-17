# FlashFX

A professional motion graphics and animation design tool built with React, TypeScript, and Supabase. Create stunning animations with an intuitive interface, powerful timeline controls, and advanced visual effects.

## Overview

FlashFX is a web-based motion design application that combines the power of a vector design tool with advanced animation capabilities. Design graphics, create animations, and export professional videos directly in your browser.

## Key Features

### Design & Creation
- **Vector Design Tools** - Create shapes (rectangles, circles, stars), lines, text, and import images
- **Advanced Text System** - Rich text support with gradients, strokes, shadows, patterns, and per-character animation
- **Material System** - Multi-layer materials with gradients, textures, and blend modes
- **Image Filters** - 60+ professional filters including blur, color adjustments, distortion, and stylization effects
- **Groups & Layers** - Organize elements with grouping, z-ordering, and layer management
- **Smart Guides** - Snapping system with alignment guides and grid support

### Animation Engine
- **Keyframe Animation** - Animate any property with precise keyframe control
- **16 Easing Functions** - From linear to bounce, elastic, and custom bezier curves
- **Multi-Track Timeline** - Dual timeline layout for design and animation workflows
- **Property Animation** - Animate position, rotation, scale, opacity, colors, and more
- **Text Animation Modes** - Animate text by character, word, line, or as a whole
- **Sequence Compositor** - Create complex animations with multiple sequences

### Export & Rendering
- **Video Export** - Export to WebM or MP4 with customizable quality and frame rate
- **Image Sequences** - Export as PNG sequence for further editing
- **GIF Export** - Create animated GIFs from your designs
- **Frame-accurate Rendering** - Deterministic rendering ensures consistent output
- **Batch Processing** - Export multiple formats simultaneously

### Project Management
- **Cloud Storage** - Save projects to the cloud with automatic sync
- **Local Storage** - Work offline in guest mode with browser storage
- **Project Files** - Import/export projects as .flashfx files
- **Auto-backup** - Automatic preview generation and backup
- **Version Control** - Track changes with built-in changelog

### AI Integration
- **AI Chat Assistant** - Get design suggestions and help
- **DALL-E Integration** - Generate images with AI
- **Google Image Search** - Find and import stock images
- **Smart Presets** - AI-powered design presets

### Workflow Features
- **Three Layout Modes**
  - Design Mode - Focus on creating and positioning elements
  - Animate Mode - Timeline-centric animation workflow
  - Advanced Mode - Full control with all panels visible
- **Keyboard Shortcuts** - Extensive shortcuts for power users
- **Copy/Paste** - Full clipboard support for elements
- **Undo/Redo** - Unlimited history with Ctrl+Z/Ctrl+Y
- **Context Menus** - Right-click menus for quick actions

## Technology Stack

### Frontend
- **React 18** - Modern React with hooks and concurrent features
- **TypeScript** - Type-safe development
- **Vite** - Fast build tool and dev server
- **Tailwind CSS** - Utility-first styling
- **Lucide React** - Icon library

### Backend & Services
- **Supabase** - Backend-as-a-Service
  - PostgreSQL database with Row Level Security
  - Email/password authentication
  - Real-time data sync
  - Storage for user data
- **OpenAI API** - AI-powered features (optional)

### Key Libraries
- **JSZip** - Project file compression
- **FileSaver.js** - File downloads
- **html-to-image** - Canvas to image conversion
- **Monaco Editor** - JSON editor for advanced users
- **UUID** - Unique identifier generation

## Project Structure

```
flashfx/
├── src/
│   ├── animation-engine/      # Core animation system
│   │   ├── AnimationContext.tsx
│   │   ├── types.ts
│   │   ├── interpolation.ts
│   │   └── usePlayback.ts
│   ├── components/
│   │   ├── animation/         # Animation UI components
│   │   ├── auth/              # Authentication modals
│   │   ├── design-tool/       # Design canvas and tools
│   │   ├── image/             # Image import and filters
│   │   ├── layout/            # Layout system and panels
│   │   ├── modals/            # Modal dialogs
│   │   ├── project/           # Project management
│   │   ├── sequence/          # Sequence compositor
│   │   ├── storage/           # Storage indicators
│   │   ├── timeline/          # Timeline components
│   │   └── tutorial/          # Tutorial system
│   ├── contexts/              # React contexts
│   │   ├── AuthContext.tsx    # Authentication state
│   │   └── TutorialContext.tsx
│   ├── export/                # Export system
│   │   ├── VideoRenderer.ts   # Video encoding
│   │   ├── SequenceRenderer.ts
│   │   ├── ExportManager.ts
│   │   └── ExportUI.tsx
│   ├── hooks/                 # Custom React hooks
│   ├── pages/                 # Main application pages
│   ├── services/              # Business logic services
│   ├── types/                 # TypeScript type definitions
│   └── utils/                 # Utility functions
├── supabase/
│   └── migrations/            # Database migrations
└── public/                    # Static assets
```

## Getting Started

### Prerequisites
- Node.js 18 or higher
- npm or yarn package manager
- Supabase account (for cloud features)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/flashfx.git
cd flashfx
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:

Create a `.env` file in the root directory:
```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_OPENAI_API_KEY=your_openai_key (optional)
```

4. Start the development server:
```bash
npm run dev
```

The application will open at `http://localhost:5173`

### Building for Production

```bash
npm run build
```

The built files will be in the `dist/` directory.

## Database Setup

FlashFX uses Supabase for data persistence. The database schema includes:

### Tables
- **profiles** - User profile information
- **projects** - User design projects with JSON data
- **media_pool** - User-uploaded media assets
- **presets** - Saved design presets
- **animation_favorites** - Favorite animation presets

### Security
- Row Level Security (RLS) enabled on all tables
- Owner-based access control
- Automatic profile creation via database triggers
- Foreign key constraints for data integrity

### Migrations
Database migrations are located in `supabase/migrations/`. Apply them using the Supabase CLI or directly in your Supabase dashboard.

## Usage Guide

### Creating Your First Project

1. Launch the application and sign up or continue as guest
2. Click "NEW PROJECT" on the home page
3. Choose canvas dimensions or use the default 4K (3840x2160)
4. Start designing in the editor

### Design Workflow

**Adding Shapes:**
- Use the toolbar to add rectangles, circles, text, or images
- Keyboard shortcuts: R (rectangle), C (circle), T (text), I (image)
- Right-click canvas for context menu

**Editing Properties:**
- Select elements to see properties in the right panel
- Adjust position, size, colors, and effects
- Use handles on canvas for visual transformations

**Creating Animations:**
1. Switch to "Animate" mode
2. Select an element
3. Move playhead to desired time
4. Change element properties
5. Keyframes are created automatically

### Timeline Controls

- **Spacebar** - Play/pause
- **Left/Right arrows** - Navigate frames
- **Ctrl+Drag** - Pan timeline
- **Scroll** - Zoom timeline
- **Click keyframe** - Select and edit
- **Drag keyframe** - Move in time

### Keyboard Shortcuts

**General:**
- `Ctrl+Z` - Undo
- `Ctrl+Y` - Redo
- `Ctrl+D` - Duplicate
- `Ctrl+G` - Group
- `Ctrl+Shift+G` - Ungroup
- `Delete` - Delete selected
- `Ctrl+A` - Select all
- `Escape` - Deselect all

**Tools:**
- `R` - Rectangle
- `C` - Circle
- `T` - Text
- `L` - Line
- `I` - Image
- `V` - Select tool

**View:**
- `Ctrl+0` - Fit to screen
- `Ctrl+=` - Zoom in
- `Ctrl+-` - Zoom out
- `Ctrl+;` - Toggle grid
- `Ctrl+'` - Toggle snap

**Nudge:**
- `Arrow keys` - Move 1px
- `Shift+Arrow` - Move 10px

## Export Options

### Video Export
- Formats: WebM (VP8/VP9), MP4 (H.264)
- Frame rates: 24, 30, 60 fps
- Quality: Low, Medium, High, Maximum
- Resolution: Match canvas or custom

### Image Export
- Single frame PNG export
- PNG sequence export for compositing
- Transparent background support

### Project Files
- .flashfx format (compressed JSON + assets)
- Cross-platform compatible
- Includes all elements, animations, and settings

## Advanced Features

### Material System
Create complex visual effects with multi-layer materials:
- Multiple gradient layers with blend modes
- Texture fills with customizable parameters
- Pattern generation (dots, lines, grids)
- Layer opacity and blending

### Text Animation
Animate text with precise control:
- Split by character, word, or line
- Stagger animations with custom delay
- Individual keyframe control
- Preserve or override base animation

### Custom Curves
Use the interpolation graph to:
- Edit bezier handles for smooth curves
- Choose from 16 easing presets
- Visualize animation timing
- Fine-tune motion quality

### JSON Editor
For advanced users:
- Direct JSON editing of elements
- Bulk property changes
- Project-wide search and replace
- Schema validation

## Guest Mode vs Authenticated

### Guest Mode (Local Storage)
- No account required
- Projects saved to browser storage
- Limited to browser storage quota
- Projects lost if browser data cleared
- No cross-device sync

### Authenticated Mode (Cloud)
- Projects saved to cloud database
- Access from any device
- Storage quota: 50MB free tier
- Automatic backup and sync
- Secure user isolation

## Performance Tips

1. **Canvas Size** - Use appropriate dimensions (4K for export, 1080p for preview)
2. **Image Optimization** - Compress images before importing
3. **Layer Count** - Group elements when possible
4. **Animation Length** - Shorter animations render faster
5. **Effect Usage** - Complex filters increase render time

## Browser Support

**Recommended:**
- Chrome 90+
- Edge 90+
- Firefox 88+
- Safari 14+

**Required Features:**
- ES2020 support
- Canvas API
- Web Workers
- IndexedDB
- Local Storage

## Contributing

Contributions are welcome. Please:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Write or update tests
5. Submit a pull request

## License

This project is licensed under the MIT License. See LICENSE file for details.

## Credits

Built with modern web technologies:
- React team for the amazing framework
- Supabase for backend infrastructure
- Vercel for Vite and tooling
- All open source contributors

## Support

For issues, questions, or feature requests:
- GitHub Issues: Report bugs and request features
- Documentation: See docs/ folder for detailed guides
- Community: Join discussions in GitHub Discussions

## Roadmap

**Current Version:** Alpha
**Status:** Active Development

**Upcoming Features:**
- Real-time collaboration
- Video import and editing
- Audio tracks and sync
- Shape morphing animations
- 3D transform support
- Plugin system
- Template marketplace
- Mobile responsive design

## Documentation

Additional documentation available:
- `AUTHENTICATION_SYSTEM_DOCUMENTATION.md` - Auth implementation
- `EXPORT_SYSTEM_DOCUMENTATION.md` - Export and rendering
- `TEXT_FEATURES_DOCUMENTATION.md` - Text system guide
- `BACKGROUND_FEATURE_DOCUMENTATION.md` - Background system
- `KEYBOARD_SHORTCUTS_IMPLEMENTATION.md` - Complete shortcuts list
- `INTEGRATION_GUIDE.md` - API and integration guide

## Version History

**Alpha Release**
- Core design tools
- Animation engine
- Export system
- Cloud storage
- Authentication
- Project management

## Acknowledgments

Special thanks to:
- The React community
- Supabase team
- All beta testers
- Open source contributors

---

**Made with passion for motion design**

For more information, visit the documentation or reach out to the development team.
