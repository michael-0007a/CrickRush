'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Plus, Users, Clock, Trophy, Settings, LogOut, Zap, Target, Play, Crown, ChevronDown, User, Calendar, Star, Trash2, DoorOpen } from 'lucide-react';

interface UserProfile {
  id: string;
  full_name?: string;
  phone?: string;
  avatar_url?: string;
}

interface AuctionRoom {
  id: string;
  room_key: string;
  name: string;
  status: 'waiting' | 'active' | 'paused' | 'completed';
  created_at: string;
  creator_id: string;
  budget_per_team: number;
  players_per_team: number;
}

interface AuctionParticipant {
  id: string;
  auction_room_id: string;
  user_id: string;
  team_id: string;
  joined_at: string;
  auction_room: AuctionRoom;
}

interface DashboardStats {
  createdAuctions: number;
  participatedAuctions: number;
  totalAuctions: number;
  completedAuctions: number;
}

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authInitialized, setAuthInitialized] = useState(false);
  const [stats, setStats] = useState<DashboardStats>({
    createdAuctions: 0,
    participatedAuctions: 0,
    totalAuctions: 0,
    completedAuctions: 0
  });
  const [createdAuctions, setCreatedAuctions] = useState<AuctionRoom[]>([]);
  const [participatedAuctions, setParticipatedAuctions] = useState<AuctionParticipant[]>([]);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const [roomKey, setRoomKey] = useState('');
  const [joiningRoom, setJoiningRoom] = useState(false);

  useEffect(() => {
    let authListener: any = null;
    let timeoutId: any = null;

    const setupAuth = async () => {
      // Check if we have OAuth tokens in URL hash (direct from Google)
      if (window.location.hash.includes('access_token')) {
        try {
          // Extract tokens from hash
          const hashParams = new URLSearchParams(window.location.hash.substring(1));
          const accessToken = hashParams.get('access_token');
          const refreshToken = hashParams.get('refresh_token');

          if (accessToken && refreshToken) {
            const { data, error } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken
            });

            if (error) {
              router.push('/auth');
              return;
            }

            if (data.session) {
              // Clean up URL
              window.history.replaceState({}, document.title, '/dashboard');

              setUser(data.session.user);
              await loadUserProfile(data.session.user.id);
              await loadDashboardData(data.session.user.id);
              setAuthInitialized(true);
              setLoading(false);
              return;
            }
          }
        } catch (oauthError) {
          router.push('/auth');
          return;
        }
      }

      // Set up auth listener for other auth events
      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          if (session?.user) {
            setUser(session.user);
            await loadUserProfile(session.user.id);
            await loadDashboardData(session.user.id);
            setAuthInitialized(true);
            setLoading(false);

            if (timeoutId) {
              clearTimeout(timeoutId);
              timeoutId = null;
            }
          }
        }
      });

      authListener = subscription;

      // Check for existing session
      const { data: { session } } = await supabase.auth.getSession();

      if (session?.user) {
        setUser(session.user);
        await loadUserProfile(session.user.id);
        await loadDashboardData(session.user.id);
        setAuthInitialized(true);
        setLoading(false);
      } else {
        // Wait for OAuth to complete
        timeoutId = setTimeout(() => {
          if (!user) {
            setAuthInitialized(true);
            setLoading(false);
            router.push('/auth');
          }
        }, 8000);
      }
    };

    setupAuth();

    return () => {
      if (authListener) {
        authListener.unsubscribe();
      }
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, []);

  const loadUserProfile = async (userId: string) => {
    try {
      const { data: profile, error } = await supabase
        .from('users_profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error && error.code === 'PGRST116') {
        // Profile doesn't exist, create one
        const newProfile = {
          id: userId,
          full_name: user?.user_metadata?.full_name || '',
          avatar_url: user?.user_metadata?.avatar_url || '',
          phone: null,
          date_of_birth: null
        };

        const { data: createdProfile } = await supabase
          .from('users_profiles')
          .insert(newProfile)
          .select()
          .single();

        setUserProfile(createdProfile);
      } else if (profile) {
        setUserProfile(profile);
      }
    } catch (error) {
      console.error('Error loading user profile:', error);
    }
  };

  const loadDashboardData = async (userId: string) => {
    setLoading(true);
    try {
      // Load created auctions - show waiting, active, and paused (exclude completed)
      const { data: createdAuctionsData, error: createdError } = await supabase
        .from('auction_rooms')
        .select('*')
        .eq('creator_id', userId)
        .in('status', ['waiting', 'active', 'paused'])
        .order('created_at', { ascending: false });

      if (!createdError) {
        setCreatedAuctions(createdAuctionsData || []);
      }

      // Load participated auctions - show waiting, active, and paused (exclude completed)
      const { data: participatedAuctionsData, error: participatedError } = await supabase
        .from('auction_participants')
        .select(`
          *,
          auction_room:auction_rooms!inner(*)
        `)
        .eq('user_id', userId)
        .in('auction_room.status', ['waiting', 'active', 'paused'])
        .order('joined_at', { ascending: false });

      if (!participatedError) {
        setParticipatedAuctions(participatedAuctionsData || []);
      }

      // Calculate stats - exclude completed ones from active counts
      const createdCount = createdAuctionsData?.length || 0;
      const participatedCount = participatedAuctionsData?.length || 0;
      const totalCount = createdCount + participatedCount;

      // For completed count, get all completed auctions
      const { data: allCreatedAuctions } = await supabase
        .from('auction_rooms')
        .select('*')
        .eq('creator_id', userId);

      const { data: allParticipatedAuctions } = await supabase
        .from('auction_participants')
        .select(`
          *,
          auction_room:auction_rooms!inner(*)
        `)
        .eq('user_id', userId);

      const completedCount = (allCreatedAuctions?.filter(a => a.status === 'completed').length || 0) +
                           (allParticipatedAuctions?.filter(p => p.auction_room.status === 'completed').length || 0);

      setStats({
        createdAuctions: createdCount,
        participatedAuctions: participatedCount,
        totalAuctions: totalCount,
        completedAuctions: completedCount
      });

    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomKey.trim() || joiningRoom) return;

    setJoiningRoom(true);
    try {
      // Check if room exists
      const { data: room, error } = await supabase
        .from('auction_rooms')
        .select('*')
        .eq('room_key', roomKey.trim().toUpperCase())
        .single();

      if (error || !room) {
        alert('Room not found. Please check the room key and try again.');
        setJoiningRoom(false);
        return;
      }

      // Check if user is already a participant
      const { data: existingParticipant } = await supabase
        .from('auction_participants')
        .select('*')
        .eq('auction_room_id', room.id)
        .eq('user_id', user.id)
        .single();

      if (existingParticipant) {
        // User already joined - go directly to auction room
        setShowJoinModal(false);
        setRoomKey('');
        router.push(`/auction/${room.room_key}`);
        return;
      }

      // Check if user is the auctioneer
      if (room.creator_id === user.id) {
        // User is the auctioneer - go directly to auction room
        setShowJoinModal(false);
        setRoomKey('');
        router.push(`/auction/${room.room_key}`);
        return;
      }

      // User needs to join - redirect to join page
      setShowJoinModal(false);
      setRoomKey('');
      router.push(`/auction/join?roomKey=${roomKey.trim().toUpperCase()}`);
    } catch (error) {
      console.error('Error joining room:', error);
      alert('Error joining room. Please try again.');
    } finally {
      setJoiningRoom(false);
    }
  };

  const handleEndAuction = async (auctionId: string, auctionName: string) => {
    if (!confirm(`Are you sure you want to end and delete the auction "${auctionName}"? This action cannot be undone and will remove all participants from the room.`)) {
      return;
    }

    try {
      console.log('Ending auction with soft delete approach for ID:', auctionId);

      // Instead of using 'deleted', use 'completed' status which is likely allowed
      const { error: updateError } = await supabase
        .from('auction_rooms')
        .update({
          status: 'completed'
        })
        .eq('id', auctionId);

      if (updateError) {
        console.error('Error marking auction as completed:', updateError);
        throw updateError;
      }

      // Also mark auction state as inactive
      await supabase
        .from('auction_state')
        .update({
          is_active: false,
          is_paused: true
        })
        .eq('room_id', auctionId);

      console.log('Auction marked as completed successfully');
      alert('Auction ended successfully!');

      // Force refresh the dashboard data
      await loadDashboardData(user.id);

    } catch (error) {
      console.error('Error ending auction:', error);
      alert('Failed to end auction: ' + (error as Error).message);
    }
  };

  const handleExitAuction = async (participationId: string, auctionName: string) => {
    if (!confirm(`Are you sure you want to exit the auction "${auctionName}"?`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('auction_participants')
        .delete()
        .eq('id', participationId);

      if (error) throw error;

      alert('Successfully exited the auction!');

      // Refresh the dashboard data
      await loadDashboardData(user.id);

    } catch (error) {
      console.error('Error exiting auction:', error);
      alert('Failed to exit auction: ' + (error as Error).message);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'waiting': return 'var(--accent-yellow)';
      case 'active': return 'var(--accent-green)';
      case 'paused': return 'var(--accent-orange)';
      case 'completed': return 'var(--text-muted)';
      default: return 'var(--text-muted)';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'waiting': return 'Waiting';
      case 'active': return 'Live';
      case 'paused': return 'Paused';
      case 'completed': return 'Completed';
      default: return status;
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

  // Show loading while auth is initializing
  if (!authInitialized || loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
        <p style={{ color: 'var(--text-muted)' }}>
          {!authInitialized ? 'Initializing...' : 'Loading dashboard...'}
        </p>
      </div>
    );
  }

  // Redirect if not authenticated
  if (!user) {
    console.log('❌ No user, should redirect to auth');
    return null;
  }

  console.log('🎉 Rendering dashboard for:', user.email);

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
                    src={userProfile?.avatar_url || user?.user_metadata?.avatar_url || 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?ixlib=rb-1.2.1&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80'}
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
                          {userProfile?.full_name || user?.user_metadata?.full_name || 'User'}
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

      {/* Join Modal */}
      {showJoinModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 50,
        }}>
          <div className="card card-lg" style={{ maxWidth: '28rem', width: '90%' }}>
            <div className="text-center mb-6">
              <div className="feature-icon mb-4" style={{ background: 'linear-gradient(135deg, var(--accent-green) 0%, #10b981 100%)', width: '4rem', height: '4rem', margin: '0 auto' }}>
                <Target className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-2xl font-bold mb-2">Join Auction</h2>
              <p style={{ color: 'var(--text-muted)' }}>
                Enter the 6-digit room code to join an auction
              </p>
            </div>

            <form onSubmit={handleJoinRoom} className="space-y-6">
              <div>
                <label className="form-label">
                  Room Code
                </label>
                <input
                  type="text"
                  value={roomKey}
                  onChange={(e) => setRoomKey(e.target.value.toUpperCase())}
                  placeholder="Enter 6-digit room code"
                  className="form-input text-center font-mono text-lg"
                  maxLength={6}
                  required
                />
              </div>

              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowJoinModal(false);
                    setRoomKey('');
                  }}
                  className="btn btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!roomKey.trim() || joiningRoom}
                  className="btn btn-primary flex-1"
                >
                  {joiningRoom ? (
                    <>
                      <div className="spinner-sm"></div>
                      Joining...
                    </>
                  ) : (
                    <>
                      <Target className="w-4 h-4 mr-2" />
                      Join Auction
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="container section fade-in">
        {/* Welcome Section */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-4">
            Welcome back, {userProfile?.full_name || 'Champion'}! 🏆
          </h1>
          <p className="text-xl" style={{ color: 'var(--text-muted)' }}>
            Ready to build your dream IPL team?
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-4 gap-6 mb-8">
          <div className="card stat-card slide-up">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Trophy className="w-6 h-6" style={{ color: 'var(--text-muted)' }} />
                <p className="stat-label">Total Auctions</p>
              </div>
              <h3 className="stat-number">{stats.totalAuctions}</h3>
            </div>
          </div>

          <div className="card stat-card slide-up" style={{ animationDelay: '0.1s' }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Crown className="w-6 h-6" style={{ color: 'var(--text-muted)' }} />
                <p className="stat-label">Created</p>
              </div>
              <h3 className="stat-number">{stats.createdAuctions}</h3>
            </div>
          </div>

          <div className="card stat-card slide-up" style={{ animationDelay: '0.2s' }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Users className="w-6 h-6" style={{ color: 'var(--text-muted)' }} />
                <p className="stat-label">Participated</p>
              </div>
              <h3 className="stat-number">{stats.participatedAuctions}</h3>
            </div>
          </div>

          <div className="card stat-card slide-up" style={{ animationDelay: '0.3s' }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Star className="w-6 h-6" style={{ color: 'var(--text-muted)' }} />
                <p className="stat-label">Completed</p>
              </div>
              <h3 className="stat-number">{stats.completedAuctions}</h3>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-2 gap-6 mb-8">
          <div className="card card-lg slide-up" style={{ animationDelay: '0.4s' }}>
            <div className="text-center">
              <div className="feature-icon mb-4" style={{ background: 'linear-gradient(135deg, var(--primary-purple) 0%, var(--primary-cyan) 100%)' }}>
                <Plus className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-xl font-bold mb-2">Start New Auction</h3>
              <p className="mb-6" style={{ color: 'var(--text-muted)' }}>
                Create your own IPL auction room and invite friends to join the fun!
              </p>
              <button
                onClick={() => router.push('/auction/create')}
                className="btn btn-primary btn-lg w-full"
              >
                <Plus className="w-5 h-5" />
                Create Auction Room
              </button>
            </div>
          </div>

          <div className="card card-lg slide-up" style={{ animationDelay: '0.5s' }}>
            <div className="text-center">
              <div className="feature-icon mb-4" style={{ background: 'linear-gradient(135deg, var(--accent-green) 0%, #10b981 100%)' }}>
                <Target className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-xl font-bold mb-2">Join Auction</h3>
              <p className="mb-6" style={{ color: 'var(--text-muted)' }}>
                Enter a room key to join an existing auction and start bidding!
              </p>
              <button
                onClick={() => setShowJoinModal(true)}
                className="btn btn-secondary btn-lg w-full"
              >
                <Target className="w-5 h-5" />
                Join Auction Room
              </button>
            </div>
          </div>
        </div>

        {/* Recent Auctions */}
        <div className="grid grid-2 gap-8">
          {/* Created Auctions */}
          <div className="slide-up" style={{ animationDelay: '0.6s' }}>
            <div className="card card-lg">
              <div className="flex items-center gap-3 mb-6">
                <Crown className="w-6 h-6" style={{ color: 'var(--accent-green)' }} />
                <h2 className="text-2xl font-bold">Your Auctions</h2>
              </div>

              {createdAuctions.length === 0 ? (
                <div className="text-center py-8">
                  <div className="feature-icon mb-4" style={{ background: 'var(--surface-secondary)' }}>
                    <Crown className="w-6 h-6" style={{ color: 'var(--text-muted)' }} />
                  </div>
                  <p style={{ color: 'var(--text-muted)' }}>No auctions created yet</p>
                  <button
                    onClick={() => router.push('/auction/create')}
                    className="btn btn-primary btn-sm mt-4"
                  >
                    Create Your First Auction
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {createdAuctions.slice(0, 3).map((auction) => (
                    <div key={auction.id} className="auction-card">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-semibold">{auction.name}</h4>
                          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                            Room Key: {auction.room_key}
                          </p>
                          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                            Created {new Date(auction.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="text-right">
                          <span
                            className="status-badge"
                            style={{ backgroundColor: getStatusColor(auction.status) }}
                          >
                            {getStatusText(auction.status)}
                          </span>
                          <div className="flex gap-2 mt-4">
                            <button
                              onClick={() => router.push(`/auction/${auction.room_key}`)}
                              className="btn btn-primary btn-sm"
                            >
                              <Play className="w-4 h-4" />
                              Manage
                            </button>
                            <button
                              onClick={() => handleEndAuction(auction.id, auction.name)}
                              className="btn btn-danger btn-sm"
                              title="End and delete auction"
                            >
                              <Trash2 className="w-4 h-4" />
                              End
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Participated Auctions */}
          <div className="slide-up" style={{ animationDelay: '0.7s' }}>
            <div className="card card-lg">
              <div className="flex items-center gap-3 mb-6">
                <Users className="w-6 h-6" style={{ color: 'var(--accent-yellow)' }} />
                <h2 className="text-2xl font-bold">Joined Auctions</h2>
              </div>

              {participatedAuctions.length === 0 ? (
                <div className="text-center py-8">
                  <div className="feature-icon mb-4" style={{ background: 'var(--surface-secondary)' }}>
                    <Users className="w-6 h-6" style={{ color: 'var(--text-muted)' }} />
                  </div>
                  <p style={{ color: 'var(--text-muted)' }}>No auctions joined yet</p>
                  <button
                    onClick={() => setShowJoinModal(true)}
                    className="btn btn-secondary btn-sm mt-4"
                  >
                    Join Your First Auction
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {participatedAuctions.slice(0, 3).map((participation) => (
                    <div key={participation.id} className="auction-card">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-semibold">{participation.auction_room.name}</h4>
                          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                            Room Key: {participation.auction_room.room_key}
                          </p>
                          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                            Joined {new Date(participation.joined_at).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="text-right">
                          <span
                            className="status-badge"
                            style={{ backgroundColor: getStatusColor(participation.auction_room.status) }}
                          >
                            {getStatusText(participation.auction_room.status)}
                          </span>
                          <div className="flex gap-2 mt-4">
                            <button
                              onClick={() => router.push(`/auction/${participation.auction_room.room_key}`)}
                              className="btn btn-secondary btn-sm"
                            >
                              <Play className="w-4 h-4" />
                              Enter
                            </button>
                            <button
                              onClick={() => handleExitAuction(participation.id, participation.auction_room.name)}
                              className="btn btn-danger btn-sm"
                              title="Exit auction"
                            >
                              <DoorOpen className="w-4 h-4" />
                              Exit
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
