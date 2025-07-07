import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { createClient } from '@supabase/supabase-js';

// Create admin client for user deletion
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!, // This should be set in your .env.local
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

export async function POST(request: NextRequest) {
  try {
    const { userId, confirmText } = await request.json();

    // Validate confirmation text
    if (confirmText !== "DELETE MY ACCOUNT PERMANENTLY") {
      return NextResponse.json(
        { error: 'Invalid confirmation text' },
        { status: 400 }
      );
    }

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }

    // Get user's current session to verify they own this account
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json(
        { error: 'Authorization header required' },
        { status: 401 }
      );
    }

    // Verify the user's JWT token
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user || user.id !== userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    console.log(`Starting account deletion for user: ${userId}`);

    // 1. Delete user's auction participants
    const { error: participantsError } = await supabaseAdmin
      .from('auction_participants')
      .delete()
      .eq('user_id', userId);

    if (participantsError) {
      console.error('Error deleting auction participants:', participantsError);
    }

    // 2. Delete auction rooms created by user
    const { error: roomsError } = await supabaseAdmin
      .from('auction_rooms')
      .delete()
      .eq('creator_id', userId);

    if (roomsError) {
      console.error('Error deleting auction rooms:', roomsError);
    }

    // 3. Get and delete profile images from storage
    const { data: profile } = await supabaseAdmin
      .from('users_profiles')
      .select('avatar_url')
      .eq('id', userId)
      .single();

    if (profile?.avatar_url && profile.avatar_url.includes('supabase')) {
      const urlParts = profile.avatar_url.split('/');
      const fileName = urlParts[urlParts.length - 1];
      const filePath = `${userId}/${fileName}`;

      const { error: storageError } = await supabaseAdmin.storage
        .from('users_profiles')
        .remove([filePath]);

      if (storageError) {
        console.error('Error deleting profile image:', storageError);
      }
    }

    // 4. Delete user profile
    const { error: profileError } = await supabaseAdmin
      .from('users_profiles')
      .delete()
      .eq('id', userId);

    if (profileError) {
      console.error('Error deleting user profile:', profileError);
    }

    // 5. Finally, delete the auth user (this is the key part that requires admin privileges)
    const { error: deleteUserError } = await supabaseAdmin.auth.admin.deleteUser(userId);

    if (deleteUserError) {
      console.error('Error deleting auth user:', deleteUserError);
      return NextResponse.json(
        { error: 'Failed to delete user account' },
        { status: 500 }
      );
    }

    console.log(`Successfully deleted account for user: ${userId}`);

    return NextResponse.json({
      success: true,
      message: 'Account deleted successfully'
    });

  } catch (error) {
    console.error('Error in delete account API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
