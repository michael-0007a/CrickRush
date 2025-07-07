/**
 * @fileoverview Supabase client configuration and utility functions
 * Provides database connection and helper functions for currency formatting and bid calculations
 */

import { createClient } from '@supabase/supabase-js'

// Environment variables for Supabase connection
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

/**
 * Supabase client instance for database operations
 * Configured with environment variables for URL and anonymous key
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

/**
 * Helper function to format currency from paisa to readable format
 * Converts numerical values to human-readable currency strings
 *
 * @param amountInPaisa - Amount in paisa (smallest currency unit)
 * @returns Formatted currency string with appropriate suffix (Cr/L)
 *
 * @example
 * ```typescript
 * formatCurrency(500000000) // Returns "₹5.0Cr"
 * formatCurrency(10000000)  // Returns "₹1.0Cr"
 * formatCurrency(500000)    // Returns "₹5.0L"
 * ```
 */
export const formatCurrency = (amountInPaisa: number): string => {
  if (amountInPaisa >= 1000000000) return `₹${(amountInPaisa / 1000000000).toFixed(1)}Cr`;
  if (amountInPaisa >= 10000000) return `₹${(amountInPaisa / 10000000).toFixed(1)}Cr`;
  if (amountInPaisa >= 100000) return `₹${(amountInPaisa / 100000).toFixed(1)}L`;
  return `₹${(amountInPaisa / 100).toLocaleString()}`;
};

/**
 * Helper function to get bid increment based on current bid
 * Determines the minimum bid increment for the next bid
 *
 * @param currentBidInPaisa - Current bid amount in paisa
 * @returns Bid increment amount in paisa
 *
 * @example
 * ```typescript
 * getBidIncrement(200000000) // Returns 25000000 (₹25L increment)
 * getBidIncrement(400000000) // Returns 100000000 (₹1Cr increment)
 * ```
 */
export const getBidIncrement = (currentBidInPaisa: number): number => {
  if (currentBidInPaisa < 20000000) return 2500000; // Below ₹2Cr: ₹25L increment
  return 10000000; // Above ₹2Cr: ₹1Cr increment
};
