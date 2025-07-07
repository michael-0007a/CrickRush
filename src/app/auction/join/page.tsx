import { Suspense } from 'react';
import JoinAuctionClient from './JoinAuctionClient';

/**
 * @fileoverview Join Auction Page - Server Component Wrapper
 * Handles the Suspense boundary required for useSearchParams() in Next.js 15
 * Wraps the client component to prevent build errors during static generation
 */
export default function JoinAuctionPage() {
  return (
    <Suspense fallback={
      <div className="loading">
        <div className="spinner"></div>
        <p style={{ color: 'var(--text-muted)' }}>Loading auction details...</p>
      </div>
    }>
      <JoinAuctionClient />
    </Suspense>
  );
}
