/**
 * @fileoverview Live Auction Client Component
 * Contains the main auction room logic with useParams() hook
 */
'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useAuctionRealtime } from '@/hooks/useAuctionRealtime';
import { useMySquad } from '@/hooks/useMySquad';
import FranchiseLogo from '@/components/FranchiseLogo';
import {
  Trophy, Users, Pause, Play, SkipForward, LogOut,
  Crown, Timer, User, ChevronDown, Trash2
} from 'lucide-react';
import BiddingHistory from '@/components/BiddingHistory';

interface AuctionRoom {
  id: string;
  room_key: string;
  name: string;
  creator_id: string;
  status: string;
  max_participants: number;
  budget_per_team: number;
  players_per_team: number;
  timer_seconds: number;
}

interface UserProfile {
  id: string;
  full_name?: string;
  phone?: string;
  avatar_url?: string;
}

interface User {
  id: string;
  email?: string;
  user_metadata?: {
    full_name?: string;
    avatar_url?: string;
  };
}

interface IPLTeam {
  id: string;
  name: string;
  short_name: string;
  color: string;
  logo: string;
  city: string;
  available?: boolean;
}

interface Participant {
  id: string;
  user_id: string;
  team_id: string;
  team_short_name?: string;
  budget_remaining: number;
  players_count: number;
  is_auctioneer: boolean;
}

export default function LiveAuctionClient() {
  const params = useParams();
  const router = useRouter();
  const roomKey = params.roomKey as string;
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [room, setRoom] = useState<AuctionRoom | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuctioneer, setIsAuctioneer] = useState(false);

  // UI state
  const [showTeamSelector, setShowTeamSelector] = useState(false);
  const [availableTeams, setAvailableTeams] = useState<IPLTeam[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<string>('');
  const [showCustomBid, setShowCustomBid] = useState(false);
  const [customBidAmount, setCustomBidAmount] = useState('');
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);

  // Use the enhanced real-time hook for complete synchronization
  const {
    auctionState,
    participants,
    recentBids,
    loading: auctionLoading,
    error: auctionError,
    isConnected,
    auctionControls,
    biddingActions,
    refresh
  } = useAuctionRealtime(room?.id || '', user?.id || null);

  // Get myParticipant from participants
  const myParticipant = participants.find(p => p.user_id === user?.id);

  const {
    myPlayers,
    addPlayer
  } = useMySquad(room?.id || '', myParticipant?.id || null);

  // Initialize app
  useEffect(() => {
    const initializeApp = async () => {
      try {
        setLoading(true);

        // Get user session with error handling for expired tokens
        let session;
        try {
          const { data: { session: userSession }, error: sessionError } = await supabase.auth.getSession();

          if (sessionError) {
            // If there's an auth error (like invalid refresh token), redirect to login
            if (sessionError.message?.includes('Refresh Token') || sessionError.message?.includes('Invalid')) {
              router.push('/auth');
              return;
            }
          }

          session = userSession;
        } catch (authError) {
          // Catch any other auth-related errors and redirect to login
          router.push('/auth');
          return;
        }

        if (!session?.user) {
          router.push('/auth');
          return;
        }

        setUser(session.user);

        // Load user profile
        const { data: profile } = await supabase
          .from('users_profiles')
          .select('*')
          .eq('id', session.user.id)
          .single();
        setUserProfile(profile);

        // Load room
        const { data: roomData, error: roomError } = await supabase
          .from('auction_rooms')
          .select('*')
          .eq('room_key', roomKey.toUpperCase())
          .single();

        if (roomError || !roomData) {
          router.push('/dashboard');
          return;
        }

        // Check if auction has ended
        if (roomData.status === 'completed') {
          // Show ended auction message for both auctioneer and participants
          setRoom(roomData);
          setLoading(false);
          return;
        }

        setRoom(roomData);
        setIsAuctioneer(roomData.creator_id === session.user.id);

      } catch (error) {
        router.push('/dashboard');
      } finally {
        setLoading(false);
      }
    };

    initializeApp();
  }, [roomKey, router]);

  // Calculate time remaining for display
  const timeRemaining = auctionState?.time_remaining || 0;
  const isRunning = auctionState?.is_active && !auctionState?.is_paused;

  // Handle team selection
  const handleTeamSelection = async (teamId: string) => {
    if (!room?.id || !user?.id) return;

    try {
      const { error } = await supabase
        .from('auction_participants')
        .update({ team_id: teamId })
        .eq('auction_room_id', room.id)
        .eq('user_id', user.id);

      if (error) {
        console.error('Error updating team:', error);
        return;
      }

      setShowTeamSelector(false);
      refresh(); // Force refresh to update data
    } catch (error) {
      console.error('Error updating team:', error);
    }
  };

  // Handle bidding
  const handleBid = async (amount: number) => {
    if (!myParticipant || !auctionState?.current_player) return;

    try {
      await biddingActions.placeBid(amount);
      setShowCustomBid(false);
      setCustomBidAmount('');
    } catch (error) {
      console.error('Error placing bid:', error);
    }
  };

  // Handle auction controls
  const handleStartAuction = async () => {
    try {
      await auctionControls.startAuction();
    } catch (error) {
      console.error('Error starting auction:', error);
    }
  };

  const handlePauseAuction = async () => {
    try {
      await auctionControls.pauseAuction();
    } catch (error) {
      console.error('Error pausing auction:', error);
    }
  };

  const handleResumeAuction = async () => {
    try {
      await auctionControls.resumeAuction();
    } catch (error) {
      console.error('Error resuming auction:', error);
    }
  };

  const handleNextPlayer = async () => {
    try {
      await auctionControls.nextPlayer();
    } catch (error) {
      console.error('Error moving to next player:', error);
    }
  };

  const handleAddTime = async (seconds: number) => {
    try {
      await auctionControls.addTime(seconds);
    } catch (error) {
      console.error('Error adding time:', error);
    }
  };

  // Bidding functions
  const handleQuickBid = async () => {
    if (!auctionState?.current_player || !myParticipant) {
      alert('Cannot place bid at this time');
      return;
    }

    try {
      const amount = auctionState.current_bid === 0
        ? auctionState.current_player.base_price
        : auctionState.current_bid + (auctionState.current_bid < 200 ? 25 : 100);

      await biddingActions.placeBid(amount);
    } catch (error) {
      console.error('Error placing bid:', error);
      alert('Failed to place bid: ' + (error as Error).message);
    }
  };

  const handleCustomBid = async () => {
    const amount = parseInt(customBidAmount);
    if (isNaN(amount) || amount <= 0) {
      alert('Please enter a valid bid amount');
      return;
    }

    if (!auctionState?.current_player || !myParticipant) {
      alert('Cannot place bid at this time');
      return;
    }

    try {
      await biddingActions.placeBid(amount);
      setCustomBidAmount('');
      setShowCustomBid(false);
    } catch (error) {
      console.error('Error placing bid:', error);
      alert('Failed to place bid: ' + (error as Error).message);
    }
  };

  // Auctioneer functions
  const startAuction = async () => {
    if (!isAuctioneer) {
      alert('Only the auctioneer can start the auction');
      return;
    }

    try {
      await auctionControls.startAuction();
    } catch (error) {
      console.error('Error starting auction:', error);
      alert('Failed to start auction: ' + (error as Error).message);
    }
  };

  const pauseAuction = async () => {
    if (!isAuctioneer) return;

    try {
      await auctionControls.pauseAuction();
    } catch (error) {
      console.error('Error pausing auction:', error);
    }
  };

  const resumeAuction = async () => {
    if (!isAuctioneer) return;

    try {
      await auctionControls.resumeAuction();
    } catch (error) {
      console.error('Error resuming auction:', error);
    }
  };

  const sellPlayer = async () => {
    if (!isAuctioneer || !auctionState?.current_player) {
      alert('Only the auctioneer can sell players');
      return;
    }

    if (!auctionState.leading_team || auctionState.current_bid <= 0) {
      alert('No valid bidder found');
      return;
    }

    try {
      // Find the leading participant
      const leadingParticipant = participants.find(p => p.team_id === auctionState.leading_team);
      if (!leadingParticipant) {
        alert('Leading participant not found');
        return;
      }

      // Update participant budget
      const { error: budgetError } = await supabase
        .from('auction_participants')
        .update({
          budget_remaining: leadingParticipant.budget_remaining - auctionState.current_bid
        })
        .eq('id', leadingParticipant.id);

      if (budgetError) {
        console.error('Error updating participant budget:', budgetError);
        alert('Warning: Could not update participant budget');
      }

      alert(`Player sold to ${leadingParticipant.team_short_name} for ${formatCurrency(auctionState.current_bid)}!`);

      // Move to next player
      await handleNextPlayer();
    } catch (error) {
      console.error('Error selling player:', error);
      alert('Failed to sell player: ' + (error as Error).message);
    }
  };

  const moveToNextPlayer = async () => {
    if (!isAuctioneer) return;

    try {
      await auctionControls.nextPlayer();
    } catch (error) {
      console.error('Error moving to next player:', error);
      alert('Failed to move to next player: ' + (error as Error).message);
    }
  };

  const endAuction = async () => {
    if (!isAuctioneer || !room) {
      alert('Only the auctioneer can end the auction');
      return;
    }

    if (!confirm(`Are you sure you want to end the auction "${room.name}"? This action cannot be undone.`)) {
      return;
    }

    try {
      // Mark auction as completed
      const { error: updateError } = await supabase
        .from('auction_rooms')
        .update({
          status: 'completed'
        })
        .eq('id', room.id);

      if (updateError) {
        throw updateError;
      }

      // Also mark auction state as inactive
      await supabase
        .from('auction_state')
        .update({
          is_active: false,
          is_paused: true
        })
        .eq('room_id', room.id);

      alert('Auction ended successfully! Redirecting to dashboard...');
      router.push('/dashboard');
    } catch (error) {
      alert('Failed to end auction: ' + (error as Error).message);
    }
  };

  const addTime = async (seconds: number) => {
    if (!isAuctioneer) return;

    try {
      await auctionControls.addTime(seconds);
    } catch (error) {
      console.error('Error adding time:', error);
    }
  };

  // Format currency helper - Fixed for lakh-based system
  const formatCurrency = (amount: number) => {
    if (!amount || amount === 0) return '₹0L';

    if (amount >= 100) { // 100L = 1 Crore
      const crores = amount / 100;
      return crores % 1 === 0 ? `₹${crores}Cr` : `₹${crores.toFixed(1)}Cr`;
    } else {
      return amount % 1 === 0 ? `₹${amount}L` : `₹${amount.toFixed(1)}L`;
    }
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
      router.push('/auth');
    } catch (error) {
      // Handle error silently
    }
  };

  // Handle non-participant users
  if (!loading && !auctionLoading && room && user && !myParticipant && !isAuctioneer) {
    return (
      <div>
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
              <Users className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-4xl font-bold mb-4">Access Denied</h1>
            <p className="text-xl mb-8" style={{ color: 'var(--text-muted)' }}>
              You are not a participant in this auction room.
            </p>
            <p className="mb-8" style={{ color: 'var(--text-muted)' }}>
              Please join the auction first using the join link provided by the auctioneer.
            </p>
            <button
              onClick={() => router.push('/dashboard')}
              className="btn btn-primary btn-lg"
            >
              Back to Dashboard
            </button>
          </div>
        </main>
      </div>
    );
  }

  if (loading || auctionLoading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
        <p style={{ color: 'var(--text-muted)' }}>Loading auction...</p>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="loading">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Auction Room Not Found</h1>
          <p style={{ color: 'var(--text-muted)' }} className="mb-6">
            The auction room you&apos;re looking for doesn&apos;t exist or has been removed.
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

  // Show auction ended message if auction is completed
  if (room.status === 'completed') {
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

        {/* Auction Ended Message */}
        <main className="container section">
          <div className="text-center">
            <div className="feature-icon mb-6" style={{ background: 'linear-gradient(135deg, var(--accent-red) 0%, #ef4444 100%)', width: '5rem', height: '5rem', margin: '0 auto' }}>
              <Trophy className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-4xl font-bold mb-4">Auction Has Ended</h1>
            <p className="text-xl mb-8" style={{ color: 'var(--text-muted)' }}>
              The auction &quot;{room.name}&quot; has been completed and is no longer active.
            </p>

            <div className="card card-lg max-w-2xl mx-auto mb-8">
              <div className="text-center">
                <h2 className="text-2xl font-bold mb-4">{room.name}</h2>
                <div className="grid grid-2 gap-4 mb-6">
                  <div className="text-center p-4 bg-gradient-to-br from-red-500/10 to-pink-500/10 rounded-lg border border-red-500/20">
                    <div className="text-2xl font-bold text-red-400">ENDED</div>
                    <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Status</div>
                  </div>
                  <div className="text-center p-4 bg-gradient-to-br from-blue-500/10 to-purple-500/10 rounded-lg border border-blue-500/20">
                    <div className="text-2xl font-bold text-blue-400">{room.room_key}</div>
                    <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Room Code</div>
                  </div>
                </div>

                <div className="text-center mb-6">
                  <p style={{ color: 'var(--text-muted)' }}>
                    {isAuctioneer
                      ? "As the auctioneer, you have ended this auction."
                      : "This auction has been completed by the auctioneer."}
                  </p>
                  <p className="mt-2" style={{ color: 'var(--text-muted)' }}>
                    Thank you for participating! You can create or join another auction from your dashboard.
                  </p>
                </div>
              </div>
            </div>

            <button
              onClick={() => router.push('/dashboard')}
              className="btn btn-primary btn-lg"
            >
              Back to Dashboard
            </button>
          </div>
        </main>
      </div>
    );
  }

  // For brevity, I'm showing the basic structure - the full component would include all the auction functionality
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


      {/* Main Content */}
      <main className="container section">
        {/* Auction Header */}
        <div className="card mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold">{room.name}</h1>
              <p style={{ color: 'var(--text-muted)' }}>
                Room Code: <span className="font-mono font-bold">{room.room_key}</span>
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold">{participants.length}</div>
                <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Teams</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">{formatCurrency(room.budget_per_team)}</div>
                <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Budget</div>
              </div>
              {isAuctioneer && (
                <Crown className="w-6 h-6" style={{ color: 'var(--accent-yellow)' }} />
              )}
            </div>
          </div>

          {/* Auction Status */}
          <div className="flex items-center gap-4">
            <div className={`status-badge ${auctionState?.is_active ? 'success' : 'default'}`}>
              {auctionState?.is_active ? (auctionState.is_paused ? 'Paused' : 'Live') : 'Waiting'}
            </div>
            {auctionState?.is_active && (
              <div className="flex items-center gap-2">
                <Timer className="w-4 h-4" />
                <span className={`font-mono font-bold text-lg ${timeRemaining <= 10 ? 'text-red-400' : timeRemaining <= 30 ? 'text-yellow-400' : 'text-green-400'}`}>
                  {Math.floor(timeRemaining / 60)}:{(timeRemaining % 60).toString().padStart(2, '0')}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-3 gap-6">
          {/* Current Player Card */}
          <div className="col-span-2">
            <div className="card">
              <div
                style={{
                  display: 'block',
                  width: '100%',
                  marginBottom: '1.5rem',
                  textAlign: 'left'
                }}
              >
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  float: 'left',
                  clear: 'both'
                }}>
                  <div
                    style={{
                      background: 'linear-gradient(135deg, var(--primary-purple) 0%, var(--primary-cyan) 100%)',
                      width: '2.5rem',
                      height: '2.5rem',
                      borderRadius: '0.5rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    <Trophy className="w-5 h-5 text-white" />
                  </div>
                  <h2
                    style={{
                      fontSize: '1.25rem',
                      fontWeight: 'bold',
                      margin: 0,
                      color: 'var(--text-primary)'
                    }}
                  >
                    Current Player
                  </h2>
                </div>
                <div style={{ clear: 'both' }}></div>
              </div>

              {auctionState?.current_player ? (
                <div className="space-y-6">
                  {/* Player Info Card */}
                  <div className="bg-gradient-to-r from-purple-500/10 to-cyan-500/10 border border-purple-500/20 rounded-xl p-6">
                    <div className="grid grid-2 gap-8 items-start">
                      {/* Player Details */}
                      <div className="space-y-4">
                        <div className="text-3xl font-bold text-white mb-3">
                          {auctionState.current_player.name}
                        </div>

                        <div className="grid gap-3">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>Role:</span>
                            <span style={{ padding: '6px 12px', backgroundColor: 'rgba(59, 130, 246, 0.2)', color: 'rgb(96, 165, 250)', borderRadius: '9999px', fontSize: '0.875rem', fontWeight: '500', border: '1px solid rgba(59, 130, 246, 0.3)' }}>
                              {auctionState.current_player.role}
                            </span>
                          </div>

                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>Country:</span>
                            <span className="text-sm font-medium text-white">{auctionState.current_player.country}</span>
                          </div>

                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>Base Price:</span>
                            <span className="text-sm font-bold text-yellow-400">{formatCurrency(auctionState.current_player.base_price)}</span>
                          </div>
                        </div>
                      </div>

                      {/* Current Bid Display */}
                      <div className="text-center bg-gradient-to-br from-green-500/10 to-emerald-500/10 border border-green-500/20 rounded-lg p-6">
                        <div className="text-sm font-medium mb-2" style={{ color: 'var(--text-muted)' }}>Current Bid</div>
                        <div className="text-4xl font-bold mb-3" style={{ color: 'var(--accent-green)' }}>
                          {formatCurrency(auctionState.current_bid || auctionState.current_player.base_price)}
                        </div>
                        {auctionState.leading_team && (
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '8px 16px', backgroundColor: 'rgba(34, 197, 94, 0.2)', color: 'rgb(74, 222, 128)', borderRadius: '9999px', fontSize: '0.875rem', fontWeight: '500', border: '1px solid rgba(34, 197, 94, 0.3)' }}>
                            <Crown className="w-4 h-4" />
                            {participants.find(p => p.team_id === auctionState.leading_team)?.team_short_name}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Bidding Controls */}
                  {myParticipant && auctionState.is_active && !auctionState.is_paused && timeRemaining > 0 && isRunning && (
                    <div className="space-y-4">
                      <div className="flex gap-4">
                        <button
                          onClick={handleQuickBid}
                          className="btn btn-primary flex-1 text-lg py-3"
                          style={{ background: 'linear-gradient(135deg, var(--primary-blue) 0%, var(--primary-purple) 100%)' }}
                        >
                          Quick Bid ({formatCurrency(auctionState.current_bid === 0
                            ? auctionState.current_player.base_price
                            : auctionState.current_bid + (auctionState.current_bid < 200 ? 25 : 100))})
                        </button>
                        <button
                          onClick={() => setShowCustomBid(!showCustomBid)}
                          className="btn btn-secondary px-6 py-3"
                        >
                          Custom Bid
                        </button>
                      </div>

                      {showCustomBid && (
                        <div className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/20 rounded-lg p-4">
                          <div className="flex gap-3">
                            <div className="flex-1">
                              <input
                                type="number"
                                value={customBidAmount}
                                onChange={(e) => setCustomBidAmount(e.target.value)}
                                placeholder="Enter bid amount"
                                className="form-input w-full"
                                min={auctionState.current_bid + 1}
                              />
                            </div>
                            <button
                              onClick={handleCustomBid}
                              className="btn btn-primary px-6"
                            >
                              Place Bid
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Show message when bidding is not available */}
                  {myParticipant && auctionState.is_active && (timeRemaining <= 0 || !isRunning || auctionState.is_paused) && (
                    <div className="bg-gradient-to-r from-red-500/10 to-orange-500/10 border border-red-500/20 rounded-lg p-4">
                      <div className="text-center">
                        <h3 className="text-lg font-bold mb-2">Bidding Not Available</h3>
                        <p style={{ color: 'var(--text-muted)' }}>
                          {auctionState.is_paused ? 'Auction is paused' :
                           timeRemaining <= 0 ? 'Timer has run out' :
                           'Timer is not running'}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Auctioneer Controls */}
                  {isAuctioneer && auctionState.is_active && (
                    <div className="bg-gradient-to-r from-yellow-500/10 to-orange-500/10 border border-yellow-500/20 rounded-lg p-4">
                      <div className="flex items-center gap-3 mb-3">
                        <Crown className="w-5 h-5 text-yellow-400" />
                        <h3 className="text-lg font-bold">Auctioneer Controls</h3>
                      </div>
                      <div className="grid grid-2 gap-3">
                        <button
                          onClick={auctionState.is_paused ? resumeAuction : pauseAuction}
                          className={`btn ${auctionState.is_paused ? 'btn-success' : 'btn-warning'}`}
                        >
                          {auctionState.is_paused ? (
                            <>
                              <Play className="w-4 h-4 mr-2" />
                              Resume
                            </>
                          ) : (
                            <>
                              <Pause className="w-4 h-4 mr-2" />
                              Pause
                            </>
                          )}
                        </button>
                        <button
                          onClick={() => addTime(10)}
                          className="btn btn-info"
                          title="Add 10 seconds to timer"
                        >
                          <Timer className="w-4 h-4 mr-2" />
                          +10s
                        </button>
                        <button
                          onClick={sellPlayer}
                          className="btn btn-success"
                          disabled={!auctionState.leading_team || auctionState.current_bid <= 0}
                        >
                          Sell Player
                        </button>
                        <button
                          onClick={moveToNextPlayer}
                          className="btn btn-secondary"
                        >
                          <SkipForward className="w-4 h-4 mr-2" />
                          Next Player
                        </button>
                        <button
                          onClick={endAuction}
                          className="btn btn-danger"
                          title="End and delete auction"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          End Auction
                        </button>
                      </div>
                    </div>
                  )}

                  {/* End Auction Button for Auctioneer (when auction is not active) */}
                  {isAuctioneer && !auctionState?.is_active && (
                    <div className="bg-gradient-to-r from-red-500/10 to-pink-500/10 border border-red-500/20 rounded-lg p-4">
                      <div className="flex items-center gap-3 mb-3">
                        <Crown className="w-5 h-5 text-yellow-400" />
                        <h3 className="text-lg font-bold">Auctioneer Controls</h3>
                      </div>
                      <button
                        onClick={endAuction}
                        className="btn btn-danger w-full"
                        title="End and delete auction"
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        End Auction
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-12">
                  <div className="feature-icon mb-4" style={{ background: 'var(--bg-glass)', width: '4rem', height: '4rem', margin: '0 auto' }}>
                    <Trophy className="w-8 h-8" style={{ color: 'var(--text-muted)' }} />
                  </div>
                  <h3 className="text-xl font-bold mb-2">No Player Selected</h3>
                  <p style={{ color: 'var(--text-muted)' }}>
                    {isAuctioneer ? 'Start the auction to begin bidding' : 'Waiting for auction to begin'}
                  </p>
                  {isAuctioneer && !auctionState?.is_active && (
                    <button
                      onClick={startAuction}
                      className="btn btn-primary mt-4"
                    >
                      <Play className="w-4 h-4 mr-2" />
                      Start Auction
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Player Queue - ONLY FOR AUCTIONEER */}
          {isAuctioneer && auctionState?.player_queue && auctionState.player_queue.length > 0 && (
            <div className="card">
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                <Crown className="w-5 h-5 text-yellow-400" />
                Player Queue - Auctioneer Only ({(auctionState.current_player_index || 0) + 1}/{auctionState.player_queue.length})
              </h3>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {/* Show a window of players around the current player */}
                {(() => {
                  const currentIndex = auctionState.current_player_index || 0;
                  const startIndex = Math.max(0, currentIndex - 2); // Show 2 before current
                  const endIndex = Math.min(auctionState.player_queue.length, currentIndex + 8); // Show 7 after current
                  const visiblePlayers = auctionState.player_queue.slice(startIndex, endIndex);

                  return visiblePlayers.map((player, relativeIndex) => {
                    const actualIndex = startIndex + relativeIndex;
                    const isCurrent = actualIndex === currentIndex;
                    const isNext = actualIndex === currentIndex + 1;
                    const isPast = actualIndex < currentIndex;

                    return (
                      <div
                        key={player.id}
                        className={`p-3 rounded-lg border ${
                          isCurrent 
                            ? 'bg-gradient-to-r from-green-500/20 to-emerald-500/20 border-green-500/30' 
                            : isNext
                            ? 'bg-gradient-to-r from-blue-500/10 to-purple-500/10 border-blue-500/20'
                            : isPast
                            ? 'bg-gray-500/10 border-gray-500/20 opacity-50'
                            : 'bg-gradient-to-r from-yellow-500/10 to-orange-500/10 border-yellow-500/20'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="font-medium text-sm flex items-center gap-2">
                              <span className="text-xs text-gray-400">#{actualIndex + 1}</span>
                              {player.name}
                            </div>
                            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                              {player.role} • {player.country}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-xs font-bold">
                              {formatCurrency(player.base_price)}
                            </div>
                            {isCurrent && (
                              <div className="text-xs text-green-400 font-bold">CURRENT</div>
                            )}
                            {isNext && (
                              <div className="text-xs text-blue-400 font-bold">NEXT</div>
                            )}
                            {isPast && (
                              <div className="text-xs text-gray-400">DONE</div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  });
                })()}

                {/* Show progress summary */}
                <div className="text-center p-3 border-t">
                  <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    <div className="grid grid-3 gap-2 text-center">
                      <div>
                        <div className="text-gray-400 font-bold">{auctionState.current_player_index || 0}</div>
                        <div>Completed</div>
                      </div>
                      <div>
                        <div className="text-green-400 font-bold">1</div>
                        <div>Current</div>
                      </div>
                      <div>
                        <div className="text-blue-400 font-bold">
                          {auctionState.player_queue.length - (auctionState.current_player_index || 0) - 1}
                        </div>
                        <div>Remaining</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* My Squad - FOR PARTICIPANTS */}
          {!isAuctioneer && myParticipant && (
            <div className="card">
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                <FranchiseLogo franchiseCode={myParticipant.team_short_name || ''} size="sm" />
                My Squad ({myPlayers.length} players)
              </h3>
              {myPlayers.length > 0 ? (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {myPlayers.map((playerData) => (
                    <div key={playerData.id} className="card-sm">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="font-medium text-sm">{playerData.player.name}</div>
                          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                            {playerData.player.role} • {playerData.player.country}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-bold text-green-400">
                            {formatCurrency(playerData.final_price)}
                          </div>
                          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                            Base: {formatCurrency(playerData.player.base_price)}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  <div className="pt-2 border-t">
                    <div className="text-center text-sm">
                      <div className="font-bold">Total Spent: <span className="text-red-400">{formatCurrency(myPlayers.reduce((sum, p) => sum + p.final_price, 0))}</span></div>
                      <div style={{ color: 'var(--text-muted)' }}>
                        Budget Remaining: <span className="text-green-400">{formatCurrency(myParticipant.budget_remaining)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <div className="text-4xl mb-2">🏏</div>
                  <p style={{ color: 'var(--text-muted)' }}>No players purchased yet</p>
                </div>
              )}
            </div>
          )}

          {/* Bidding History */}
          {auctionState?.current_player && (
            <div className="card">
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                <Timer className="w-5 h-5" />
                Bidding History - {auctionState.current_player.name}
              </h3>
              <BiddingHistory
                roomId={room.id}
                playerId={auctionState.current_player.id}
                participants={participants}
              />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
