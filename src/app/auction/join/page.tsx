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

export default function JoinAuctionPage() {
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
        console.log('User already joined, redirecting to auction room');
        router.push(`/auction/${roomData.room_key}`);
        return;
      }

      // Check if user is the auctioneer
      if (roomData.creator_id === session.user.id) {
        console.log('User is auctioneer, redirecting to auction room');
        router.push(`/auction/${roomData.room_key}`);
        return;
      }

      // Load teams for selection
      await loadTeams(roomData.id);

    } catch (error) {
      console.error('Error initializing page:', error);
      setError('Failed to load auction room');
    } finally {
      setLoading(false);
    }
  };

  const loadTeams = async (roomId: string) => {
    try {
      // Get all franchises
      const { data: franchises } = await supabase
        .from('ipl_franchises')
        .select('*')
        .order('name');

      // Get taken teams
      const { data: participants } = await supabase
        .from('auction_participants')
        .select(`
          team_id,
          users_profiles(full_name)
        `)
        .eq('auction_room_id', roomId)
        .not('team_id', 'is', null);

      if (franchises) {
        const teamsWithAvailability = franchises.map(team => {
          const takenBy = participants?.find(p => p.team_id === team.id);
          return {
            ...team,
            available: !takenBy,
            takenBy: takenBy?.users_profiles?.full_name || null
          };
        });
        setAvailableTeams(teamsWithAvailability);
      }
    } catch (error) {
      console.error('Error loading teams:', error);
    }
  };

  const joinAuction = async () => {
    if (!room || !selectedTeam || !user) {
      alert('Please select a team before joining');
      return;
    }

    setJoining(true);
    setError('');

    try {
      console.log('Attempting to join auction...');

      // Double-check team availability
      const { data: teamCheck } = await supabase
        .from('auction_participants')
        .select('team_id')
        .eq('auction_room_id', room.id)
        .eq('team_id', selectedTeam)
        .single();

      if (teamCheck) {
        setError('This team has just been selected by another player. Please choose a different team.');
        await loadTeams(room.id);
        setJoining(false);
        return;
      }

      // Join the auction
      const { data: insertData, error: joinError } = await supabase
        .from('auction_participants')
        .insert({
          auction_room_id: room.id,
          user_id: user.id,
          team_id: selectedTeam,
          budget_remaining: room.budget_per_team,
          players_count: 0,
          is_auctioneer: false
        })
        .select('*')
        .single();

      if (joinError) {
        console.error('Join error:', joinError);

        if (joinError.code === '23505') {
          if (joinError.message?.includes('user_id')) {
            // User already joined somehow
            router.push(`/auction/${room.room_key}`);
            return;
          } else if (joinError.message?.includes('team_id')) {
            setError('This team has just been selected by another player. Please choose a different team.');
            await loadTeams(room.id);
            setJoining(false);
            return;
          }
        }

        throw joinError;
      }

      console.log('Successfully joined auction!');

      // Success - redirect to auction room
      router.push(`/auction/${room.room_key}`);

    } catch (error: any) {
      console.error('Error joining auction:', error);
      setError('Failed to join auction. Please try again.');
      setJoining(false);
    }
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
      router.push('/auth');
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  const formatCurrency = (amount: number) => {
    if (amount >= 100) {
      return `${(amount / 100).toFixed(1)}Cr`;
    }
    return `${amount}L`;
  };

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
        <p style={{ color: 'var(--text-muted)' }}>Loading auction...</p>
      </div>
    );
  }

  if (error || !room) {
    return (
      <div className="loading">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Unable to Join Auction</h1>
          <p style={{ color: 'var(--text-muted)' }} className="mb-6">
            {error || 'Auction room not found'}
          </p>
          <button
            onClick={() => router.push('/dashboard')}
            className="btn btn-primary"
          >
            Back to Dashboard
          </button>
        </div>
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
                      <Settings className="w-4 h-4 mr-2" />
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

      {/* Main Content */}
      <main className="container section fade-in">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-4">Join Auction</h1>
          <p className="text-xl" style={{ color: 'var(--text-muted)' }}>
            Select your IPL franchise to join the auction
          </p>
        </div>

        <div className="card card-lg max-w-4xl mx-auto">
          {/* Room Info */}
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold mb-4">{room.name}</h2>
            <div className="grid grid-3 gap-4 max-w-2xl mx-auto">
              <div className="text-center p-4 bg-gradient-to-br from-blue-500/10 to-purple-500/10 rounded-lg border border-blue-500/20">
                <div className="text-xl font-bold text-blue-400">{room.room_key}</div>
                <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Room Code</div>
              </div>
              <div className="text-center p-4 bg-gradient-to-br from-green-500/10 to-blue-500/10 rounded-lg border border-green-500/20">
                <div className="text-xl font-bold text-green-400">{formatCurrency(room.budget_per_team)}</div>
                <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Budget</div>
              </div>
              <div className="text-center p-4 bg-gradient-to-br from-yellow-500/10 to-orange-500/10 rounded-lg border border-yellow-500/20">
                <div className="text-xl font-bold text-yellow-400">{room.players_per_team}</div>
                <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Players/Team</div>
              </div>
            </div>
          </div>

          {error && (
            <div className="alert alert-error mb-6">
              <p>{error}</p>
            </div>
          )}

          {/* Team Selection */}
          <div className="space-y-6">
            <h3 className="text-xl font-bold text-center">Choose Your Team</h3>
            <div className="grid grid-4 gap-4">
              {availableTeams.map((team) => (
                <button
                  key={team.id}
                  onClick={() => team.available && setSelectedTeam(team.id)}
                  disabled={!team.available || joining}
                  className={`card-sm transition-all rounded-lg p-4 ${
                    selectedTeam === team.id
                      ? 'ring-2 ring-green-500 bg-green-500/10'
                      : team.available
                      ? 'hover:bg-surface-secondary'
                      : 'opacity-75 cursor-not-allowed bg-red-500/10 border border-red-500/20'
                  }`}
                >
                  <div className="text-center">
                    <div className="mb-3 flex justify-center">
                      <FranchiseLogo franchiseCode={team.short_name} size="lg" />
                    </div>
                    <div className={`font-bold ${team.available ? '' : 'text-gray-400'}`}>
                      {team.short_name}
                    </div>
                    <div className={`text-sm ${team.available ? 'text-muted' : 'text-gray-500'}`}>
                      {team.city}
                    </div>
                    {!team.available && (
                      <div className="text-xs text-red-400 mt-2 font-medium">
                        {team.takenBy ? `Taken by ${team.takenBy}` : 'Taken'}
                      </div>
                    )}
                    {selectedTeam === team.id && team.available && (
                      <div className="mt-2">
                        <CheckCircle className="w-5 h-5 text-green-500 mx-auto" />
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>

            <div className="flex gap-4 max-w-md mx-auto">
              <button
                onClick={() => router.push('/dashboard')}
                className="btn btn-secondary flex-1"
                disabled={joining}
              >
                Cancel
              </button>
              <button
                onClick={joinAuction}
                disabled={!selectedTeam || joining}
                className="btn btn-primary flex-1"
              >
                {joining ? (
                  <>
                    <div className="spinner-sm"></div>
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
