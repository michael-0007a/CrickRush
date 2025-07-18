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
import { usePlayerQueue } from '@/hooks/usePlayerQueue';
import FranchiseLogo from '@/components/FranchiseLogo';
import {
  Trophy, Users, Pause, Play, SkipForward, LogOut,
  Crown, Timer, User, ChevronDown, Trash2
} from 'lucide-react';
import BiddingHistory from '@/components/BiddingHistory';
import { useSimpleTimer } from '@/hooks/useSimpleTimer';

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

  // Use the enhanced timer hook with real-time sync
  const { timeRemaining, isRunning } = useSimpleTimer(
    room?.id || '',
    auctionState?.time_remaining || 0,
    auctionState?.is_active || false,
    auctionState?.is_paused || false,
    undefined, // onTimeUpdate - handled by auction state
    async () => {
      // Auto-advance to next player when timer reaches 0
      if (isAuctioneer && auctionState?.current_player) {
        try {
          await auctionControls.nextPlayer();
        } catch (error) {
          console.error('Error auto-advancing to next player:', error);
        }
      }
    }
  );

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

        // Initialize auction state if it doesn't exist
        if (roomData.creator_id === session.user.id) {
          const { data: existingState } = await supabase
            .from('auction_state')
            .select('*')
            .eq('room_id', roomData.id)
            .single();

          if (!existingState) {
            // Create initial auction state
            await supabase
              .from('auction_state')
              .insert({
                room_id: roomData.id,
                is_active: false,
                is_paused: false,
                current_player_id: null,
                current_player_index: 0,
                current_bid: 0,
                base_price: 0,
                leading_team: null,
                current_bidder_id: null,
                time_remaining: roomData.timer_seconds || 30,
                total_players: 0,
                player_queue: [],
                sold_players: [],
                unsold_players: []
              });
          }
        }

      } catch (error) {
        router.push('/dashboard');
      } finally {
        setLoading(false);
      }
    };

    initializeApp();
  }, [roomKey, router]);

  // Real-time connection status indicator
  useEffect(() => {
    if (!isConnected && !auctionLoading) {
      console.warn('Real-time connection lost, attempting to reconnect...');
      // Optionally show a reconnection indicator to users
    }
  }, [isConnected, auctionLoading]);

  // Handle team selection with immediate refresh
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
      // No need to call refresh() - real-time subscriptions will handle the update
    } catch (error) {
      console.error('Error updating team:', error);
    }
  };

  // Handle bidding with immediate UI feedback
  const handleBid = async (amount: number) => {
    if (!myParticipant || !auctionState?.current_player) return;

    try {
      await biddingActions.placeBid(amount);
      setShowCustomBid(false);
      setCustomBidAmount('');
      // Real-time subscriptions will handle the state update
    } catch (error) {
      console.error('Error placing bid:', error);
      alert('Failed to place bid: ' + (error as Error).message);
    }
  };

  // Improved auction controls with proper error handling
  const handleStartAuction = async () => {
    if (!isAuctioneer) {
      alert('Only the auctioneer can start the auction');
      return;
    }

    try {
      await auctionControls.startAuction();
      // Real-time subscriptions will handle the state update
    } catch (error) {
      console.error('Error starting auction:', error);
      alert('Failed to start auction: ' + (error as Error).message);
    }
  };

  const handlePauseAuction = async () => {
    if (!isAuctioneer) return;

    try {
      await auctionControls.pauseAuction();
      // Real-time subscriptions will handle the state update
    } catch (error) {
      console.error('Error pausing auction:', error);
      alert('Failed to pause auction: ' + (error as Error).message);
    }
  };

  const handleResumeAuction = async () => {
    if (!isAuctioneer) return;

    try {
      await auctionControls.resumeAuction();
      // Real-time subscriptions will handle the state update
    } catch (error) {
      console.error('Error resuming auction:', error);
      alert('Failed to resume auction: ' + (error as Error).message);
    }
  };

  const handleNextPlayer = async () => {
    if (!isAuctioneer) return;

    try {
      await auctionControls.nextPlayer();
      // Real-time subscriptions will handle the state update
    } catch (error) {
      console.error('Error moving to next player:', error);
      alert('Failed to move to next player: ' + (error as Error).message);
    }
  };

  const handleAddTime = async (seconds: number) => {
    if (!isAuctioneer) return;

    try {
      await auctionControls.addTime(seconds);
      // Real-time subscriptions will handle the state update
    } catch (error) {
      console.error('Error adding time:', error);
      alert('Failed to add time: ' + (error as Error).message);
    }
  };

  // Bidding functions with immediate feedback
  const handleQuickBid = async () => {
    if (!auctionState?.current_player || !myParticipant) {
      alert('Cannot place bid at this time');
      return;
    }

    try {
      const amount = auctionState.current_bid === 0
        ? auctionState.base_price
        : auctionState.current_bid + (auctionState.current_bid < 200 ? 25 : 100);

      await biddingActions.placeBid(amount);
      // Real-time subscriptions will handle the state update
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
      // Real-time subscriptions will handle the state update
    } catch (error) {
      console.error('Error placing bid:', error);
      alert('Failed to place bid: ' + (error as Error).message);
    }
  };

  // Simplified auction controls that rely on real-time updates
  const startAuction = async () => {
    await handleStartAuction();
  };

  const pauseAuction = async () => {
    await handlePauseAuction();
  };

  const resumeAuction = async () => {
    await handleResumeAuction();
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

      // 1. Add player to winner's squad - Use a simpler approach with existing tables
      // For now, we'll track sold players in the auction_state.sold_players array
      // and update participant data directly

      const soldPlayerData = {
        id: auctionState.current_player.id,
        name: auctionState.current_player.name,
        role: auctionState.current_player.type || auctionState.current_player.role || 'ALL',
        final_price: Number(auctionState.current_bid) || 0,
        sold_to_team: auctionState.leading_team,
        sold_to_participant: leadingParticipant.id,
        purchased_at: new Date().toISOString()
      };

      // Update the auction state to include this sold player
      const updatedSoldPlayers = [...(auctionState.sold_players || []), soldPlayerData];

      // Update auction state with sold player info
      const { error: stateUpdateError } = await supabase
        .from('auction_state')
        .update({
          sold_players: updatedSoldPlayers,
          updated_at: new Date().toISOString()
        })
        .eq('room_id', room?.id);

      if (stateUpdateError) {
        console.error('Error updating auction state with sold player:', stateUpdateError);
        alert('Failed to record player sale: ' + stateUpdateError.message);
        return;
      }

      // 2. Update participant budget and player count - Fix column names
      const { error: budgetError } = await supabase
        .from('auction_participants')
        .update({
          budget_remaining: leadingParticipant.budget_remaining - auctionState.current_bid,
          squad_size: (leadingParticipant.squad_size || 0) + 1
        })
        .eq('id', leadingParticipant.id);

      if (budgetError) {
        console.error('Error updating participant budget:', budgetError);
        alert('Warning: Could not update participant budget');
        return;
      }

      // 3. Insert into bidding history (new normalized table)
      try {
        await supabase
          .from('bidding_history')
          .insert({
            room_id: room?.id,
            player_id: auctionState.current_player.id,
            team_id: auctionState.leading_team,
            bid_amount: auctionState.current_bid,
            bid_time: new Date().toISOString()
          });
      } catch (historyError) {
        console.log('Could not insert into bidding history:', historyError);
      }

      // 4. Mark player as sold in queue (new normalized approach)
      try {
        await supabase
          .from('player_queue_items')
          .update({
            is_sold: true,
            is_current: false
          })
          .eq('room_id', room?.id)
          .eq('player_id', auctionState.current_player.id);
      } catch (queueError) {
        console.log('Could not update player queue:', queueError);
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
    await handleNextPlayer();
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
    await handleAddTime(seconds);
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
                              {auctionState.current_player.type || auctionState.current_player.role}
                            </span>
                          </div>

                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>Country:</span>
                            <span className="text-sm font-medium text-white">{auctionState.current_player.nationality || auctionState.current_player.country}</span>
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
          {isAuctioneer && (
            <div className="card h-full flex flex-col">
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2 flex-shrink-0">
                <Crown className="w-5 h-5 text-yellow-400" />
                Player Queue - Auctioneer Only ({(auctionState?.current_player_index || 0) + 1}/{auctionState?.total_players || 0})
              </h3>
              <div className="space-y-2 flex-1 overflow-y-auto min-h-0">
                {/* Always show player queue for auctioneer, even when paused */}
                {(() => {
                  // Simple check - if no queue, show reload button without auto-refresh
                  if (!auctionState?.player_queue || auctionState.player_queue.length === 0) {
                    return (
                      <div className="text-center py-8 h-full flex flex-col justify-center">
                        <div className="text-4xl mb-4">🏏</div>
                        <div className="text-sm text-gray-400 mb-4">
                          Player queue not loaded
                        </div>
                        <button
                          onClick={() => refresh()}
                          className="btn btn-secondary btn-sm mx-auto"
                        >
                          Reload Queue
                        </button>
                      </div>
                    );
                  }

                  const currentIndex = auctionState.current_player_index || 0;
                  const startIndex = Math.max(0, currentIndex - 2); // Show 2 before current
                  const endIndex = Math.min(auctionState.player_queue.length, currentIndex + 8); // Show 7 after current
                  const visiblePlayers = auctionState.player_queue.slice(startIndex, endIndex);

                  return visiblePlayers.map((player, relativeIndex) => {
                    const actualIndex = startIndex + relativeIndex;
                    const isCurrent = actualIndex === currentIndex;
                    const isNext = actualIndex === currentIndex + 1;
                    const isPast = actualIndex < currentIndex;

                    // Fix base price formatting - handle different possible formats
                    const formatBasePrice = (price) => {
                      if (!price || price === 0) return '₹0L';

                      // Convert to number if it's a string
                      const numPrice = Number(price);
                      if (isNaN(numPrice)) return '₹0L';

                      // If price >= 100 lakhs, convert to crores (100L = 1Cr)
                      if (numPrice >= 100) {
                        const crores = numPrice / 100;
                        return crores % 1 === 0 ? `₹${crores}Cr` : `₹${crores.toFixed(1)}Cr`;
                      }

                      // If price is in lakhs (less than 100L)
                      if (numPrice >= 1) {
                        return numPrice % 1 === 0 ? `₹${numPrice}L` : `₹${numPrice.toFixed(1)}L`;
                      }

                      // If price is very small (decimal lakhs)
                      if (numPrice > 0) {
                        return `₹${numPrice.toFixed(1)}L`;
                      }

                      return '₹0L';
                    };

                    return (
                      <div
                        key={`${player.id}-${actualIndex}`} // Stable key to prevent re-renders
                        className={`p-4 rounded-xl border-2 ${
                          isCurrent 
                            ? 'bg-gradient-to-r from-green-500/20 to-emerald-500/20 border-green-500/50 shadow-lg shadow-green-500/20' 
                            : isNext 
                              ? 'bg-gradient-to-r from-blue-500/15 to-indigo-500/15 border-blue-500/40 shadow-md shadow-blue-500/10' 
                              : isPast 
                                ? 'bg-gray-500/10 border-gray-500/30 opacity-70' 
                                : 'bg-card border-border/40 hover:border-border/60'
                        } transition-all duration-300 hover:shadow-lg`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold border-2 ${
                              isCurrent 
                                ? 'bg-green-500 text-white border-green-400 shadow-lg' 
                                : isNext 
                                  ? 'bg-blue-500 text-white border-blue-400 shadow-md' 
                                  : isPast 
                                    ? 'bg-gray-500 text-white border-gray-400' 
                                    : 'bg-gray-100 text-gray-700 border-gray-300'
                            }`}>
                              {actualIndex + 1}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className={`font-semibold text-base truncate ${
                                isCurrent ? 'text-green-400' : isNext ? 'text-blue-400' : ''
                              }`}>
                                {player.name}
                              </div>
                              <div className="text-sm text-gray-400 flex items-center gap-2">
                                <span className="bg-blue-500/20 text-blue-400 px-2 py-1 rounded-full text-xs font-medium">
                                  {player.type || player.role || 'ALL'}
                                </span>
                                <span>•</span>
                                <span className="font-semibold text-yellow-400">
                                  Base: {formatBasePrice(player.base_price)}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            {isCurrent && (
                              <div className="text-xs font-bold text-green-400 animate-pulse bg-green-500/20 px-2 py-1 rounded-full border border-green-500/30">
                                CURRENT
                              </div>
                            )}
                            {isNext && (
                              <div className="text-xs font-bold text-blue-400 bg-blue-500/20 px-2 py-1 rounded-full border border-blue-500/30">
                                NEXT
                              </div>
                            )}
                            {isPast && (
                              <div className="text-xs text-gray-500 bg-gray-500/20 px-2 py-1 rounded-full border border-gray-500/30">
                                DONE
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          )}

          {/* My Squad - FOR PARTICIPANTS */}
          {!isAuctioneer && myParticipant && (
            <div className="card h-full flex flex-col">
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2 flex-shrink-0">
                <FranchiseLogo franchiseCode={myParticipant.team_short_name || ''} size="sm" />
                My Squad ({(() => {
                  // Get my players from the auction state sold_players array
                  const myPurchasedPlayers = (auctionState?.sold_players || []).filter(
                    player => player.sold_to_participant === myParticipant.id
                  );
                  return myPurchasedPlayers.length;
                })()} players)
              </h3>
              {(() => {
                // Get my players from the auction state sold_players array
                const myPurchasedPlayers = (auctionState?.sold_players || []).filter(
                  player => player.sold_to_participant === myParticipant.id
                );

                if (myPurchasedPlayers.length > 0) {
                  return (
                    <div className="flex flex-col flex-1 min-h-0">
                      <div className="space-y-2 flex-1 overflow-y-auto">
                        {myPurchasedPlayers.map((playerData) => (
                          <div key={playerData.id} className="card-sm">
                            <div className="flex items-center justify-between">
                              <div className="flex-1">
                                <div className="font-medium text-sm">{playerData.name}</div>
                                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                  {playerData.role} • Purchased for {formatCurrency(playerData.final_price)}
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="text-sm font-bold text-green-400">
                                  {formatCurrency(playerData.final_price)}
                                </div>
                                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                  Just bought!
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="pt-2 border-t flex-shrink-0">
                        <div className="text-center text-sm">
                          <div className="font-bold">Total Spent: <span className="text-red-400">
                            {formatCurrency(myPurchasedPlayers.reduce((sum, p) => sum + p.final_price, 0))}
                          </span></div>
                          <div style={{ color: 'var(--text-muted)' }}>
                            Budget Remaining: <span className="text-green-400">{formatCurrency(myParticipant.budget_remaining)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                } else {
                  return (
                    <div className="text-center py-8 flex-1 flex flex-col justify-center">
                      <div className="text-4xl mb-2">🏏</div>
                      <p style={{ color: 'var(--text-muted)' }}>No players purchased yet</p>
                      <p className="text-sm mt-2" style={{ color: 'var(--text-muted)' }}>
                        Start bidding to build your squad!
                      </p>
                    </div>
                  );
                }
              })()}
            </div>
          )}

          {/* Bidding History */}
          {false && auctionState?.current_player && (
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
