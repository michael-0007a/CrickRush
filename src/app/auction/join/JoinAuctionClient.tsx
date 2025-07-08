'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import FranchiseLogo from '@/components/FranchiseLogo';
import { Users, Trophy, CheckCircle, Target, UserPlus, LogOut, User, ChevronDown } from 'lucide-react';

interface IPLTeam {
  id: string;
  name: string;
  short_name: string;
  color: string;
  logo: string;
  city: string;
  available?: boolean;
  takenBy?: string;
}

interface AuctionRoom {
  id: string;
  room_key: string;
  name: string;
  creator_id: string;
  status: string;
  max_participants: number;
  budget_per_team: number;
  players_per_team: number;
}

interface User {
  id: string;
  email?: string;
  user_metadata?: {
    full_name?: string;
    avatar_url?: string;
  };
}

interface Participant {
  team_id: string;
}

export default function JoinAuctionClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const roomKey = searchParams.get('roomKey') || '';

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<string>('');
  const [room, setRoom] = useState<AuctionRoom | null>(null);
  const [availableTeams, setAvailableTeams] = useState<IPLTeam[]>([]);
  const [error, setError] = useState('');
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);

  const initializePage = async () => {
    try {
      setLoading(true);

      // Get user session
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        router.push('/auth');
        return;
      }
      setUser(session.user);

      if (!roomKey) {
        setError('No room code provided');
        return;
      }

      // Load room data
      const { data: roomData, error: roomError } = await supabase
        .from('auction_rooms')
        .select('*')
        .eq('room_key', roomKey.toUpperCase())
        .single();

      if (roomError || !roomData) {
        setError('Auction room not found');
        return;
      }

      if (roomData.status === 'completed') {
        setError('This auction has ended and is no longer accepting new participants');
        return;
      }

      setRoom(roomData);
      console.log('Loaded room data:', roomData);

      // Check if user is already a participant
      const { data: existingParticipants } = await supabase
        .from('auction_participants')
        .select('*')
        .eq('auction_room_id', roomData.id)
        .eq('user_id', session.user.id);

      if (existingParticipants && existingParticipants.length > 0) {
        // User already joined - redirect to auction room
        router.push(`/auction/${roomData.room_key}`);
        return;
      }

      // Check if user is the auctioneer
      if (roomData.creator_id === session.user.id) {
        router.push(`/auction/${roomData.room_key}`);
        return;
      }

      // Load available teams
      await loadAvailableTeams(roomData);

    } catch {
      setError('Failed to load auction details');
    } finally {
      setLoading(false);
    }
  };

  const loadAvailableTeams = async (roomData: AuctionRoom) => {
    try {
      // Get all franchises
      const { data: franchises, error: franchiseError } = await supabase
        .from('ipl_franchises')
        .select('*')
        .order('name');

      if (franchiseError) {
        console.error('Error loading franchises:', franchiseError);
        setError('Failed to load team information');
        return;
      }

      // Get taken teams - handle potential RLS issues
      let takenTeams: Participant[] = [];
      try {
        const { data: participants, error: participantsError } = await supabase
          .from('auction_participants')
          .select('team_id')
          .eq('auction_room_id', roomData.id)
          .not('team_id', 'is', null);

        if (participantsError) {
          console.warn('Could not load participants (RLS issue?):', participantsError);
          // Continue with empty taken teams array
        } else {
          takenTeams = participants || [];
        }
      } catch (participantError) {
        console.warn('Participant loading failed:', participantError);
        // Continue with empty taken teams array
      }

      const takenTeamIds = new Set(takenTeams.map(t => t.team_id));

      const teamsWithAvailability = franchises?.map(team => ({
        ...team,
        available: !takenTeamIds.has(team.id),
        takenBy: 'Unknown' // Simplified since we can't reliably get user names
      })) || [];

      setAvailableTeams(teamsWithAvailability);
    } catch {
      setError('Failed to load team information');
    }
  };

  const joinAuction = async () => {
    if (!selectedTeam || !room || !user) {
      console.log('Missing required data:', { selectedTeam, room: !!room, user: !!user });
      return;
    }

    setJoining(true);
    setError('');

    try {
      // Simple insert without complex error handling
      const insertData = {
        auction_room_id: room.id,
        user_id: user.id,
        team_id: selectedTeam,
        budget_remaining: room.budget_per_team,
        is_auctioneer: false
      };

      console.log('Inserting participant:', insertData);

      const result = await supabase
        .from('auction_participants')
        .insert(insertData)
        .select()
        .single();

      console.log('Insert complete:', result);

      if (result.error) {
        throw new Error(result.error.message || 'Failed to join auction');
      }

      // Success - redirect to auction room
      console.log('Successfully joined auction, redirecting...');
      router.push(`/auction/${room.room_key}`);

    } catch (error) {
      console.error('Join auction failed:', error);
      setError(error instanceof Error ? error.message : 'Failed to join auction');
    } finally {
      setJoining(false);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    router.push('/auth');
  };

  useEffect(() => {
    initializePage();
  }, [roomKey]);

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
        <p style={{ color: 'var(--text-muted)' }}>Loading auction details...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        {/* Navigation */}
        <nav className="nav">
          <div className="container">
            <div className="nav-content">
              <a href="/dashboard" className="nav-brand">
                <Trophy className="w-6 h-6" />
                <span>CrickRush</span>
              </a>
            </div>
          </div>
        </nav>

        <main className="container section">
          <div className="text-center">
            <div className="feature-icon mb-6" style={{ background: 'linear-gradient(135deg, var(--accent-red) 0%, #ef4444 100%)', width: '5rem', height: '5rem', margin: '0 auto' }}>
              <Trophy className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-4xl font-bold mb-4">Unable to Join Auction</h1>
            <p className="text-xl mb-8" style={{ color: 'var(--text-muted)' }}>{error}</p>
            <button
              onClick={() => router.push('/dashboard')}
              className="btn btn-primary"
            >
              Back to Dashboard
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div>
      {/* Navigation */}
      <nav className="nav">
        <div className="container">
          <div className="nav-content">
            <a href="/dashboard" className="nav-brand">
              <Trophy className="w-6 h-6" />
              <span>CrickRush</span>
            </a>

            <div className="nav-actions">
              <div className={`profile-dropdown ${showProfileDropdown ? 'open' : ''}`}>
                <button
                  className="profile-trigger"
                  onClick={() => setShowProfileDropdown(!showProfileDropdown)}
                >
                  <img
                    src={user?.user_metadata?.avatar_url || 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?ixlib=rb-1.2.1&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80'}
                    alt="Profile"
                    className="user-avatar"
                  />
                  <ChevronDown className="w-4 h-4 chevron-icon" />
                </button>

                {showProfileDropdown && (
                  <div className="profile-dropdown-menu">
                    <div className="profile-dropdown-item" style={{ cursor: 'default' }}>
                      <User className="w-4 h-4" />
                      <div>
                        <div className="font-semibold text-sm">
                          {user?.user_metadata?.full_name || 'User'}
                        </div>
                        <div className="text-xs" style={{ color: 'var(--text-disabled)' }}>
                          {user?.email}
                        </div>
                      </div>
                    </div>

                    <hr style={{ margin: '0.5rem 0', border: 'none', borderTop: '1px solid var(--border-default)' }} />

                    <button
                      className="profile-dropdown-item"
                      onClick={() => {
                        setShowProfileDropdown(false);
                        router.push('/profile');
                      }}
                    >
                      <User className="w-4 h-4 mr-2" />
                      Profile Settings
                    </button>

                    <button
                      className="profile-dropdown-item danger"
                      onClick={() => {
                        setShowProfileDropdown(false);
                        signOut();
                      }}
                    >
                      <LogOut className="w-4 h-4 mr-2" />
                      Sign Out
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* Close dropdown when clicking outside */}
      {showProfileDropdown && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10,
          }}
          onClick={() => setShowProfileDropdown(false)}
        />
      )}

      <main className="container section">
        <div className="max-w-6xl mx-auto">
          {room && (
            <div className="text-center mb-8">
              <div className="feature-icon mb-6" style={{ background: 'linear-gradient(135deg, var(--primary-purple) 0%, var(--primary-cyan) 100%)', width: '5rem', height: '5rem', margin: '0 auto' }}>
                <UserPlus className="w-10 h-10 text-white" />
              </div>
              <h1 className="text-4xl font-bold mb-4">Join Auction</h1>
              <p className="text-xl mb-2">{room.name}</p>
              <p className="text-lg mb-6" style={{ color: 'var(--text-muted)' }}>
                Room Code: <span className="font-mono font-bold text-yellow-400">{room.room_key}</span>
              </p>

              <div className="grid grid-3 gap-6 max-w-4xl mx-auto mb-8">
                <div className="card text-center">
                  <div className="feature-icon mb-4" style={{ background: 'linear-gradient(135deg, var(--accent-green) 0%, #10b981 100%)' }}>
                    <Target className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-lg font-bold mb-2">Budget</h3>
                  <p className="text-2xl font-bold text-green-400 mb-1">₹{room.budget_per_team / 100}Cr</p>
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Starting budget per team</p>
                </div>

                <div className="card text-center">
                  <div className="feature-icon mb-4" style={{ background: 'linear-gradient(135deg, var(--primary-blue) 0%, var(--primary-purple) 100%)' }}>
                    <Users className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-lg font-bold mb-2">Squad Size</h3>
                  <p className="text-2xl font-bold text-blue-400 mb-1">{room.players_per_team}</p>
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Players per team</p>
                </div>

                <div className="card text-center">
                  <div className="feature-icon mb-4" style={{ background: 'linear-gradient(135deg, var(--accent-yellow) 0%, #fbbf24 100%)' }}>
                    <Trophy className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-lg font-bold mb-2">Teams</h3>
                  <p className="text-2xl font-bold text-yellow-400 mb-1">{availableTeams.filter(t => !t.available).length}/{room.max_participants}</p>
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Joined</p>
                </div>
              </div>
            </div>
          )}

          <div className="card card-lg">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold mb-3 text-white">Choose Your IPL Franchise</h2>
              <p className="text-lg mb-4" style={{ color: 'var(--text-muted)' }}>
                Select an available team to represent in this auction
              </p>

              {/* Available Teams Count */}
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-green-500/20 border border-green-500/30">
                <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                <span className="text-green-400 font-medium text-sm">
                  {availableTeams.filter(t => t.available).length} teams available
                </span>
              </div>
            </div>

            {/* Franchise Grid */}
            <div className="grid grid-cols-3 gap-4 mb-8">
              {availableTeams.map((team) => (
                <div
                  key={team.id}
                  className={`franchise-team-card relative rounded-xl border-2 transition-all duration-300 cursor-pointer overflow-hidden ${
                    team.available 
                      ? selectedTeam === team.id 
                        ? 'border-blue-500 bg-blue-500/10 scale-105 shadow-lg shadow-blue-500/20' 
                        : 'border-gray-600 bg-gray-800/50 hover:border-gray-400 hover:scale-105 hover:shadow-lg hover:shadow-gray-500/10 hover:bg-gray-800/70'
                      : 'border-gray-700 bg-gray-800/30 opacity-60 cursor-not-allowed'
                  }`}
                  onClick={() => team.available && setSelectedTeam(team.id)}
                >
                  {/* Hover shimmer effect */}
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full transition-transform duration-1000 hover:translate-x-full"></div>

                  {/* Selection indicator */}
                  {selectedTeam === team.id && (
                    <div className="absolute top-3 right-3 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center animate-pulse">
                      <CheckCircle className="w-3 h-3 text-white" />
                    </div>
                  )}

                  <div className="p-4 text-center relative z-10">
                    {/* Team Logo */}
                    <div className="flex justify-center mb-3">
                      <div className="transition-transform duration-300 hover:scale-110 hover:rotate-3">
                        <FranchiseLogo franchiseCode={team.short_name} size="lg" />
                      </div>
                    </div>

                    {/* Team Code */}
                    <h3 className="text-xl font-bold mb-1 text-white transition-colors duration-300">
                      {team.short_name}
                    </h3>

                    {/* Team City */}
                    <p className="text-sm text-gray-400 mb-2 transition-colors duration-300">
                      {team.city}
                    </p>

                    {/* Full Team Name */}
                    <p className="text-xs text-gray-500 mb-3 transition-colors duration-300">
                      {team.name}
                    </p>

                    {/* Availability Status */}
                    <div className="flex items-center justify-center gap-1">
                      <div className={`w-2 h-2 rounded-full transition-all duration-300 ${
                        team.available ? 'bg-green-400 animate-pulse' : 'bg-red-400'
                      }`}></div>
                      <span className={`text-xs font-medium transition-colors duration-300 ${
                        team.available ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {team.available ? 'Available' : 'Taken'}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Selection Summary */}
            {selectedTeam && (
              <div className="mb-8 p-4 rounded-xl bg-blue-500/10 border border-blue-500/30">
                <div className="flex items-center justify-center gap-4">
                  <div className="flex items-center gap-3">
                    <FranchiseLogo
                      franchiseCode={availableTeams.find(t => t.id === selectedTeam)?.short_name || ''}
                      size="md"
                    />
                    <div>
                      <h4 className="font-bold text-lg text-white">
                        {availableTeams.find(t => t.id === selectedTeam)?.short_name}
                      </h4>
                      <p className="text-sm text-gray-400">
                        {availableTeams.find(t => t.id === selectedTeam)?.city}
                      </p>
                    </div>
                  </div>
                  <div className="text-xl">🏏</div>
                  <div className="text-green-400 font-semibold">
                    Ready to join!
                  </div>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-4 justify-center">
              <button
                onClick={() => router.push('/dashboard')}
                className="btn btn-secondary px-8 py-3 text-lg font-medium rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={joinAuction}
                disabled={!selectedTeam || joining}
                className={`btn btn-primary px-8 py-3 text-lg font-medium rounded-lg ${
                  !selectedTeam ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                {joining ? (
                  <>
                    <div className="spinner-sm mr-2"></div>
                    Joining...
                  </>
                ) : (
                  <>
                    <UserPlus className="w-5 h-5 mr-2" />
                    Join Auction
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
