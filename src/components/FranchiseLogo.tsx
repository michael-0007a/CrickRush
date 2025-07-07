/**
 * @fileoverview React component for displaying IPL franchise logos
 * Provides a standardized way to display team logos with different sizes
 */

import Image from 'next/image';

/**
 * Props interface for the FranchiseLogo component
 */
interface FranchiseLogoProps {
  /** The franchise code (e.g., 'CSK', 'MI', 'RCB') */
  franchiseCode: string;
  /** Size of the logo - defaults to 'md' */
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  /** Additional CSS classes to apply */
  className?: string;
}

/**
 * Mapping of size names to pixel values for consistent logo sizing
 */
const sizeMap = {
  xs: 16,    // 16px
  sm: 24,    // 24px
  md: 32,    // 32px
  lg: 48,    // 48px
  xl: 64,    // 64px
  '2xl': 80  // 80px
};

/**
 * FranchiseLogo component for displaying IPL team logos
 *
 * @param props - Component props
 * @param props.franchiseCode - The franchise code (e.g., 'CSK', 'MI', 'RCB')
 * @param props.size - Size of the logo (default: 'md')
 * @param props.className - Additional CSS classes
 * @returns JSX element containing the franchise logo
 *
 * @example
 * ```tsx
 * <FranchiseLogo franchiseCode="CSK" size="lg" className="rounded-full" />
 * ```
 */
export default function FranchiseLogo({ franchiseCode, size = 'md', className = '' }: FranchiseLogoProps) {
  const pixelSize = sizeMap[size];

  /**
   * Map franchise codes to logo filenames
   * All logos are stored in the /public directory
   */
  const logoMap: Record<string, string> = {
    'CSK': '/CSK.png',
    'MI': '/MI.png',
    'RCB': '/RCB.png',
    'KKR': '/KKR.png',
    'DC': '/DC.png',
    'SRH': '/SRH.png',
    'PBKS': '/PBKS.png',
    'RR': '/RR.png',
    'GT': '/GT.png',
    'LSG': '/LSG.png'
  };

  // Get logo path or use default if franchise code not found
  const logoPath = logoMap[franchiseCode] || '/next.svg';

  return (
    <div
      className={`franchise-logo ${className}`}
      style={{ width: pixelSize, height: pixelSize }}
    >
      <Image
        src={logoPath}
        alt={`${franchiseCode} Logo`}
        width={pixelSize}
        height={pixelSize}
        className="object-contain"
        priority
      />
    </div>
  );
}
