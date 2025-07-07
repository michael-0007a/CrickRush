import { Suspense } from 'react';
import LiveAuctionClient from './LiveAuctionClient';

/**
 * @fileoverview Live Auction Page - Server Component Wrapper
 * Handles the Suspense boundary required for useParams() in Next.js 15
 * Wraps the client component to prevent build errors during static generation
 */
export default function LiveAuctionPage() {
  return (
    <Suspense fallback={
      <div className="loading">
        <div className="spinner"></div>
        <p style={{ color: 'var(--text-muted)' }}>Loading auction room...</p>
      </div>
    }>
      <LiveAuctionClient />
    </Suspense>
  );
}
