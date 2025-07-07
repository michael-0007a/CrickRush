# 🏏 CrickRush

**Live Cricket Auction Game** - Experience the thrill of IPL auctions in real-time with your friends!

[![Next.js](https://img.shields.io/badge/Next.js-15-black)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)](https://www.typescriptlang.org/)
[![Supabase](https://img.shields.io/badge/Supabase-Real--time-green)](https://supabase.com/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-CSS-38B2AC)](https://tailwindcss.com/)

## 🌟 Features

### 🎯 Real-Time Bidding
- **Live Synchronized Timer** - All participants see the same countdown timer
- **Instant Bid Updates** - Bids appear instantly across all connected devices
- **Auto Time Extension** - Timer automatically adds 10 seconds when bids are placed
- **Pause/Resume Control** - Auctioneers can pause and resume the auction

### 🏆 IPL Team Management
- **10 Official IPL Franchises** - Choose from CSK, MI, RCB, KKR, DC, SRH, PBKS, RR, GT, LSG
- **Budget Management** - Track remaining budget and spending in real-time
- **Squad Building** - Build your dream team with player limits and overseas restrictions
- **Team Statistics** - View detailed squad composition and spending analysis

### 👥 Multi-User Experience
- **Room-Based Auctions** - Create private rooms with unique codes
- **Auctioneer Controls** - Full auction management for room creators
- **Participant Dashboard** - Clean interface for bidders to track progress
- **Real-Time Sync** - All users see updates simultaneously

### 🎨 Modern UI/UX
- **Dark Theme Design** - Professional auction house aesthetic
- **Responsive Layout** - Optimized for desktop screens (mobile coming soon)
- **Gradient Animations** - Smooth visual feedback for all interactions
- **Team Color Schemes** - Each franchise represented with authentic colors

### 🔐 Secure Authentication
- **Supabase Auth** - Secure user authentication and session management
- **Profile Management** - Customizable user profiles with avatars
- **Room Access Control** - Only invited participants can join auctions

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- npm or yarn
- Supabase account (for database and real-time features)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/crickrush.git
   cd crickrush
   ```

2. **Install dependencies**
   ```bash
   npm install
   # or
   yarn install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env.local
   ```
   
   Add your Supabase credentials:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

4. **Set up the database**
   - Import the provided SQL schema to your Supabase project
   - Upload player data from `ipl_players.csv`
   - Set up the timer function using `timer_setup.sql`

5. **Run the development server**
   ```bash
   npm run dev
   # or
   yarn dev
   ```

6. **Open your browser**
   Navigate to [http://localhost:3000](http://localhost:3000)

## 🎮 How to Play

### Creating an Auction
1. **Sign up/Login** with your email or social account
2. **Create Room** from the dashboard
3. **Set Parameters** - budget, team size, timer duration
4. **Share Room Code** with friends to join
5. **Start Auction** when all participants are ready

### Joining an Auction
1. **Get Room Code** from the auction creator
2. **Join Room** using the 6-character code
3. **Select Team** from available IPL franchises
4. **Wait for Start** until auctioneer begins the auction

### Bidding Process
1. **View Current Player** - see stats, base price, and current bid
2. **Place Bids** - use quick bid or custom amount
3. **Monitor Timer** - each bid adds 10 seconds to countdown
4. **Win Players** - highest bidder when timer expires gets the player
5. **Build Squad** - continue until all players are sold

### Auctioneer Controls
- **Start/Pause/Resume** auction at any time
- **Add Time** to extend bidding periods
- **Sell Player** to current highest bidder
- **Skip Player** if no suitable bids
- **End Auction** when complete

## 🛠️ Tech Stack

### Frontend
- **Next.js 15** - React framework with App Router
- **TypeScript** - Type-safe development
- **Tailwind CSS** - Utility-first styling
- **Lucide Icons** - Clean, modern iconography

### Backend & Database
- **Supabase** - Backend-as-a-Service platform
- **PostgreSQL** - Relational database with real-time subscriptions
- **Row Level Security** - Secure data access patterns

### Real-Time Features
- **Supabase Realtime** - WebSocket connections for live updates
- **Custom Hooks** - Reusable real-time state management
- **Synchronized Timers** - Server-side time synchronization

## 📱 Browser Support

### Fully Supported
- **Desktop Chrome** 90+
- **Desktop Firefox** 88+
- **Desktop Safari** 14+
- **Desktop Edge** 90+

### Mobile Support
- 📱 **Coming Soon** - Mobile responsive design in development
- 🖥️ **Current Requirement** - Minimum screen width of 880px for optimal experience

## 🎯 Game Rules

### Budget & Bidding
- Each team starts with the same budget (customizable, default ₹100 Cr)
- Minimum bid increment: ₹25L (below ₹2Cr) or ₹1Cr (above ₹2Cr)
- Maximum squad size: Customizable per room (default 11 players)
- Overseas player limit: 4 per team (authentic IPL rules)

### Auction Flow
- Players presented in random order
- 30-second timer per player (customizable)
- Timer extends by 10 seconds on each new bid
- Auctioneer can pause/resume or add time manually
- Unsold players can be re-auctioned

### Winning Conditions
- Build the best squad within budget constraints
- Strategic bidding to secure key players
- Balance team composition across batting, bowling, all-rounders

## 🔧 Development

### Project Structure
```
src/
├── app/                 # Next.js App Router pages
│   ├── auth/           # Authentication pages
│   ├── dashboard/      # User dashboard
│   ├── auction/        # Live auction interface
│   └── api/            # API routes
├── components/         # Reusable React components
├── hooks/              # Custom React hooks
├── lib/                # Utility functions and config
└── types/              # TypeScript type definitions
```

### Key Components
- **`useAuctionTimer`** - Synchronized countdown timer
- **`useAuctionRealtime`** - Live auction state management
- **`useMySquad`** - Player collection tracking
- **`FranchiseLogo`** - IPL team logo display

### Database Schema
- **`auction_rooms`** - Room configuration and settings
- **`auction_participants`** - User-team assignments
- **`auction_state`** - Current auction progress
- **`auction_players`** - Sold player records
- **`players`** - Player database with stats
- **`ipl_franchises`** - Team information

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guidelines](CONTRIBUTING.md) for details.

### Development Setup
1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes and add tests
4. Commit: `git commit -m 'Add amazing feature'`
5. Push: `git push origin feature/amazing-feature`
6. Open a Pull Request

### Code Standards
- **TypeScript** - All code must be properly typed
- **ESLint** - Follow the established linting rules
- **Prettier** - Code formatting is automatic
- **JSDoc** - Document all functions and components

## 📝 License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details.

## 🙏 Acknowledgments

- **IPL** - Inspiration for auction mechanics and team data
- **Supabase** - Excellent real-time database platform
- **Next.js Team** - Amazing React framework
- **Tailwind CSS** - Beautiful utility-first styling
- **Cricket Community** - Feedback and feature suggestions

## 📧 Support

- **Documentation** - [Full documentation](https://docs.crickrush.com)
- **Issues** - [GitHub Issues](https://github.com/yourusername/crickrush/issues)
- **Discussions** - [GitHub Discussions](https://github.com/yourusername/crickrush/discussions)
- **Email** - support@crickrush.com

---

**Made with ❤️ for Cricket Fans** | **CrickRush v1.0** | **Experience the IPL Auction Thrill**
