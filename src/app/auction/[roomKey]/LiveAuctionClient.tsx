/**
 * @fileoverview Live Auction Client Component
 * Contains the main auction room logic with useParams() hook
 */
'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useAuctionRealtime } from '@/hooks/useAuctionRealtime';
import { useAuctionTimer } from '@/hooks/useAuctionTimer';
import { useMySquad } from '@/hooks/useMySquad';
import FranchiseLogo from '@/components/FranchiseLogo';
import {
  Trophy, Users, Pause, Play, SkipForward, LogOut,
  Crown, Timer, User, ChevronDown, Trash2
} from 'lucide-react';

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

  // Use new hooks - FIXED to use event-driven updates
  const {
    auctionState,
    loading: auctionLoading
  } = useAuctionRealtime(room?.id || '', user?.id || null);

  // Use the new synchronized timer hook
  const {
    timeRemaining,
    isRunning: timerRunning,
    loading: timerLoading,
    hasExpired,
    startTimer,
    stopTimer,
    resetTimer,
    addTime
  } = useAuctionTimer(room?.id || '', isAuctioneer);

  // FIXED: Load participants directly since the hook is failing with 406 errors
  const [participants, setParticipants] = useState<Participant[]>([]);

  // Load participants directly
  useEffect(() => {
    const loadParticipants = async () => {
      if (!room?.id) return;

      try {
        const { data: participantData, error } = await supabase
          .from('auction_participants')
          .select(`
            *,
            ipl_franchises (
              id,
              name,
              short_name,
              color,
              logo,
              city
            )
          `)
          .eq('auction_room_id', room.id);

        if (error) {
          // Handle error silently
        } else {
          // Map the franchise data properly to the participant
          const mappedParticipants = participantData?.map(participant => ({
            ...participant,
            team_short_name: participant.ipl_franchises?.short_name,
            team_name: participant.ipl_franchises?.name,
            team_color: participant.ipl_franchises?.color,
            team_logo: participant.ipl_franchises?.logo,
            team_city: participant.ipl_franchises?.city
          })) || [];

          setParticipants(mappedParticipants);
        }
      } catch (error) {
        // Handle error silently
      }
    };

    loadParticipants();

    // Set up real-time subscription to reload participants when changes occur
    const channel = supabase
      .channel('participants-changes')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'auction_participants', filter: `auction_room_id=eq.${room?.id}` },
        () => {
          loadParticipants();
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [room?.id]);

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

  // Check if user needs to join auction - FIXED to prevent infinite loops
  useEffect(() => {
    if (loading || auctionLoading || !room || !user) {
      return;
    }

    // Don't redirect - just log the status
    if (!myParticipant && !isAuctioneer) {
      // User needs to join but staying on this page to avoid infinite loop
    }
  }, [room, user, loading, auctionLoading, myParticipant, isAuctioneer, participants]);

  // Load available teams for selection
  const loadAvailableTeams = async () => {
    if (!room) return;

    try {
      // Get all franchises
      const { data: franchises } = await supabase
        .from('ipl_franchises')
        .select('*')
        .order('name');

      // Get taken teams
      const { data: takenTeams } = await supabase
        .from('auction_participants')
        .select('team_id')
        .eq('auction_room_id', room.id)
        .not('team_id', 'is', null);

      const takenTeamIds = new Set(takenTeams?.map(t => t.team_id) || []);

      const teamsWithAvailability = franchises?.map(team => ({
        ...team,
        available: !takenTeamIds.has(team.id)
      })) || [];

      setAvailableTeams(teamsWithAvailability);
    } catch (error) {
      // Handle error silently
    }
  };

  // Join auction with selected team
  const joinWithTeam = async () => {
    if (!room || !selectedTeam || !user) {
      alert('Please select a team before joining');
      return;
    }

    try {
      const { data: insertedParticipant, error } = await supabase
        .from('auction_participants')
        .insert({
          auction_room_id: room.id,
          user_id: user.id,
          team_id: selectedTeam,
          budget_remaining: room.budget_per_team,
          players_count: 0,
          is_auctioneer: false
        })
        .select(`
          *,
          ipl_franchises (
            id,
            name,
            short_name,
            color,
            logo,
            city
          )
        `)
        .single();

      if (error) throw error;

      setShowTeamSelector(false);
      alert('Successfully joined the auction!');

      // Reload the page to refresh participant data
      window.location.reload();

    } catch (error) {
      alert('Failed to join auction: ' + (error as Error).message);
    }
  };

  // Bidding functions
  const placeBid = async (amount: number) => {
    if (!room || !myParticipant || !auctionState?.current_player) {
      throw new Error('Invalid auction state');
    }

    try {
      // Update auction state - DO NOT manually update time_remaining
      // Let the SQL trigger handle the 10-second increment automatically
      const { error } = await supabase
        .from('auction_state')
        .update({
          current_bid: amount,
          leading_team: myParticipant.team_id
          // Removed time_remaining update to allow SQL trigger to handle it
        })
        .eq('room_id', room.id);

      if (error) throw error;

      // Log the bid placement event
      console.log(`Bid placed: ${amount} by ${myParticipant.team_short_name} (${myParticipant.id})`);

      // Add time to the auction timer
      addTime(10);

    } catch (error) {
      alert('Bid placement failed: ' + (error as Error).message);
    }
  };

  const handleQuickBid = async () => {
    if (!auctionState?.current_player) {
      alert('No player is currently being auctioned');
      return;
    }

    // Check if user has joined the auction
    if (!myParticipant) {
      alert('You need to join the auction first before placing bids');
      return;
    }

    if (!myParticipant.team_id) {
      alert('You need to select a team before placing bids. Please refresh the page and try again.');
      return;
    }

    // Check player limit before bidding
    if (myPlayers.length >= room.players_per_team) {
      alert(`You cannot bid anymore! You have reached the maximum limit of ${room.players_per_team} players per team.`);
      return;
    }

    try {
      const amount = auctionState.current_bid === 0
        ? auctionState.current_player.base_price
        : auctionState.current_bid + (auctionState.current_bid < 200 ? 25 : 100);

      await placeBid(amount);
    } catch (error) {
      const errorMessage = (error as Error).message;

      // Handle specific error cases
      if (errorMessage.includes('not registered')) {
        alert('You are not registered for this auction. Please join the auction first.');
      } else if (errorMessage.includes('select a team')) {
        alert('You need to select a team before placing bids.');
      } else {
        alert('Failed to place bid: ' + errorMessage);
      }
    }
  };

  const handleCustomBid = async () => {
    const amount = parseInt(customBidAmount);
    if (isNaN(amount) || amount <= 0) {
      alert('Please enter a valid bid amount');
      return;
    }

    // Check if user has joined the auction
    if (!myParticipant) {
      alert('You need to join the auction first before placing bids');
      return;
    }

    if (!myParticipant.team_id) {
      alert('You need to select a team before placing bids. Please refresh the page and try again.');
      return;
    }

    if (!auctionState?.current_player) {
      alert('No player is currently being auctioned');
      return;
    }

    // Check player limit before bidding
    if (myPlayers.length >= room.players_per_team) {
      alert(`You cannot bid anymore! You have reached the maximum limit of ${room.players_per_team} players per team.`);
      return;
    }

    // Validate bid amount limits
    const currentBid = auctionState.current_bid || 0;
    const basePrice = auctionState.current_player?.base_price || 50;
    const minimumBid = currentBid === 0 ? basePrice : currentBid + 25;
    const maximumBid = currentBid === 0 ? basePrice + 150 : currentBid + 150; // Max 1.5cr above current bid

    if (amount < minimumBid) {
      alert(`Bid must be at least ₹${minimumBid}L`);
      return;
    }

    if (amount > maximumBid) {
      alert(`Bid cannot exceed ₹${maximumBid}L (maximum 1.5cr above current bid)`);
      return;
    }

    try {
      await placeBid(amount);
      setCustomBidAmount('');
      setShowCustomBid(false);
    } catch (error) {
      const errorMessage = (error as Error).message;

      // Handle specific error cases
      if (errorMessage.includes('not registered')) {
        alert('You are not registered for this auction. Please join the auction first.');
      } else if (errorMessage.includes('select a team')) {
        alert('You need to select a team before placing bids.');
      } else {
        alert('Failed to place bid: ' + errorMessage);
      }
    }
  };

  // Auctioneer functions
  const startAuction = async () => {
    if (!room || !isAuctioneer) {
      alert('Only the auctioneer can start the auction');
      return;
    }

    try {
      // Get players from database
      const { data: players } = await supabase
        .from('players')
        .select('*')
        .limit(50);

      if (!players || players.length === 0) {
        alert('No players found in database');
        return;
      }

      // Shuffle players
      const shuffledPlayers = [...players].sort(() => Math.random() - 0.5);
      const firstPlayer = shuffledPlayers[0];

      // Update auction state
      const { error } = await supabase
        .from('auction_state')
        .upsert({
          room_id: room.id,
          is_active: true,
          is_paused: false,
          current_player: firstPlayer,
          current_player_index: 0,
          current_bid: 0,
          base_price: firstPlayer.base_price,
          leading_team: null,
          time_remaining: room.timer_seconds || 30,
          player_queue: shuffledPlayers,
          sold_players: [],
          unsold_players: []
        }, { onConflict: 'room_id' });

      if (error) throw error;

      // Update room status
      await supabase
        .from('auction_rooms')
        .update({ status: 'active' })
        .eq('id', room.id);

      // Start the synchronized timer
      await startTimer(room.timer_seconds || 30);

    } catch (error) {
      alert('Failed to start auction: ' + (error as Error).message);
    }
  };

  const pauseAuction = async () => {
    if (!room || !isAuctioneer) return;

    try {
      // Update auction state
      const { error } = await supabase
        .from('auction_state')
        .update({ is_paused: true })
        .eq('room_id', room.id);

      if (error) throw error;

      // Also stop the synchronized timer
      await stopTimer();
    } catch (error) {
      // Handle error silently
    }
  };

  const resumeAuction = async () => {
    if (!room || !isAuctioneer) return;

    try {
      // Update auction state
      const { error } = await supabase
        .from('auction_state')
        .update({ is_paused: false })
        .eq('room_id', room.id);

      if (error) throw error;

      // Also start the synchronized timer with current time remaining
      await startTimer(timeRemaining);
    } catch (error) {
      // Handle error silently
    }
  };

  const sellPlayer = async () => {
    if (!room || !isAuctioneer || !auctionState?.current_player) {
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

      // Record the sale
      const { error: playerError } = await supabase
        .from('auction_players')
        .insert({
          auction_room_id: room.id,
          player_id: auctionState.current_player.id,
          team_id: auctionState.leading_team,
          participant_id: leadingParticipant.id,
          final_price: auctionState.current_bid
        });

      if (playerError) throw playerError;

      // Update participant budget
      const { error: budgetError } = await supabase
        .from('auction_participants')
        .update({
          budget_remaining: leadingParticipant.budget_remaining - auctionState.current_bid,
          players_count: leadingParticipant.players_count + 1
        })
        .eq('id', leadingParticipant.id);

      if (budgetError) throw budgetError;

      alert(`Player sold to ${leadingParticipant.team_short_name} for ${formatCurrency(auctionState.current_bid)}!`);

      // Move to next player
      moveToNextPlayer();

    } catch (error) {
      alert('Failed to sell player: ' + (error as Error).message);
    }
  };

  const moveToNextPlayer = async () => {
    if (!room || !isAuctioneer) return;

    try {
      // Get current state
      const { data: currentState } = await supabase
        .from('auction_state')
        .select('*')
        .eq('room_id', room.id)
        .single();

      if (!currentState || !currentState.player_queue) return;

      const nextIndex = (currentState.current_player_index || 0) + 1;

      if (nextIndex >= currentState.player_queue.length) {
        // End auction
        await supabase
          .from('auction_state')
          .update({
            is_active: false,
            is_paused: false
          })
          .eq('room_id', room.id);

        alert('Auction completed!');
        return;
      }

      const nextPlayer = currentState.player_queue[nextIndex];

      // Update to next player
      const { error } = await supabase
        .from('auction_state')
        .update({
          current_player: nextPlayer,
          current_player_index: nextIndex,
          current_bid: 0,
          base_price: nextPlayer.base_price,
          leading_team: null,
          time_remaining: room.timer_seconds || 30
        })
        .eq('room_id', room.id);

      if (error) throw error;

      // Reset timer to 30 seconds for new player
      await resetTimer(room.timer_seconds || 30);

    } catch (error) {
      alert('Failed to move to next player: ' + (error as Error).message);
    }
  };

  const endAuction = async () => {
    if (!room || !isAuctioneer) {
      alert('Only the auctioneer can end the auction');
      return;
    }

    if (!confirm(`Are you sure you want to end and delete the auction "${room.name}"? This action cannot be undone and will remove all participants from the room.`)) {
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

      // Redirect to dashboard
      router.push('/dashboard');

    } catch (error) {
      alert('Failed to end auction: ' + (error as Error).message);
    }
  };

  // Debugging: Log auction state and participant info
  useEffect(() => {
    if (room && user) {
      console.log('Auction Room:', room);
      console.log('User:', user);
      console.log('My Participant:', myParticipant);
      console.log('Auction State:', auctionState);
    }
  }, [room, user, myParticipant, auctionState]);

  // Format currency helper
  const formatCurrency = (amount: number) => {
    if (!amount || amount === 0) return '0L';
    if (amount >= 100) {
      return `${(amount / 100).toFixed(1)}Cr`;
    }
    return `${amount}L`;
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
      router.push('/auth');
    } catch (error) {
      // Handle error silently
    }
  };

  if (loading) {
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

      {/* Show franchise selection for users who haven't joined */}
      {!myParticipant && !isAuctioneer && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.9)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 50,
        }}>
          <div className="card card-lg" style={{ maxWidth: '64rem', width: '90%', maxHeight: '80vh', overflow: 'auto' }}>
            <div className="text-center mb-6">
              <div className="feature-icon mb-4" style={{ background: 'linear-gradient(135deg, var(--primary-purple) 0%, var(--primary-cyan) 100%)', width: '4rem', height: '4rem', margin: '0 auto' }}>
                <Users className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-2xl font-bold mb-2">Join {room.name}</h2>
              <p style={{ color: 'var(--text-muted)' }}>
                Select an IPL franchise to join this auction
              </p>
            </div>

            <div className="grid grid-5 gap-4 mb-6">
              {availableTeams.map((team) => (
                <button
                  key={team.id}
                  onClick={() => setSelectedTeam(team.id)}
                  disabled={!team.available}
                  className={`card-sm text-center p-4 transition-all ${
                    selectedTeam === team.id ? 'ring-2 ring-blue-500' : ''
                  } ${!team.available ? 'opacity-50 cursor-not-allowed' : 'hover:scale-105'}`}
                  style={{
                    backgroundColor: team.available ? 'var(--card-bg)' : 'var(--background-muted)',
                    borderColor: selectedTeam === team.id ? team.color : 'var(--border-default)'
                  }}
                >
                  <div className="mb-3 flex justify-center">
                    <FranchiseLogo franchiseCode={team.short_name} size="xl" />
                  </div>
                  <div className="font-bold text-sm">{team.short_name}</div>
                  <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {team.city}
                  </div>
                  {!team.available && (
                    <div className="text-xs text-red-400 mt-1">Taken</div>
                  )}
                </button>
              ))}
            </div>

            <div className="flex gap-4">
              <button
                onClick={() => router.push('/dashboard')}
                className="btn btn-secondary flex-1"
              >
                Cancel
              </button>
              <button
                onClick={joinWithTeam}
                disabled={!selectedTeam}
                className="btn btn-primary flex-1"
              >
                Join Auction
              </button>
            </div>
          </div>
        </div>
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
                  {myParticipant && auctionState.is_active && !auctionState.is_paused && timeRemaining > 0 && timerRunning && (
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
                  {myParticipant && auctionState.is_active && (timeRemaining <= 0 || !timerRunning || auctionState.is_paused) && (
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

          {/* Sidebar */}
          <div className="space-y-6">
            {/* My Team Info */}
            {myParticipant && (
              <div className="card">
                <h3 className="text-lg font-bold mb-4">My Team</h3>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <FranchiseLogo franchiseCode={myParticipant.team_short_name || ''} size="md" />
                    <div>
                      <div className="font-bold">{myParticipant.team_short_name}</div>
                      <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
                        Budget: {formatCurrency(myParticipant.budget_remaining)}
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-1 gap-4">
                    <div className="text-center p-3 bg-gradient-to-br from-green-500/10 to-blue-500/10 rounded-lg">
                      <div className="text-lg font-bold">{myPlayers.length}</div>
                      <div className="text-xs" style={{ color: 'var(--text-muted)' }}>In Squad</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* My Squad */}
            {myParticipant && (
              <div className="card">
                <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                  <Trophy className="w-5 h-5" />
                  My Squad ({myPlayers.length})
                </h3>
                {myPlayers.length > 0 ? (
                  <div className="space-y-3">
                    {myPlayers.map((player) => (
                      <div key={player.id} className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/20 rounded-lg p-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-medium text-sm">{player.player.name}</div>
                            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                              {player.player.role} • {player.player.country}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-bold text-green-400">
                              {formatCurrency(player.final_price)}
                            </div>
                            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                              Base: {formatCurrency(player.player.base_price)}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                    <div className="mt-4 p-3 bg-gradient-to-r from-green-500/10 to-emerald-500/10 border border-green-500/20 rounded-lg">
                      <div className="flex justify-between items-center">
                        <span className="font-medium">Total Spent:</span>
                        <span className="font-bold text-green-400">
                          {formatCurrency(myPlayers.reduce((total, p) => total + p.final_price, 0))}
                        </span>
                      </div>
                    </div>
                    <div className="p-3 bg-gradient-to-r from-blue-500/10 to-cyan-500/10 border border-blue-500/20 rounded-lg">
                      <div className="flex justify-between items-center">
                        <span className="font-medium">Remaining Balance:</span>
                        <span className="font-bold text-blue-400">
                          {formatCurrency(room.budget_per_team - myPlayers.reduce((total, p) => total + p.final_price, 0))}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-6">
                    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                      No players purchased yet
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Participants */}
            <div className="card">
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                <Users className="w-5 h-5" />
                Teams ({participants.length}/{room.max_participants})
              </h3>
              <div className="space-y-3">
                {participants.map((participant) => (
                  <div key={participant.id} className="card-sm">
                    <div className="flex items-center gap-3">
                      <FranchiseLogo franchiseCode={participant.team_short_name || ''} size="md" />
                      <div className="flex-1">
                        <div className="font-medium flex items-center gap-2">
                          {participant.team_short_name}
                          {participant.is_auctioneer && (
                            <Crown className="w-4 h-4" style={{ color: 'var(--accent-yellow)' }} />
                          )}
                        </div>
                        <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
                          {formatCurrency(participant.budget_remaining)} left
                        </div>
                      </div>
                      {participant.user_id === user?.id && (
                        <div className="text-sm font-medium" style={{ color: 'var(--accent-green)' }}>You</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
