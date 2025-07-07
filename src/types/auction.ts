// IPL Auction Types
export interface IPLTeam {
  id: string;
  name: string;
  shortName: string;
  color: string;
  secondaryColor: string;
  remainingBudget: number;
  squadSize: number;
  overseasPlayers: number;
  captain: string;
  maxSquadSize: number;
  maxOverseasPlayers: number;
}

export interface Player {
  id: number;
  name: string;
  nationality: string;
  category: 'Batsman' | 'Bowler' | 'All-Rounder' | 'Wicket-Keeper' | 'Fast Bowler' | 'Spin Bowler';
  basePrice: number;
  specialization: string;
  experience: 'International' | 'Domestic';
  isOverseas: boolean;
  stats: {
    matches?: number;
    runs?: number;
    wickets?: number;
    average?: number;
    strikeRate?: number;
    economy?: number;
  };
}

export interface AuctionRoom {
  id: string;
  roomKey: string;
  name: string;
  createdBy: string;
  createdAt: string;
  status: 'waiting' | 'active' | 'paused' | 'completed';
  maxTeams: number;
  playersPerTeam: number;
  budget: number;
  settings: {
    bidTimer: number;
    autoAdvance: boolean;
  };
}

export interface RoomParticipant {
  id: string;
  userId: string;
  roomId: string;
  userName: string;
  userAvatar?: string;
  teamId?: string;
  isAuctioneer: boolean;
  joinedAt: string;
}

export interface AuctionState {
  isActive: boolean;
  currentPlayer: Player | null;
  currentPlayerIndex: number;
  currentBid: number;
  leadingTeam: string | null;
  bidTimer: number;
  timeRemaining: number;
  playerQueue: Player[];
  soldPlayers: (Player & { team: string; price: number })[];
  unsoldPlayers: Player[];
}

export interface BidAction {
  id: string;
  roomId: string;
  playerId: number;
  teamId: string;
  amount: number;
  timestamp: string;
  type: 'bid' | 'sold' | 'unsold' | 'pass';
}

export interface AuctionStats {
  playersSold: number;
  totalSpent: number;
  avgPrice: number;
  remainingPlayers: number;
}

// Default IPL Teams data
export const IPL_TEAMS: IPLTeam[] = [
  {
    id: "CSK",
    name: "Chennai Super Kings",
    shortName: "CSK",
    color: "#FFEB3B",
    secondaryColor: "#FF9800",
    remainingBudget: 12000, // 120cr in lakhs
    squadSize: 0,
    overseasPlayers: 0,
    captain: "MS Dhoni",
    maxSquadSize: 25,
    maxOverseasPlayers: 8
  },
  {
    id: "MI",
    name: "Mumbai Indians",
    shortName: "MI",
    color: "#2196F3",
    secondaryColor: "#FFD700",
    remainingBudget: 12000,
    squadSize: 0,
    overseasPlayers: 0,
    captain: "Rohit Sharma",
    maxSquadSize: 25,
    maxOverseasPlayers: 8
  },
  {
    id: "RCB",
    name: "Royal Challengers Bengaluru",
    shortName: "RCB",
    color: "#D32F2F",
    secondaryColor: "#FFD700",
    remainingBudget: 12000,
    squadSize: 0,
    overseasPlayers: 0,
    captain: "Virat Kohli",
    maxSquadSize: 25,
    maxOverseasPlayers: 8
  },
  {
    id: "KKR",
    name: "Kolkata Knight Riders",
    shortName: "KKR",
    color: "#673AB7",
    secondaryColor: "#FFD700",
    remainingBudget: 12000,
    squadSize: 0,
    overseasPlayers: 0,
    captain: "Shreyas Iyer",
    maxSquadSize: 25,
    maxOverseasPlayers: 8
  },
  {
    id: "DC",
    name: "Delhi Capitals",
    shortName: "DC",
    color: "#2196F3",
    secondaryColor: "#FF5722",
    remainingBudget: 12000,
    squadSize: 0,
    overseasPlayers: 0,
    captain: "Rishabh Pant",
    maxSquadSize: 25,
    maxOverseasPlayers: 8
  },
  {
    id: "PBKS",
    name: "Punjab Kings",
    shortName: "PBKS",
    color: "#E91E63",
    secondaryColor: "#FFD700",
    remainingBudget: 12000,
    squadSize: 0,
    overseasPlayers: 0,
    captain: "Shikhar Dhawan",
    maxSquadSize: 25,
    maxOverseasPlayers: 8
  },
  {
    id: "GT",
    name: "Gujarat Titans",
    shortName: "GT",
    color: "#1976D2",
    secondaryColor: "#FFD700",
    remainingBudget: 12000,
    squadSize: 0,
    overseasPlayers: 0,
    captain: "Hardik Pandya",
    maxSquadSize: 25,
    maxOverseasPlayers: 8
  },
  {
    id: "LSG",
    name: "Lucknow Super Giants",
    shortName: "LSG",
    color: "#00BCD4",
    secondaryColor: "#FF9800",
    remainingBudget: 12000,
    squadSize: 0,
    overseasPlayers: 0,
    captain: "KL Rahul",
    maxSquadSize: 25,
    maxOverseasPlayers: 8
  },
  {
    id: "SRH",
    name: "Sunrisers Hyderabad",
    shortName: "SRH",
    color: "#FF5722",
    secondaryColor: "#000000",
    remainingBudget: 12000,
    squadSize: 0,
    overseasPlayers: 0,
    captain: "Pat Cummins",
    maxSquadSize: 25,
    maxOverseasPlayers: 8
  },
  {
    id: "RR",
    name: "Rajasthan Royals",
    shortName: "RR",
    color: "#E91E63",
    secondaryColor: "#FFD700",
    remainingBudget: 12000,
    squadSize: 0,
    overseasPlayers: 0,
    captain: "Sanju Samson",
    maxSquadSize: 25,
    maxOverseasPlayers: 8
  }
];

// Sample Players data
export const SAMPLE_PLAYERS: Player[] = [
  {
    id: 1,
    name: "Jos Buttler",
    nationality: "England",
    category: "Wicket-Keeper",
    basePrice: 200,
    specialization: "Explosive Batting",
    experience: "International",
    isOverseas: true,
    stats: { matches: 85, runs: 2582, average: 35.8, strikeRate: 148.2 }
  },
  {
    id: 2,
    name: "Mohammed Shami",
    nationality: "India",
    category: "Fast Bowler",
    basePrice: 150,
    specialization: "Pace & Swing",
    experience: "International",
    isOverseas: false,
    stats: { matches: 95, wickets: 127, average: 26.8, economy: 8.2 }
  },
  {
    id: 3,
    name: "Mitchell Starc",
    nationality: "Australia",
    category: "Fast Bowler",
    basePrice: 200,
    specialization: "Left-arm Pace",
    experience: "International",
    isOverseas: true,
    stats: { matches: 45, wickets: 51, average: 25.4, economy: 8.8 }
  },
  {
    id: 4,
    name: "Marcus Stoinis",
    nationality: "Australia",
    category: "All-Rounder",
    basePrice: 100,
    specialization: "Power Hitting",
    experience: "International",
    isOverseas: true,
    stats: { matches: 78, runs: 1516, wickets: 32, strikeRate: 135.8 }
  },
  {
    id: 5,
    name: "Devdutt Padikkal",
    nationality: "India",
    category: "Batsman",
    basePrice: 100,
    specialization: "Left-hand Opening",
    experience: "Domestic",
    isOverseas: false,
    stats: { matches: 42, runs: 1124, average: 31.2, strikeRate: 124.5 }
  },
  {
    id: 6,
    name: "Kagiso Rabada",
    nationality: "South Africa",
    category: "Fast Bowler",
    basePrice: 175,
    specialization: "Express Pace",
    experience: "International",
    isOverseas: true,
    stats: { matches: 64, wickets: 87, average: 22.3, economy: 8.1 }
  },
  {
    id: 7,
    name: "Yuzvendra Chahal",
    nationality: "India",
    category: "Spin Bowler",
    basePrice: 125,
    specialization: "Leg-spin",
    experience: "International",
    isOverseas: false,
    stats: { matches: 142, wickets: 187, average: 23.1, economy: 7.8 }
  },
  {
    id: 8,
    name: "Glenn Maxwell",
    nationality: "Australia",
    category: "All-Rounder",
    basePrice: 150,
    specialization: "360-degree Batting",
    experience: "International",
    isOverseas: true,
    stats: { matches: 108, runs: 2771, wickets: 37, strikeRate: 154.3 }
  },
  {
    id: 9,
    name: "Prithvi Shaw",
    nationality: "India",
    category: "Batsman",
    basePrice: 75,
    specialization: "Aggressive Opening",
    experience: "International",
    isOverseas: false,
    stats: { matches: 76, runs: 1892, average: 26.2, strikeRate: 147.8 }
  },
  {
    id: 10,
    name: "Liam Livingstone",
    nationality: "England",
    category: "All-Rounder",
    basePrice: 125,
    specialization: "Power Hitting & Spin",
    experience: "International",
    isOverseas: true,
    stats: { matches: 35, runs: 895, wickets: 15, strikeRate: 162.4 }
  }
];
