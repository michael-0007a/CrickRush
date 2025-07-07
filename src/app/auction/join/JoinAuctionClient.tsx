'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import FranchiseLogo from '@/components/FranchiseLogo';
import { Users, Trophy, CheckCircle, Target, UserPlus, Crown, Play, Settings, LogOut, User, ChevronDown } from 'lucide-react';

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

export default function JoinAuctionClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const roomKey = searchParams.get('roomKey') || '';

  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<string>('');
  const [room, setRoom] = useState<AuctionRoom | null>(null);
  const [availableTeams, setAvailableTeams] = useState<IPLTeam[]>([]);
  const [error, setError] = useState('');
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);

  useEffect(() => {
    initializePage();
  }, []);

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

      // Check if user is already a participant
      const { data: existingParticipant } = await supabase
        .from('auction_participants')
        .select('*')
        .eq('auction_room_id', roomData.id)
        .eq('user_id', session.user.id)
        .single();

      if (existingParticipant) {
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

    } catch (error) {
      setError('Failed to load auction details');
    } finally {
      setLoading(false);
    }
  };

  const loadAvailableTeams = async (roomData: AuctionRoom) => {
    try {
      // Get all franchises
      const { data: franchises } = await supabase
        .from('ipl_franchises')
        .select('*')
        .order('name');

      // Get taken teams
      const { data: takenTeams } = await supabase
        .from('auction_participants')
        .select('team_id, users_profiles!inner(full_name)')
        .eq('auction_room_id', roomData.id)
        .not('team_id', 'is', null);

      const takenTeamIds = new Set(takenTeams?.map(t => t.team_id) || []);
      const takenTeamMap = new Map(takenTeams?.map(t => [t.team_id, t.users_profiles?.full_name || 'Unknown']) || []);

      const teamsWithAvailability = franchises?.map(team => ({
        ...team,
        available: !takenTeamIds.has(team.id),
        takenBy: takenTeamMap.get(team.id)
      })) || [];

      setAvailableTeams(teamsWithAvailability);
    } catch (error) {
      setError('Failed to load team information');
    }
  };

  const joinAuction = async () => {
    if (!selectedTeam || !room || !user) return;

    try {
      setJoining(true);

      const { error } = await supabase
        .from('auction_participants')
        .insert({
          auction_room_id: room.id,
          user_id: user.id,
          team_id: selectedTeam,
          budget_remaining: room.budget_per_team,
          players_count: 0,
          is_auctioneer: false
        });

      if (error) throw error;

      // Redirect to auction room
      router.push(`/auction/${room.room_key}`);
    } catch (error) {
      setError('Failed to join auction. Please try again.');
      setJoining(false);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    router.push('/auth');
  };

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
                <span>IPL Auction</span>
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
              <span>IPL Auction</span>
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
                  <p className="text-2xl font-bold text-green-400 mb-1">₹{room.budget_per_team}Cr</p>
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
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold mb-2">Choose Your IPL Franchise</h2>
              <p style={{ color: 'var(--text-muted)' }}>
                Select an available team to represent in this auction
              </p>
            </div>

            <div className="grid grid-5 gap-4 mb-8">
              {availableTeams.map((team) => (
                <button
                  key={team.id}
                  onClick={() => team.available && setSelectedTeam(team.id)}
                  disabled={!team.available}
                  className={`card text-center p-4 transition-all ${
                    selectedTeam === team.id ? 'ring-2 ring-blue-500' : ''
                  } ${!team.available ? 'opacity-50 cursor-not-allowed' : 'hover:scale-105 cursor-pointer'}`}
                  style={{
                    backgroundColor: team.available ? 'var(--bg-surface)' : 'var(--bg-glass)',
                    borderColor: selectedTeam === team.id ? team.color : 'var(--border-default)'
                  }}
                >
                  <div className="mb-3 flex justify-center">
                    <FranchiseLogo franchiseCode={team.short_name} size="xl" />
                  </div>
                  <div className="font-bold text-sm mb-1">{team.short_name}</div>
                  <div className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
                    {team.city}
                  </div>
                  {!team.available && (
                    <div className="text-xs text-red-400">
                      Taken by {team.takenBy}
                    </div>
                  )}
                  {selectedTeam === team.id && (
                    <div className="text-xs text-blue-400 mt-1">
                      <CheckCircle className="w-4 h-4 mx-auto" />
                    </div>
                  )}
                </button>
              ))}
            </div>

            <div className="flex gap-4 justify-center">
              <button
                onClick={() => router.push('/dashboard')}
                className="btn btn-secondary px-8"
              >
                Cancel
              </button>
              <button
                onClick={joinAuction}
                disabled={!selectedTeam || joining}
                className="btn btn-primary px-8"
              >
                {joining ? (
                  <>
                    <div className="spinner-sm mr-2"></div>
                    Joining...
                  </>
                ) : (
                  <>
                    <UserPlus className="w-4 h-4 mr-2" />
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
